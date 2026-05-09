"""Single HTTP scaffold for Cloudflare Workers AI.

`language_model` and `case_brief_generator` build their own prompts and
parse their own responses, but the request shape (URL, headers, payload
envelope, streaming line protocol) is shared. Centralising it here means
one place for retries, telemetry, model fallback, or an async migration.

Two response shapes coexist on Workers AI:

- **Native** (Llama, Mistral, Qwen, …): `result.response = "text"`.
- **OpenAI-compatible** (gpt-oss-*, future imports):
  `result.choices[0].message.content = "text"`. Streaming chunks use
  `delta.content` instead of `response`. Same models also emit
  `reasoning_content` in `message`; we ignore it (the cleaned answer
  is in `content`).

`_extract_text` / `_extract_stream_chunk` try native first, fall through
to OpenAI-compat. New models that follow either convention just work.

Telemetry: each call optionally takes an `on_complete` callback fired
exactly once after the call ends — success, error, or timeout — with
wall-clock latency, model id, status, and (when the API supplies them)
token counts. The caller persists the metrics through its own DB
session; we don't touch the database from here so this module stays
sync-friendly and easy to reason about.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Generator, List, Optional

import requests

from app.core.settings import settings

logger = logging.getLogger(__name__)


class CloudflareAIError(Exception):
    """Cloudflare returned a non-success body, or the HTTP call failed."""


@dataclass(frozen=True)
class LlmCallMetrics:
    """Per-call telemetry. The caller fills in the FK columns
    (user_id, matter_id, …) when persisting; this object only carries
    the data cloudflare_ai itself can observe."""
    model: str
    latency_ms: int
    status: str  # 'success' | 'error' | 'timeout'
    ttft_ms: Optional[int] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    error_class: Optional[str] = None


OnComplete = Callable[[LlmCallMetrics], None]


def is_configured() -> bool:
    return bool(settings.CLOUDFLARE_API_TOKEN and settings.CLOUDFLARE_ACCOUNT_ID)


def _endpoint(model: str) -> str:
    return (
        "https://api.cloudflare.com/client/v4/accounts/"
        f"{settings.CLOUDFLARE_ACCOUNT_ID}/ai/run/{model}"
    )


def _headers() -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json",
    }


def _emit(on_complete: Optional[OnComplete], metrics: LlmCallMetrics) -> None:
    if on_complete is None:
        return
    try:
        on_complete(metrics)
    except Exception:
        # Telemetry must never crash a real request. Swallow + log.
        logger.exception("on_complete callback raised")


def _usage_tokens(body: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    """Cloudflare returns `result.usage = {prompt_tokens, completion_tokens}`
    on supported models. Older models may omit it — return Nones."""
    usage = (body.get("result") or {}).get("usage") or {}
    return usage.get("prompt_tokens"), usage.get("completion_tokens")


def _extract_text(body: Dict[str, Any]) -> Optional[str]:
    """Pull the assistant's text out of a Cloudflare response. Tries the
    native shape (`result.response`) first because most models still use
    it; falls through to the OpenAI-compat shape
    (`result.choices[0].message.content`) for gpt-oss-* and similar."""
    result = body.get("result") or {}
    text = result.get("response")
    if isinstance(text, str):
        return text
    choices = result.get("choices") or []
    if choices:
        message = (choices[0] or {}).get("message") or {}
        content = message.get("content")
        if isinstance(content, str):
            return content
    return None


def _extract_stream_chunk(chunk: Dict[str, Any]) -> str:
    """Per-chunk text extraction for streaming. Same two shapes as
    `_extract_text`: native `{"response": "text"}`, OpenAI-compat
    `{"choices": [{"delta": {"content": "text"}}]}`."""
    text = chunk.get("response")
    if isinstance(text, str) and text:
        return text
    choices = chunk.get("choices") or []
    if choices:
        delta = (choices[0] or {}).get("delta") or {}
        content = delta.get("content")
        if isinstance(content, str):
            return content
    return ""


def chat_completion(
    messages: List[Dict[str, str]],
    *,
    model: str,
    max_tokens: int = 1024,
    temperature: float | None = None,
    timeout: float = 60,
    on_complete: Optional[OnComplete] = None,
) -> str:
    """Non-streaming chat completion. Returns the model's text response.

    `model` is the Cloudflare slug — e.g. `@cf/openai/gpt-oss-120b`. Each
    caller passes its routing constant (settings.CLOUDFLARE_LLM_MODEL_*).

    Raises CloudflareAIError when the API reports `success: false` or the
    response body is missing the expected shape.
    """
    payload: Dict[str, Any] = {"messages": messages, "max_tokens": max_tokens}
    if temperature is not None:
        payload["temperature"] = temperature

    t0 = time.perf_counter()
    try:
        resp = requests.post(_endpoint(model), headers=_headers(), json=payload, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success", True):
            raise CloudflareAIError(f"Cloudflare AI error: {body.get('errors')}")
        text = _extract_text(body)
        if text is None:
            raise CloudflareAIError(f"Unexpected Cloudflare AI response shape: {body}")
        latency_ms = int((time.perf_counter() - t0) * 1000)
        in_tok, out_tok = _usage_tokens(body)
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=latency_ms,
            status="success",
            input_tokens=in_tok,
            output_tokens=out_tok,
        ))
        return text
    except requests.exceptions.Timeout as exc:
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            status="timeout",
            error_class=type(exc).__name__,
        ))
        raise
    except Exception as exc:
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=int((time.perf_counter() - t0) * 1000),
            status="error",
            error_class=type(exc).__name__,
        ))
        raise


def chat_completion_stream(
    messages: List[Dict[str, str]],
    *,
    model: str,
    max_tokens: int = 2048,
    timeout: float = 90,
    on_complete: Optional[OnComplete] = None,
) -> Generator[str, None, None]:
    """Streaming chat completion. Yields each text chunk as it arrives.

    Handles both the native Cloudflare shape and the OpenAI-compatible
    shape via `_extract_stream_chunk`. Each line is `data: {…}` and a
    final `data: [DONE]`. Malformed lines are skipped.

    `on_complete` is called once after the stream ends — successfully or
    with an exception — with `ttft_ms` set to time-to-first-token.
    """
    payload = {"messages": messages, "stream": True, "max_tokens": max_tokens}

    t0 = time.perf_counter()
    first_token_at: Optional[float] = None
    try:
        resp = requests.post(
            _endpoint(model),
            headers=_headers(),
            json=payload,
            stream=True,
            timeout=timeout,
        )
        resp.raise_for_status()

        for line in resp.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                decoded = decoded[6:]
            if decoded == "[DONE]":
                break
            try:
                chunk = json.loads(decoded)
            except json.JSONDecodeError:
                continue
            text = _extract_stream_chunk(chunk)
            if text:
                if first_token_at is None:
                    first_token_at = time.perf_counter()
                yield text

        end = time.perf_counter()
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=int((end - t0) * 1000),
            ttft_ms=int((first_token_at - t0) * 1000) if first_token_at else None,
            status="success",
        ))
    except requests.exceptions.Timeout as exc:
        end = time.perf_counter()
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=int((end - t0) * 1000),
            ttft_ms=int((first_token_at - t0) * 1000) if first_token_at else None,
            status="timeout",
            error_class=type(exc).__name__,
        ))
        raise
    except Exception as exc:
        end = time.perf_counter()
        _emit(on_complete, LlmCallMetrics(
            model=model,
            latency_ms=int((end - t0) * 1000),
            ttft_ms=int((first_token_at - t0) * 1000) if first_token_at else None,
            status="error",
            error_class=type(exc).__name__,
        ))
        raise

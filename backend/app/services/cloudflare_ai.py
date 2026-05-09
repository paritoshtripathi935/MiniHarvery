"""Single HTTP scaffold for Cloudflare Workers AI.

`language_model` and `case_brief_generator` build their own prompts and
parse their own responses, but the request shape (URL, headers, payload
envelope, streaming line protocol) is shared. Centralising it here means
one place to add retries, telemetry, model fallback, or async migration.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Generator, List

import requests

from app.core.settings import settings

logger = logging.getLogger(__name__)


class CloudflareAIError(Exception):
    """Cloudflare returned a non-success body, or the HTTP call failed."""


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


def chat_completion(
    messages: List[Dict[str, str]],
    *,
    model: str,
    max_tokens: int = 1024,
    temperature: float | None = None,
    timeout: float = 60,
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

    resp = requests.post(_endpoint(model), headers=_headers(), json=payload, timeout=timeout)
    resp.raise_for_status()
    body = resp.json()
    if not body.get("success", True):
        raise CloudflareAIError(f"Cloudflare AI error: {body.get('errors')}")
    text = (body.get("result") or {}).get("response")
    if text is None:
        raise CloudflareAIError(f"Unexpected Cloudflare AI response shape: {body}")
    return text


def chat_completion_stream(
    messages: List[Dict[str, str]],
    *,
    model: str,
    max_tokens: int = 2048,
    timeout: float = 90,
) -> Generator[str, None, None]:
    """Streaming chat completion. Yields each text chunk as it arrives.

    Cloudflare emits SSE lines of the form `data: {"response": "..."}` and
    a final `data: [DONE]`. Malformed lines are skipped.
    """
    payload = {"messages": messages, "stream": True, "max_tokens": max_tokens}

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
        text = chunk.get("response", "")
        if text:
            yield text

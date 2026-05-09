"""Case Brief Generator — turns a judgment URL or pasted text into a
structured brief: facts, issues, arguments, ratio, holding, dicta.

The prompt is crafted to (a) refuse to invent citations/facts and (b)
return strict JSON we can store + render. Every field is a list of strings
so the FE can render bullet points without re-parsing prose.

HTTP plumbing for Cloudflare lives in `cloudflare_ai`.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Optional, TypedDict

from app.core.settings import settings
from app.services import cloudflare_ai
from app.services.cloudflare_ai import OnComplete
from app.services.content_extractor import fetch_content_from_url

logger = logging.getLogger(__name__)

# Larger budget than search snippets — judgments are long and we want the
# LLM to see facts AND ratio, which often live many paragraphs apart.
_FETCH_CHAR_BUDGET = 18_000


class CaseBrief(TypedDict):
    citation: Optional[str]
    facts: list[str]
    issues: list[str]
    arguments_petitioner: list[str]
    arguments_respondent: list[str]
    ratio: list[str]
    holding: list[str]
    dicta: list[str]
    source_url: Optional[str]


_SYSTEM_PROMPT = """You are a senior legal research assistant generating a structured CASE BRIEF
from an Indian judgment. You MUST output a single JSON object — no prose, no
markdown, no commentary. NEVER invent citations, parties, or facts that are
not in the source text. If a section is genuinely absent from the source,
return an empty array for that field.

The shape of your reply MUST be exactly:
{
  "citation": string | null,         // e.g. "AIR 2023 SC 1234" — null if not found
  "facts": string[],                 // 3-7 bullet points of material facts
  "issues": string[],                // legal questions before the court
  "arguments_petitioner": string[],  // appellant/petitioner contentions
  "arguments_respondent": string[],  // respondent/state contentions
  "ratio": string[],                 // ratio decidendi — the binding rule
  "holding": string[],               // the disposal (allowed/dismissed/remitted/...)
  "dicta": string[]                  // obiter that's analytically important; [] if none
}
"""

_USER_TEMPLATE = """Generate a case brief from the following Indian judgment text. Return ONLY
the JSON object specified in the system prompt — nothing else.

Source URL: {url}

--- BEGIN JUDGMENT TEXT ---
{text}
--- END JUDGMENT TEXT ---
"""


def fetch_case_text(url: str) -> str:
    """Pull the judgment text. Returns empty string on failure — caller
    should refuse rather than feed empty text to the LLM."""
    return fetch_content_from_url(url, max_chars=_FETCH_CHAR_BUDGET) or ""


def _extract_json(text: str) -> dict:
    """LLMs occasionally wrap JSON in ```json fences or include a stray
    sentence. Strip both before parsing."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    else:
        first = text.find("{")
        last = text.rfind("}")
        if first != -1 and last != -1 and last > first:
            text = text[first:last + 1]
    return json.loads(text)


def _empty_brief(source_url: Optional[str]) -> CaseBrief:
    return CaseBrief(
        citation=None,
        facts=[], issues=[],
        arguments_petitioner=[], arguments_respondent=[],
        ratio=[], holding=[], dicta=[],
        source_url=source_url,
    )


def generate_case_brief(
    text: str,
    *,
    source_url: Optional[str] = None,
    on_complete: Optional[OnComplete] = None,
) -> CaseBrief:
    """Call Cloudflare AI with the structured prompt and return a CaseBrief.
    Raises ValueError on missing config or unparsable response."""
    if not cloudflare_ai.is_configured():
        raise ValueError("Cloudflare AI credentials are not configured")
    text = text.strip()
    if not text:
        raise ValueError("Cannot generate a brief from empty text")

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": _USER_TEMPLATE.format(
            url=source_url or "(none provided)",
            text=text[:_FETCH_CHAR_BUDGET],
        )},
    ]
    try:
        # Low temperature: brief generation is extractive, not creative.
        raw = cloudflare_ai.chat_completion(
            messages,
            model=settings.CLOUDFLARE_LLM_MODEL_BRIEF,
            max_tokens=1500,
            temperature=0.2,
            timeout=60,
            on_complete=on_complete,
        )
    except cloudflare_ai.CloudflareAIError as exc:
        raise ValueError(str(exc)) from exc

    try:
        parsed = _extract_json(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Brief LLM returned non-JSON: %s — raw=%r", exc, raw[:200])
        # Don't crash the request; return an empty brief shell so the user
        # at least gets the document scaffold and the source URL.
        return _empty_brief(source_url)

    return CaseBrief(
        citation=parsed.get("citation") or None,
        facts=list(parsed.get("facts") or []),
        issues=list(parsed.get("issues") or []),
        arguments_petitioner=list(parsed.get("arguments_petitioner") or []),
        arguments_respondent=list(parsed.get("arguments_respondent") or []),
        ratio=list(parsed.get("ratio") or []),
        holding=list(parsed.get("holding") or []),
        dicta=list(parsed.get("dicta") or []),
        source_url=source_url,
    )


def derive_brief_title(brief: CaseBrief, fallback: str = "Case brief") -> str:
    """Pick a sensible title for the saved Document. Citation > first issue > fallback."""
    if brief["citation"]:
        return brief["citation"]
    if brief["issues"]:
        first = brief["issues"][0].strip()
        return first[:80] if first else fallback
    return fallback

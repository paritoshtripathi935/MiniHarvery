"""Field-collector for the conversational drafting workshop (PAI-11).

The FE drives a chat-style page where the user describes their case in
natural language. Per turn we hand the conversation + the template's
field schema to the LLM and ask it to do two things at once:

  1. Extract values for as many fields as it confidently can.
  2. Tell us which required fields are still missing, and what to ask next.

Strict-JSON output (same pattern as `case_brief_generator`). Low
temperature — this is extraction, not creative writing.

The service is stateless: each request carries the full message history
and the running extracted-fields map. The handler returns either an
"ask" (next question for the user) or "ready" (all required fields
filled — FE can now call the existing /matters/{id}/drafts endpoint to
generate the actual draft).
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.core.settings import settings
from app.schemas.draft_model import (
    DraftField,
    DraftTemplate,
    DraftingMessage,
    DraftingTurnResponse,
)
from app.services import cloudflare_ai
from app.services.cloudflare_ai import OnComplete

logger = logging.getLogger(__name__)


_TEMPERATURE = 0.2
_MAX_TOKENS = 700
_TIMEOUT = 45


_SYSTEM_PROMPT = """You are a helpful drafting assistant collecting fields for an Indian legal document.

You will be given:
  - the field schema (which fields the document needs, and which are required),
  - the running map of fields already extracted from earlier turns,
  - the conversation so far.

Your job each turn is to output a SINGLE JSON object — no prose, no commentary,
no markdown fences — with this exact shape:

{
  "extracted_fields": { "<field_id>": <value>, ... },
  "missing_required": [ "<field_id>", ... ],
  "next_question": "<one short, friendly sentence>"
}

Rules:
- `extracted_fields` MUST include every field you are confident about, taking
  the most recent statement from the user as authoritative if they corrected
  themselves. Carry forward values from `extracted_fields` you were given,
  unless the user contradicted them.
- For `type: "list"` fields, the value MUST be a JSON array of strings. Accept
  comma-separated, numbered, or bulleted user input — split it into items.
- `missing_required` lists the IDs of required fields whose value is still
  missing or empty.
- `next_question` asks for ONE missing required field at a time, in the user's
  own register. Group naturally related fields ("Who's the addressee, and
  what's their address?"). Keep it under 25 words. If `missing_required` is
  empty, set `next_question` to "".
- NEVER invent facts. If the user hasn't said something, don't guess it.
- Do NOT ask about optional fields. The form gives the user a chance to add
  them later if they want.
"""


def _field_schema_block(template: DraftTemplate) -> str:
    """Render the template's fields as a compact JSON description for the
    prompt. We feed `id`, `label`, `type`, `required`, plus any hint —
    everything the model needs to extract correctly."""
    rows: List[Dict[str, Any]] = []
    for f in template.fields:
        row: Dict[str, Any] = {
            "id": f.id,
            "label": f.label,
            "type": f.type,
            "required": bool(f.required),
        }
        if f.hint:
            row["hint"] = f.hint
        if f.placeholder:
            row["placeholder"] = f.placeholder
        rows.append(row)
    return json.dumps(rows, ensure_ascii=False, indent=2)


def _conversation_block(messages: List[DraftingMessage]) -> str:
    """Plain transcript — one line per turn. The LLM gets full role
    visibility in the system/user/assistant slots, but we also restate
    the conversation in the user content so it has a single coherent
    block to reason over."""
    if not messages:
        return "(no user messages yet)"
    lines = [f"[{m.role}]: {m.content}" for m in messages]
    return "\n".join(lines)


def _extract_json(text: str) -> Dict[str, Any]:
    """Tolerate the usual LLM wrappers (```json fences, stray prose)
    around the JSON body. Same approach as case_brief_generator."""
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


def _coerce_extracted(
    template: DraftTemplate,
    raw: Any,
) -> Dict[str, Any]:
    """Defensive shape: drop unknown keys, coerce list-typed fields to
    list[str], strip text fields. The model usually gets this right but
    occasionally returns a string for a list field — we don't want that
    error to surface to the FE."""
    if not isinstance(raw, dict):
        return {}
    by_id: Dict[str, DraftField] = {f.id: f for f in template.fields}
    out: Dict[str, Any] = {}
    for key, value in raw.items():
        f = by_id.get(key)
        if f is None:
            continue  # silently drop anything not in the schema
        if f.type == "list":
            if isinstance(value, list):
                items = [str(x).strip() for x in value if str(x).strip()]
            elif isinstance(value, str):
                items = [s.strip() for s in re.split(r"[,\n;]+", value) if s.strip()]
            else:
                continue
            if items:
                out[key] = items
        else:
            text = str(value).strip() if value is not None else ""
            if text:
                out[key] = text
    return out


def _compute_missing_required(
    template: DraftTemplate,
    extracted: Dict[str, Any],
) -> List[str]:
    """Authoritative server-side recompute. The LLM's `missing_required`
    is a hint; we trust the schema + the actual extracted map."""
    missing: List[str] = []
    for f in template.fields:
        if not f.required:
            continue
        v = extracted.get(f.id)
        if f.type == "list":
            if not (isinstance(v, list) and len(v) > 0):
                missing.append(f.id)
        else:
            if not (isinstance(v, str) and v.strip()):
                missing.append(f.id)
    return missing


def run_turn(
    template: DraftTemplate,
    messages: List[DraftingMessage],
    extracted_fields: Dict[str, Any],
    *,
    on_complete: Optional[OnComplete] = None,
) -> DraftingTurnResponse:
    """Single conversational turn. Returns either ask-next-question or
    ready-to-generate. Raises ValueError on configuration / LLM errors —
    the handler maps those to 502."""
    if not cloudflare_ai.is_configured():
        raise ValueError("Cloudflare AI credentials are not configured")

    user_prompt = (
        f"Template: {template.label} — {template.description}\n\n"
        f"Field schema (JSON):\n{_field_schema_block(template)}\n\n"
        f"Already-extracted fields (carry forward unless the user contradicts):\n"
        f"{json.dumps(extracted_fields, ensure_ascii=False, indent=2)}\n\n"
        f"Conversation so far:\n{_conversation_block(messages)}\n\n"
        f"Output the JSON object only."
    )

    chat: List[Dict[str, str]] = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    try:
        raw = cloudflare_ai.chat_completion(
            chat,
            model=settings.CLOUDFLARE_LLM_MODEL_DRAFT,
            max_tokens=_MAX_TOKENS,
            temperature=_TEMPERATURE,
            timeout=_TIMEOUT,
            on_complete=on_complete,
        )
    except cloudflare_ai.CloudflareAIError as exc:
        raise ValueError(str(exc)) from exc

    try:
        parsed = _extract_json(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning("Drafting turn returned non-JSON: %s — raw=%r", exc, raw[:200])
        # A non-JSON LLM reply is a soft failure: keep the running extracted
        # fields, ask the user to repeat. The page stays usable.
        return DraftingTurnResponse(
            kind="ask",
            question=(
                "Sorry — I lost the thread for a second. Could you say that "
                "again?"
            ),
            extracted_fields=extracted_fields,
            missing_required=_compute_missing_required(template, extracted_fields),
        )

    # Merge: fields the model returned, falling back to what we had. This
    # protects against an LLM that drops fields it had previously extracted.
    extracted = dict(extracted_fields)
    extracted.update(_coerce_extracted(template, parsed.get("extracted_fields")))

    missing = _compute_missing_required(template, extracted)
    next_q = (parsed.get("next_question") or "").strip()

    if not missing:
        return DraftingTurnResponse(
            kind="ready",
            question=None,
            extracted_fields=extracted,
            missing_required=[],
        )

    # If the model went silent on next_question (or returned the empty string
    # despite missing fields), synthesise a fallback so the chat keeps moving.
    if not next_q:
        first_missing = next((f for f in template.fields if f.id == missing[0]), None)
        next_q = (
            f"Could you tell me about the {first_missing.label.lower()}?"
            if first_missing
            else "Could you give me a bit more detail?"
        )

    return DraftingTurnResponse(
        kind="ask",
        question=next_q,
        extracted_fields=extracted,
        missing_required=missing,
    )


def opening_message(template: DraftTemplate) -> str:
    """Static opening message shown the moment the user lands on a chat
    page. Hard-coded per template family rather than synthesised — saves
    a round-trip on first paint and keeps the feel consistent."""
    openings = {
        "plaint": (
            "Let's draft a Plaint. Tell me what the dispute is about — "
            "who the parties are, and what relief your client is seeking."
        ),
        "writ_226": (
            "Let's draft a Writ Petition under Article 226. What State "
            "action are you challenging, and which fundamental rights are "
            "engaged?"
        ),
        "anticipatory_bail": (
            "Let's draft an anticipatory bail application. What FIR has "
            "been registered, and what are the allegations against your "
            "client?"
        ),
        "legal_notice": (
            "Let's draft a Legal Notice. Who is it going to, and on whose "
            "behalf? What's the issue?"
        ),
    }
    return openings.get(
        template.id,
        f"Let's draft a {template.label}. Tell me what the matter is about.",
    )

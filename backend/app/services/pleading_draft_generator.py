"""Pleading-draft generation.

Pure function: takes a template id, a field map, and matter context;
returns Markdown. The handler stitches this with the matter ownership
check and persists as a `Document(type='pleading_draft')`.

Same Cloudflare-AI shape as `case_brief_generator`, slightly higher
temperature (drafts benefit from a little more linguistic variety than
extractive briefs) and a higher max_tokens budget (drafts run long).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.core.settings import settings
from app.schemas.draft_model import DraftTemplate
from app.services import cloudflare_ai
from app.services.cloudflare_ai import OnComplete
from app.services.pleading_templates import get_prompts

logger = logging.getLogger(__name__)


_DRAFT_TEMPERATURE = 0.3
_DRAFT_MAX_TOKENS = 2500
_DRAFT_TIMEOUT = 90


class DraftValidationError(ValueError):
    """Inbound fields don't match the template schema."""


def validate_fields(template: DraftTemplate, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce inbound fields against the template's schema.

    - List-typed fields accept either a list of strings or a single
      newline-separated string (for Postman / curl ergonomics).
    - text / textarea coerce to str and strip whitespace.
    - Required fields must be non-empty after stripping.
    - Unknown keys are silently dropped (forward-compat: a future
      template version can ignore stale fields the FE still sends).
    """
    out: Dict[str, Any] = {}
    missing: List[str] = []

    for f in template.fields:
        raw = fields.get(f.id)
        if f.type == "list":
            if raw is None:
                value: List[str] = []
            elif isinstance(raw, list):
                value = [str(x).strip() for x in raw if str(x).strip()]
            elif isinstance(raw, str):
                value = [line.strip() for line in raw.splitlines() if line.strip()]
            else:
                raise DraftValidationError(
                    f"Field '{f.id}' must be a list of strings; got {type(raw).__name__}."
                )
            if f.required and not value:
                missing.append(f.id)
            out[f.id] = value
        else:
            value = str(raw).strip() if raw is not None else ""
            if f.required and not value:
                missing.append(f.id)
            out[f.id] = value

    if missing:
        raise DraftValidationError(
            f"Required fields are empty: {', '.join(missing)}"
        )
    return out


def _render_user_prompt(
    template: DraftTemplate,
    user_template: str,
    validated: Dict[str, Any],
    parties_block: str,
) -> str:
    """Build the user message by substituting the validated field values
    into the template's user prompt. List-typed fields get rendered as
    Markdown bullet lists; missing optional fields get '(not provided)'."""
    rendered: Dict[str, str] = {"parties_block": parties_block or "(no parties on record)"}
    for f in template.fields:
        v = validated.get(f.id)
        if f.type == "list":
            items = v or []
            rendered[f.id] = "\n".join(f"- {item}" for item in items) or "(none provided)"
        else:
            rendered[f.id] = (v or "").strip() or "(not provided)"
    # Any field used in the prompt template but not declared in the schema
    # would surface here as a KeyError — that's a config bug and we want
    # it loud rather than silent.
    return user_template.format(**rendered)


def generate_pleading_draft(
    template: DraftTemplate,
    fields: Dict[str, Any],
    *,
    parties_block: str = "",
    on_complete: Optional[OnComplete] = None,
) -> str:
    """Run the LLM and return the generated Markdown."""
    if not cloudflare_ai.is_configured():
        raise ValueError("Cloudflare AI credentials are not configured")

    prompts = get_prompts(template.id)
    if prompts is None:
        raise ValueError(f"No prompt for template '{template.id}'")
    system_prompt, user_template = prompts

    validated = validate_fields(template, fields)
    user_prompt = _render_user_prompt(template, user_template, validated, parties_block)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    try:
        markdown = cloudflare_ai.chat_completion(
            messages,
            model=settings.CLOUDFLARE_LLM_MODEL_DRAFT,
            max_tokens=_DRAFT_MAX_TOKENS,
            temperature=_DRAFT_TEMPERATURE,
            timeout=_DRAFT_TIMEOUT,
            on_complete=on_complete,
        )
    except cloudflare_ai.CloudflareAIError as exc:
        raise ValueError(str(exc)) from exc

    markdown = markdown.strip()
    if not markdown:
        raise ValueError("LLM returned an empty draft")
    return markdown


def format_parties_block(parties: List[Dict[str, str]]) -> str:
    """Render the matter's parties as a one-line block for prompt injection."""
    if not parties:
        return ""
    return "; ".join(
        f"{p.get('role', '').strip() or 'Party'}: {p.get('name', '').strip() or '[unnamed]'}"
        for p in parties
    )

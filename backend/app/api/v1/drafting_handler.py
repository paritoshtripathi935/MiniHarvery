"""Conversational drafting endpoints (PAI-11).

The chat page on the FE collects pleading-draft fields via a chat with
an LLM. Once every required field is collected, the FE hands the
accumulated map to the existing `POST /matters/{id}/drafts` endpoint to
actually generate the draft markdown — no change to that flow.

This handler owns one endpoint:

  POST /api/v1/drafting/{template_id}/turn
      body: { messages: [...], extracted_fields: {...} }
      returns: DraftingTurnResponse (kind=ask|ready)

The endpoint is stateless — the FE re-sends the full message history and
the running field map per turn.

Note on telemetry: `llm_calls` has a CHECK constraint pinning `call_site`
to {rewrite, answer, brief, draft}. The conversational turns here would
need a `drafting_chat` value (and a migration to widen the constraint)
before we can persist them. Out of scope for this PR — when the cache
work picks up `prompt_hash`, that migration ships alongside it. The
final draft generation still records under `call_site="draft"`.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CallerIdentity, resolve_caller
from app.core.rate_limiter import check_rate_limit
from app.schemas.draft_model import DraftingTurnRequest, DraftingTurnResponse
from app.services import drafting_conversation
from app.services.pleading_templates import get_template

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/drafting/{template_id}/turn")
async def drafting_turn(
    template_id: str,
    body: DraftingTurnRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    check_rate_limit("drafting_chat", caller.subject)

    template = get_template(template_id)
    if template is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown template '{template_id}'",
        )

    try:
        result: DraftingTurnResponse = drafting_conversation.run_turn(
            template,
            body.messages,
            dict(body.extracted_fields),
        )
    except ValueError as exc:
        logger.warning("Drafting turn refused: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    return {"data": result.model_dump(), "status": "success"}

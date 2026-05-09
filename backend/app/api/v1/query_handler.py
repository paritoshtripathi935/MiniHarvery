"""Query handler — search + streaming answer.

POST   /search/{session_id}    — run legal search, persist, return ids + results
POST   /answer/{session_id}    — stream the legal answer via SSE
DELETE /session/{session_id}   — drop a single session row
GET    /health                 — readiness probe (DB + auth status)

Every endpoint requires a valid Clerk session JWT. Business logic lives in
`services.search_pipeline` and `services.answer_pipeline`; this module owns
HTTP plumbing only — request validation, rate limiting, response envelope,
SSE framing.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CallerIdentity, resolve_caller
from app.core.auth import auth_enabled
from app.core.rate_limiter import check_rate_limit
from app.db import db_enabled, get_session
from app.db import repositories as repo
from app.schemas.query_model import AnswerRequest, SearchRequest
from app.services.answer_pipeline import prepare_answer, stream_answer_sse
from app.services.search_pipeline import run_search

router = APIRouter()
logger = logging.getLogger(__name__)


def _coerce_session_uuid(session_id: str) -> uuid.UUID:
    """Accept either a real UUID or any string. Strings are hashed to a
    deterministic UUIDv4-shaped value so existing frontend code that uses
    arbitrary session keys keeps working."""
    try:
        return uuid.UUID(session_id)
    except (ValueError, AttributeError):
        digest = hashlib.sha256(f"sess:{session_id}".encode()).digest()[:16]
        return uuid.UUID(bytes=digest, version=4)


@router.post("/search/{session_id}")
async def search(
    session_id: str,
    body: SearchRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    check_rate_limit("search", caller.subject)
    data = await run_search(
        session_uuid=_coerce_session_uuid(session_id),
        user_id=caller.user_id,
        inbox_matter_id=caller.inbox_matter_id,
        body=body,
    )
    return {"data": data, "status": "success"}


@router.post("/answer/{session_id}")
async def answer(
    session_id: str,
    body: AnswerRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> StreamingResponse:
    check_rate_limit("answer", caller.subject)
    ctx = await prepare_answer(
        session_uuid=_coerce_session_uuid(session_id),
        user_id=caller.user_id,
        inbox_matter_id=caller.inbox_matter_id,
        body=body,
    )
    return StreamingResponse(
        stream_answer_sse(ctx),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.delete("/session/{session_id}", status_code=204)
async def clear_session(
    session_id: str,
    caller: CallerIdentity = Depends(resolve_caller),  # noqa: ARG001 — auth gate only
    db: AsyncSession = Depends(get_session),
) -> None:
    await repo.delete_session(db, _coerce_session_uuid(session_id))


@router.get("/health")
async def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "db": "enabled" if db_enabled() else "disabled",
        "auth": "enabled" if auth_enabled() else "disabled",
    }

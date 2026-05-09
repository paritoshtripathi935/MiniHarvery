"""Document endpoints — case briefs, pleading drafts, authorities tables, notes.

POST   /matters/{matter_id}/case-briefs   — generate + persist a case brief
GET    /documents/{id}                    — fetch a document
PATCH  /documents/{id}                    — edit title / content / status
DELETE /documents/{id}                    — soft-delete

Case-brief generation is the only LLM-backed endpoint here; the others are
CRUD over the polymorphic `documents` table. The brief endpoint manages its
own DB sessions because the LLM call sits between two DB calls and we don't
want to hold a pool connection over a 30 s round trip.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CallerIdentity, resolve_caller
from app.db import AsyncSessionLocal, get_session
from app.db import repositories as repo
from app.services.case_brief_generator import (
    derive_brief_title,
    fetch_case_text,
    generate_case_brief,
)
from app.core.rate_limiter import check_rate_limit

router = APIRouter()
logger = logging.getLogger(__name__)


class CaseBriefRequest(BaseModel):
    """Provide either a URL (we fetch + extract) or text (paste). At least
    one is required. `query_id` lets the FE link the brief back to the
    search result it was generated from."""
    url: Optional[str] = None
    text: Optional[str] = None
    title: Optional[str] = None
    query_id: Optional[uuid.UUID] = None


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[Dict[str, Any]] = Field(default=None)
    status: Optional[str] = None


# ── POST /matters/{matter_id}/case-briefs ────────────────────────────────────

@router.post("/matters/{matter_id}/case-briefs", status_code=201)
async def create_case_brief(
    matter_id: uuid.UUID,
    body: CaseBriefRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    check_rate_limit("case_brief", caller.subject)

    if not body.url and not body.text:
        raise HTTPException(
            status_code=400, detail="Provide either `url` or `text`",
        )

    # Validate ownership before doing the expensive LLM call.
    async with AsyncSessionLocal() as db:
        if not await repo.matter_belongs_to_user(
            db, matter_id=matter_id, user_id=caller.user_id
        ):
            raise HTTPException(status_code=404, detail="Matter not found")

    text = (body.text or "").strip()
    source_url = body.url
    if not text and source_url:
        text = fetch_case_text(source_url)
    if not text:
        raise HTTPException(
            status_code=422,
            detail="Could not extract any text from the URL — paste the judgment text directly.",
        )

    try:
        brief = generate_case_brief(text, source_url=source_url)
    except ValueError as exc:
        logger.warning("Case brief generation refused: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc))

    title = body.title or derive_brief_title(brief)

    async with AsyncSessionLocal() as db:
        try:
            doc = await repo.create_document(
                db,
                matter_id=matter_id,
                user_id=caller.user_id,
                type="case_brief",
                title=title,
                content=dict(brief),
                source_url=source_url,
                source_query_id=body.query_id,
                status="draft",
            )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to persist case brief")
            raise HTTPException(status_code=500, detail="Failed to save brief")

    return {"data": repo.document_to_dict(doc), "status": "success"}


# ── GET /documents/{id} ──────────────────────────────────────────────────────

@router.get("/documents/{document_id}")
async def get_document(
    document_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    doc = await repo.get_document_owned_by(
        db, document_id=document_id, user_id=caller.user_id
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"data": repo.document_to_dict(doc), "status": "success"}


# ── PATCH /documents/{id} ────────────────────────────────────────────────────

@router.patch("/documents/{document_id}")
async def update_document(
    document_id: uuid.UUID,
    body: DocumentUpdate,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    ok = await repo.update_document(
        db, document_id=document_id, user_id=caller.user_id, fields=fields
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = await repo.get_document_owned_by(
        db, document_id=document_id, user_id=caller.user_id
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"data": repo.document_to_dict(doc), "status": "success"}


# ── DELETE /documents/{id} ───────────────────────────────────────────────────

@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> None:
    ok = await repo.soft_delete_document(
        db, document_id=document_id, user_id=caller.user_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Document not found")

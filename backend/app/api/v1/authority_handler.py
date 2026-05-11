"""Authority endpoints — pinned cases for Table-of-Authorities generation.

GET    /matters/{matter_id}/authorities   — list pinned cases for a matter
POST   /matters/{matter_id}/authorities   — pin a case (idempotent)
PATCH  /authorities/{id}                  — edit user-authored fields
DELETE /authorities/{id}                  — soft-delete (unpin)

Handler stays thin: ownership check, repo call, response framing. Pinning
is idempotent — same case from a different surface no-ops to the existing
row, surfaced as `created: false` on the response.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CallerIdentity, resolve_caller
from app.db import get_session
from app.db import repositories as repo
from app.schemas.authority_model import (
    PinAuthorityRequest,
    UpdateAuthorityRequest,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── GET /matters/{matter_id}/authorities ─────────────────────────────────────

@router.get("/matters/{matter_id}/authorities")
async def list_matter_authorities(
    matter_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    if not await repo.matter_belongs_to_user(
        db, matter_id=matter_id, user_id=caller.user_id
    ):
        raise HTTPException(status_code=404, detail="Matter not found")
    rows = await repo.list_authorities(
        db, matter_id=matter_id, user_id=caller.user_id
    )
    return {"data": {"authorities": rows}, "status": "success"}


# ── POST /matters/{matter_id}/authorities ────────────────────────────────────

@router.post("/matters/{matter_id}/authorities")
async def pin_matter_authority(
    matter_id: uuid.UUID,
    body: PinAuthorityRequest,
    response: Response,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    if not await repo.matter_belongs_to_user(
        db, matter_id=matter_id, user_id=caller.user_id
    ):
        raise HTTPException(status_code=404, detail="Matter not found")

    row, created = await repo.pin_authority(
        db,
        matter_id=matter_id,
        user_id=caller.user_id,
        case_name=body.case_name,
        citation=body.citation,
        court=body.court,
        year=body.year,
        source_url=body.source_url,
        indian_kanoon_tid=body.indian_kanoon_tid,
        proposition=body.proposition or "",
        paragraphs=body.paragraphs,
        notes=body.notes,
        first_pinned_from_document_id=body.first_pinned_from_document_id,
        first_pinned_from_thread_id=body.first_pinned_from_thread_id,
        first_pinned_from_answer_id=body.first_pinned_from_answer_id,
    )
    response.status_code = 201 if created else 200
    return {
        "data": repo.authority_to_dict(row),
        "created": created,
        "status": "success",
    }


# ── PATCH /authorities/{id} ──────────────────────────────────────────────────

@router.patch("/authorities/{authority_id}")
async def update_authority_endpoint(
    authority_id: uuid.UUID,
    body: UpdateAuthorityRequest,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    ok = await repo.update_authority(
        db, authority_id=authority_id, user_id=caller.user_id, fields=fields,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Authority not found")

    row = await repo.get_authority_owned_by(
        db, authority_id=authority_id, user_id=caller.user_id,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Authority not found")
    return {"data": repo.authority_to_dict(row), "status": "success"}


# ── DELETE /authorities/{id} ─────────────────────────────────────────────────

@router.delete("/authorities/{authority_id}", status_code=204)
async def delete_authority_endpoint(
    authority_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> None:
    ok = await repo.soft_delete_authority(
        db, authority_id=authority_id, user_id=caller.user_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Authority not found")

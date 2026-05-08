"""Matter (case file) endpoints.

GET    /matters             — list current user's matters
POST   /matters             — create a new matter
GET    /matters/{id}        — full matter (threads + documents)
PATCH  /matters/{id}        — update matter fields
DELETE /matters/{id}        — soft-delete (Inbox is protected)

Every read/write is scoped by user_id; cross-user access returns 404.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import CallerIdentity, resolve_caller
from app.db import AsyncSessionLocal
from app.db import repositories as repo

router = APIRouter()
logger = logging.getLogger(__name__)


class PartyDTO(BaseModel):
    role: str
    name: str


class MatterCreate(BaseModel):
    title: str
    description: Optional[str] = None
    parties: List[PartyDTO] = []
    court: Optional[str] = None
    cause_number: Optional[str] = None


class MatterUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    parties: Optional[List[PartyDTO]] = None
    court: Optional[str] = None
    cause_number: Optional[str] = None
    status: Optional[str] = None


@router.get("/matters")
async def list_matters(
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        matters = await repo.list_user_matters(db, caller.user_id)
    return {"data": {"matters": matters}, "status": "success"}


@router.post("/matters", status_code=201)
async def create_matter(
    body: MatterCreate,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        try:
            matter = await repo.create_matter(
                db,
                user_id=caller.user_id,
                title=body.title.strip() or "Untitled matter",
                description=body.description,
                parties=[p.model_dump() for p in body.parties],
                court=body.court,
                cause_number=body.cause_number,
            )
            await db.commit()
            full = await repo.fetch_matter_full(
                db, matter_id=matter.id, user_id=caller.user_id
            )
        except Exception:
            await db.rollback()
            logger.exception("Failed to create matter")
            raise HTTPException(status_code=500, detail="Failed to create matter")
    return {"data": full, "status": "success"}


@router.get("/matters/{matter_id}")
async def get_matter(
    matter_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        full = await repo.fetch_matter_full(
            db, matter_id=matter_id, user_id=caller.user_id
        )
    if full is None:
        raise HTTPException(status_code=404, detail="Matter not found")
    return {"data": full, "status": "success"}


@router.patch("/matters/{matter_id}")
async def update_matter(
    matter_id: uuid.UUID,
    body: MatterUpdate,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    fields = body.model_dump(exclude_none=True)
    if "parties" in fields:
        fields["parties"] = [p.model_dump() if hasattr(p, "model_dump") else p
                             for p in fields["parties"]]
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    async with AsyncSessionLocal() as db:
        try:
            ok = await repo.update_matter(
                db,
                matter_id=matter_id,
                user_id=caller.user_id,
                fields=fields,
            )
            await db.commit()
            full = await repo.fetch_matter_full(
                db, matter_id=matter_id, user_id=caller.user_id
            )
        except Exception:
            await db.rollback()
            logger.exception("Failed to update matter")
            raise HTTPException(status_code=500, detail="Failed to update matter")
    if not ok or full is None:
        raise HTTPException(status_code=404, detail="Matter not found")
    return {"data": full, "status": "success"}


@router.delete("/matters/{matter_id}", status_code=204)
async def delete_matter(
    matter_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            ok = await repo.soft_delete_matter(
                db, matter_id=matter_id, user_id=caller.user_id
            )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to delete matter")
            raise HTTPException(status_code=500, detail="Failed to delete matter")
    if not ok:
        # Either it doesn't exist, doesn't belong to caller, or is the Inbox.
        raise HTTPException(
            status_code=404,
            detail="Matter not found, or Inbox cannot be deleted",
        )

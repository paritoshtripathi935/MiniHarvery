"""Thread (conversation history) endpoints.

GET    /threads          — list current user's threads (sidebar)
GET    /threads/{id}     — full thread tree (queries + answers + sources)
DELETE /threads          — soft-delete every thread the user owns
DELETE /threads/{id}     — soft-delete one thread

Soft-delete keeps the rows around for analytics; the FK chain still works
because we filter out deleted_at IS NOT NULL on every read path.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CallerIdentity, resolve_caller
from app.db import AsyncSessionLocal
from app.db import repositories as repo

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/threads")
async def list_threads(
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        threads = await repo.list_user_threads(db, caller.user_id)
    return {"data": {"threads": threads}, "status": "success"}


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        thread = await repo.fetch_thread_full(
            db, thread_id=thread_id, user_id=caller.user_id
        )
    if thread is None:
        raise HTTPException(status_code=404, detail="Thread not found")
    return {"data": thread, "status": "success"}


@router.delete("/threads/{thread_id}", status_code=204)
async def delete_thread(
    thread_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            ok = await repo.soft_delete_thread(
                db, thread_id=thread_id, user_id=caller.user_id
            )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to delete thread")
            raise HTTPException(status_code=500, detail="Failed to delete thread")
    if not ok:
        raise HTTPException(status_code=404, detail="Thread not found")


@router.delete("/threads", status_code=204)
async def delete_all_threads(
    caller: CallerIdentity = Depends(resolve_caller),
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await repo.soft_delete_all_user_threads(db, caller.user_id)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to delete all threads")
            raise HTTPException(status_code=500, detail="Failed to clear history")

"""Thread (conversation history) endpoints.

GET    /threads          — list current user's threads (sidebar)
GET    /threads/{id}     — full thread tree (queries + answers + sources)
DELETE /threads          — soft-delete every thread the user owns
DELETE /threads/{id}     — soft-delete one thread

Soft-delete keeps rows around for analytics; the FK chain still works
because every read path filters out `deleted_at IS NOT NULL`.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CallerIdentity, resolve_caller
from app.db import get_session
from app.db import repositories as repo

router = APIRouter()


@router.get("/threads")
async def list_threads(
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
    threads = await repo.list_user_threads(db, caller.user_id)
    return {"data": {"threads": threads}, "status": "success"}


@router.get("/threads/{thread_id}")
async def get_thread(
    thread_id: uuid.UUID,
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> Dict[str, Any]:
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
    db: AsyncSession = Depends(get_session),
) -> None:
    ok = await repo.soft_delete_thread(
        db, thread_id=thread_id, user_id=caller.user_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Thread not found")


@router.delete("/threads", status_code=204)
async def delete_all_threads(
    caller: CallerIdentity = Depends(resolve_caller),
    db: AsyncSession = Depends(get_session),
) -> None:
    await repo.soft_delete_all_user_threads(db, caller.user_id)

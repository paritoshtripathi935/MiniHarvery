"""Search pipeline — fan out to legal sources, persist, return the response shape.

Owns the full workflow that used to live inline in `query_handler.search`:
classification, query rewrite, parallel network fetch, thread resolution,
DB persistence. The handler is left with HTTP plumbing only.

DB session lifecycle is managed here (rather than via Depends) so the
expensive non-DB phase doesn't hold a pool connection.
"""
from __future__ import annotations

import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from fastapi import HTTPException

from app.db import AsyncSessionLocal
from app.db import repositories as repo
from app.schemas.query_model import SearchRequest
from app.services.legal_search_service import search_legal_sources, search_videos
from app.services.language_model import rewrite_query_for_search
from app.services.query_classifier import classify_query

logger = logging.getLogger(__name__)


async def run_search(
    *,
    session_uuid: uuid.UUID,
    user_id: uuid.UUID,
    inbox_matter_id: uuid.UUID,
    body: SearchRequest,
) -> Dict[str, Any]:
    """Execute /search end-to-end.

    Returns the response `data` dict on success. Raises HTTPException for
    request validation, ownership, and persistence failures.
    """
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    logger.info("Search [thread=%s] query='%s'", body.thread_id, query)

    query_type = classify_query(query)
    search_query, rewrite_metrics = rewrite_query_for_search(query)

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        sources_future = pool.submit(search_legal_sources, search_query)
        videos_future = pool.submit(search_videos, search_query)
        results = sources_future.result()
        videos = videos_future.result()
    search_latency_ms = int((time.perf_counter() - t0) * 1000)

    async with AsyncSessionLocal() as db:
        try:
            await repo.upsert_session(db, session_uuid, user_id)
            thread_id = await _resolve_thread(db, body, user_id, inbox_matter_id, query)

            q = await repo.insert_query(
                db,
                session_id=session_uuid,
                thread_id=thread_id,
                user_id=user_id,
                raw_query=query,
                rewritten_query=search_query,
                query_type=query_type.value,
                result_count=len(results),
                search_latency_ms=search_latency_ms,
            )
            await repo.bulk_insert_search_results(db, q.id, results)
            await repo.bulk_insert_videos(db, q.id, videos)

            if rewrite_metrics is not None:
                await repo.record_llm_call(
                    db,
                    user_id=user_id,
                    call_site="rewrite",
                    model=rewrite_metrics.model,
                    latency_ms=rewrite_metrics.latency_ms,
                    status=rewrite_metrics.status,
                    matter_id=body.matter_id,
                    query_id=q.id,
                    input_tokens=rewrite_metrics.input_tokens,
                    output_tokens=rewrite_metrics.output_tokens,
                    error_class=rewrite_metrics.error_class,
                )

            await db.commit()
        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            logger.exception("DB persist failed for /search")
            raise HTTPException(status_code=500, detail="Failed to persist search")

    return {
        "thread_id": str(thread_id),
        "query_id": str(q.id),
        "results": [r.model_dump() for r in results],
        "videos": [v.model_dump() for v in videos],
        "query_type": query_type.value,
        "search_query": search_query,
        "total": len(results),
    }


async def _resolve_thread(
    db,
    body: SearchRequest,
    user_id: uuid.UUID,
    inbox_matter_id: uuid.UUID,
    query: str,
) -> uuid.UUID:
    """Either return the existing thread (after ownership check) or mint a
    fresh one inside the requested matter (or the user's Inbox)."""
    if body.thread_id is not None:
        if not await repo.thread_belongs_to_user(
            db, thread_id=body.thread_id, user_id=user_id
        ):
            raise HTTPException(status_code=404, detail="Thread not found")
        await repo.bump_thread(db, body.thread_id)
        return body.thread_id

    target_matter_id = body.matter_id or inbox_matter_id
    if body.matter_id is not None:
        if not await repo.matter_belongs_to_user(
            db, matter_id=body.matter_id, user_id=user_id
        ):
            raise HTTPException(status_code=404, detail="Matter not found")
    thread = await repo.create_thread(
        db,
        user_id=user_id,
        matter_id=target_matter_id,
        title=repo.derive_thread_title(query),
    )
    return thread.id

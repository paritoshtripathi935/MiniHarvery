"""
Query handler — search + streaming answer.

POST /search/{session_id}    — run legal search, persist, return thread_id + query_id
POST /answer/{session_id}    — stream Harvey's legal answer via SSE
DELETE /session/{session_id} — drop a single session (rarely used now that
                               threads carry the user-facing history)

Every endpoint requires a valid Clerk session JWT; there is no guest path.
"""
import hashlib
import json
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import CallerIdentity, resolve_caller
from app.db import AsyncSessionLocal, db_enabled
from app.db import repositories as repo
from app.models.query_model import AnswerRequest, SearchRequest
from app.services.legal_search_service import search_legal_sources, search_videos
from app.services.language_model import generate_legal_answer, rewrite_query_for_search
from app.services.query_classifier import classify_query
from app.utils.citation_formatter import extract_citations, extract_suggested_steps
from app.utils.clerk_auth import auth_enabled
from app.utils.rate_limiter import check_rate_limit

router = APIRouter()
logger = logging.getLogger(__name__)

_LLM_MODEL = "@cf/meta/llama-3.1-70b-instruct"


def _coerce_session_uuid(session_id: str) -> uuid.UUID:
    """Accept either a real UUID or any string. Strings are hashed to a
    deterministic UUIDv4-shaped value so existing frontend code that uses
    arbitrary session keys keeps working."""
    try:
        return uuid.UUID(session_id)
    except (ValueError, AttributeError):
        digest = hashlib.sha256(f"sess:{session_id}".encode()).digest()[:16]
        return uuid.UUID(bytes=digest, version=4)


# ── POST /search/{session_id} ────────────────────────────────────────────────

@router.post("/search/{session_id}")
async def search(
    session_id: str,
    body: SearchRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> Dict[str, Any]:
    check_rate_limit("search", caller.subject)

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    logger.info("Search [session=%s thread=%s] query='%s'", session_id, body.thread_id, query)

    query_type = classify_query(query)
    search_query = rewrite_query_for_search(query)

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=2) as pool:
        sources_future = pool.submit(search_legal_sources, search_query)
        videos_future = pool.submit(search_videos, search_query)
        results = sources_future.result()
        videos = videos_future.result()
    search_latency_ms = int((time.perf_counter() - t0) * 1000)

    sess_uuid = _coerce_session_uuid(session_id)
    async with AsyncSessionLocal() as db:
        try:
            await repo.upsert_session(db, sess_uuid, caller.user_id)

            # Resolve the thread: either the one the client sent (must belong
            # to this user) or a fresh thread titled from the first query.
            if body.thread_id is not None:
                if not await repo.thread_belongs_to_user(
                    db, thread_id=body.thread_id, user_id=caller.user_id
                ):
                    raise HTTPException(status_code=404, detail="Thread not found")
                thread_id = body.thread_id
                await repo.bump_thread(db, thread_id)
            else:
                thread = await repo.create_thread(
                    db, user_id=caller.user_id, title=repo._derive_title(query)
                )
                thread_id = thread.id

            q = await repo.insert_query(
                db,
                session_id=sess_uuid,
                thread_id=thread_id,
                user_id=caller.user_id,
                raw_query=query,
                rewritten_query=search_query,
                query_type=query_type.value,
                result_count=len(results),
                search_latency_ms=search_latency_ms,
            )
            await repo.bulk_insert_search_results(db, q.id, results)
            await repo.bulk_insert_videos(db, q.id, videos)
            await db.commit()
        except HTTPException:
            await db.rollback()
            raise
        except Exception:
            await db.rollback()
            logger.exception("DB persist failed for /search")
            raise HTTPException(status_code=500, detail="Failed to persist search")

    return {
        "data": {
            "thread_id": str(thread_id),
            "query_id": str(q.id),
            "results": [r.model_dump() for r in results],
            "videos": [v.model_dump() for v in videos],
            "query_type": query_type.value,
            "search_query": search_query,
            "total": len(results),
        },
        "status": "success",
    }


# ── POST /answer/{session_id} ────────────────────────────────────────────────

@router.post("/answer/{session_id}")
async def answer(
    session_id: str,
    body: AnswerRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> StreamingResponse:
    check_rate_limit("answer", caller.subject)

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    sess_uuid = _coerce_session_uuid(session_id)
    user_id = caller.user_id

    # Resolve which query this answer is for. Three paths in order of preference:
    #   1. Client passed query_id → use it (with ownership check).
    #   2. Client passed thread_id → use the latest query in that thread.
    #   3. Fall back to inserting a new ad-hoc query in a fresh thread.
    async with AsyncSessionLocal() as db:
        await repo.upsert_session(db, sess_uuid, user_id)

        latest_q = None
        if body.query_id is not None:
            latest_q = await repo.get_query_owned_by(
                db, query_id=body.query_id, user_id=user_id
            )
            if latest_q is None:
                raise HTTPException(status_code=404, detail="Query not found")

        if latest_q is None and body.thread_id is not None:
            if not await repo.thread_belongs_to_user(
                db, thread_id=body.thread_id, user_id=user_id
            ):
                raise HTTPException(status_code=404, detail="Thread not found")
            previous_in_thread = await repo.previous_queries_for_thread(
                db, body.thread_id, limit=1
            )
            if previous_in_thread:
                # Pick the actual latest query row in this thread.
                from sqlalchemy import select  # local import — only used here
                from app.db import models
                latest_q = (await db.execute(
                    select(models.Query)
                    .where(models.Query.thread_id == body.thread_id)
                    .where(models.Query.deleted_at.is_(None))
                    .order_by(models.Query.created_at.desc())
                    .limit(1)
                )).scalar_one_or_none()

        if latest_q is None:
            # /answer with no /search history at all — make a thread + query
            # so the FK chain stays intact and the row shows up in history.
            thread = await repo.create_thread(
                db, user_id=user_id, title=repo._derive_title(query)
            )
            latest_q = await repo.insert_query(
                db,
                session_id=sess_uuid,
                thread_id=thread.id,
                user_id=user_id,
                raw_query=query,
                rewritten_query=None,
                query_type="general",
                result_count=0,
                search_latency_ms=None,
            )

        search_results = await repo.search_results_for_query(db, latest_q.id)
        previous_queries = await repo.previous_queries_for_thread(
            db, latest_q.thread_id, limit=3
        )
        query_type = latest_q.query_type
        pending = await repo.create_pending_answer(
            db, query_id=latest_q.id, model=_LLM_MODEL
        )
        answer_id = pending.id
        await db.commit()

    logger.info(
        "Answer [thread=%s query=%s] '%s' results=%d",
        latest_q.thread_id, latest_q.id, query, len(search_results),
    )

    async def event_stream():
        full_text = []
        t0 = time.perf_counter()
        try:
            for chunk in generate_legal_answer(
                query=query,
                query_type=query_type,
                search_results=search_results,
                previous_queries=previous_queries,
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            complete_text = "".join(full_text)
            citations = [c.__dict__ for c in extract_citations(complete_text)]
            suggested_steps = extract_suggested_steps(complete_text)
            latency_ms = int((time.perf_counter() - t0) * 1000)

            async with AsyncSessionLocal() as db2:
                try:
                    await repo.finalise_answer(
                        db2,
                        answer_id=answer_id,
                        content=complete_text,
                        latency_ms=latency_ms,
                        citations=citations,
                        suggested_steps=suggested_steps,
                    )
                    await db2.commit()
                except Exception:
                    await db2.rollback()
                    logger.exception("Failed to persist final answer")

            yield (
                "data: "
                + json.dumps({
                    "done": True,
                    "thread_id": str(latest_q.thread_id),
                    "query_id": str(latest_q.id),
                    "citations": citations,
                    "suggested_steps": suggested_steps,
                })
                + "\n\n"
            )

        except Exception as exc:
            logger.error("Streaming error: %s", exc)
            async with AsyncSessionLocal() as db2:
                try:
                    await repo.mark_answer_failed(db2, answer_id=answer_id, error=str(exc))
                    await db2.commit()
                except Exception:
                    await db2.rollback()
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── DELETE /session/{session_id} ─────────────────────────────────────────────

@router.delete("/session/{session_id}", status_code=204)
async def clear_session(
    session_id: str,
    caller: CallerIdentity = Depends(resolve_caller),  # noqa: ARG001 — auth gate only
) -> None:
    sess_uuid = _coerce_session_uuid(session_id)
    async with AsyncSessionLocal() as db:
        try:
            await repo.delete_session(db, sess_uuid)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to delete session")
            raise HTTPException(status_code=500, detail="Failed to clear session")


# ── GET /health ───────────────────────────────────────────────────────────────

@router.get("/health")
async def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "db": "enabled" if db_enabled() else "disabled",
        "auth": "enabled" if auth_enabled() else "disabled",
    }

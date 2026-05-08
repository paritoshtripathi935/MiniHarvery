"""
Query handler — FastAPI router with three endpoints.

POST /search/{session_id}    — run legal search and persist
POST /answer/{session_id}    — stream Harvey's legal answer via SSE
DELETE /session/{session_id} — clear session state

Every endpoint requires a valid Clerk session JWT (Authorization: Bearer …)
and a configured Postgres database. There is no guest path.
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
from app.models.query_model import SearchRequest
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

    logger.info("Search [session=%s] query='%s'", session_id, query)

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
            q = await repo.insert_query(
                db,
                session_id=sess_uuid,
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
        except Exception:
            await db.rollback()
            logger.exception("DB persist failed for /search")
            raise HTTPException(status_code=500, detail="Failed to persist search")

    return {
        "data": {
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
    body: SearchRequest,
    caller: CallerIdentity = Depends(resolve_caller),
) -> StreamingResponse:
    check_rate_limit("answer", caller.subject)

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    sess_uuid = _coerce_session_uuid(session_id)
    user_id = caller.user_id

    # Resolve / create the query row up-front so the streaming generator just
    # has an answer_id to update. We hold the prep session open only briefly.
    async with AsyncSessionLocal() as db:
        await repo.upsert_session(db, sess_uuid, user_id)
        latest_q = await repo.latest_query_for_session(db, sess_uuid)
        if latest_q is None:
            # /answer called without prior /search — insert an ad-hoc query
            # so the FK chain stays intact and the row shows up in history.
            latest_q = await repo.insert_query(
                db,
                session_id=sess_uuid,
                user_id=user_id,
                raw_query=query,
                rewritten_query=None,
                query_type="general",
                result_count=0,
                search_latency_ms=None,
            )
            search_results = []
            previous_queries = [query]
            query_type = "general"
        else:
            search_results = await repo.search_results_for_query(db, latest_q.id)
            previous_queries = await repo.previous_queries_for_session(db, sess_uuid, limit=3)
            query_type = latest_q.query_type
        pending = await repo.create_pending_answer(db, query_id=latest_q.id, model=_LLM_MODEL)
        answer_id = pending.id
        await db.commit()

    logger.info(
        "Answer [session=%s] query='%s' results=%d",
        session_id, query, len(search_results),
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
                    "citations": citations,
                    "suggested_steps": suggested_steps,
                })
                + "\n\n"
            )

        except Exception as exc:
            logger.error("Streaming error [session=%s]: %s", session_id, exc)
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

@router.delete("/session/{session_id}")
async def clear_session(
    session_id: str,
    caller: CallerIdentity = Depends(resolve_caller),  # noqa: ARG001 — auth gate only
) -> Dict[str, Any]:
    sess_uuid = _coerce_session_uuid(session_id)
    async with AsyncSessionLocal() as db:
        try:
            await repo.delete_session(db, sess_uuid)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to delete session in DB")
            raise HTTPException(status_code=500, detail="Failed to clear session")
    return {"data": None, "status": "success", "message": "Session cleared"}


# ── GET /health ───────────────────────────────────────────────────────────────

@router.get("/health")
async def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "db": "enabled" if db_enabled() else "disabled",
        "auth": "enabled" if auth_enabled() else "disabled",
    }

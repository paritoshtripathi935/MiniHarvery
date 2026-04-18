"""
Query handler — FastAPI router with three endpoints.
Mirrors MiniPerplexity's query_handler.py structure.

POST /search/{session_id}  — run legal search, store in session
POST /answer/{session_id}  — stream Harvey's legal answer via SSE
DELETE /session/{session_id} — clear session state
"""
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.models.query_model import SearchRequest
from app.services.legal_search_service import search_legal_sources, search_videos
from app.services.language_model import generate_legal_answer, rewrite_query_for_search
from app.services.query_classifier import classify_query
from app.utils.citation_formatter import extract_citations, extract_suggested_steps
from app.utils.rate_limiter import check_rate_limit
from app.utils.session_store import (
    delete_session,
    get_or_create_session,
    update_session,
)

router = APIRouter()
logger = logging.getLogger(__name__)


def _get_user_id(request: Request) -> str:
    """Extract user identifier for rate limiting (from header or IP fallback)."""
    return request.headers.get("X-User-Id") or request.client.host or "anonymous"


# ── POST /search/{session_id} ────────────────────────────────────────────────

@router.post("/search/{session_id}")
async def search(session_id: str, body: SearchRequest, request: Request) -> Dict[str, Any]:
    """
    1. Classify the query (case_law / statute / general)
    2. Run parallel legal search across Indian Kanoon, India Code, SCI
    3. Store results in session
    4. Return results + query_type to frontend
    """
    user_id = _get_user_id(request)
    check_rate_limit("search", user_id)

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    logger.info("Search [session=%s] query='%s'", session_id, query)

    query_type = classify_query(query)

    # Step 1 — rewrite the user's natural-language question into a focused
    # search query. Falls back to the raw query on any failure.
    search_query = rewrite_query_for_search(query)

    # Step 2 — legal sources and video search in parallel (videos shouldn't
    # add latency). Both use the rewritten query for better recall.
    with ThreadPoolExecutor(max_workers=2) as pool:
        sources_future = pool.submit(search_legal_sources, search_query)
        videos_future = pool.submit(search_videos, search_query)
        results = sources_future.result()
        videos = videos_future.result()

    # Store the ORIGINAL query in the session so the answer LLM sees what
    # the user actually asked (not the keyword form).
    update_session(session_id, [r.model_dump() for r in results], query, query_type.value)

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
async def answer(session_id: str, body: SearchRequest, request: Request) -> StreamingResponse:
    """
    Stream Harvey's legal answer via SSE.
    Retrieves search results from session, calls Cloudflare AI, streams chunks.
    Final chunk includes extracted citations and suggested steps.
    """
    user_id = _get_user_id(request)
    check_rate_limit("answer", user_id)

    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    session = get_or_create_session(session_id)

    # Reconstruct LegalSearchResult objects from session dict
    from app.models.search_model import LegalSearchResult
    search_results = [LegalSearchResult(**r) for r in session.search_results]

    logger.info(
        "Answer [session=%s] query='%s' results=%d",
        session_id, query, len(search_results),
    )

    def event_stream():
        full_text = []

        try:
            for chunk in generate_legal_answer(
                query=query,
                query_type=session.query_type,
                search_results=search_results,
                previous_queries=session.previous_queries,
            ):
                full_text.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            # After full response: extract citations + suggested steps
            complete_text = "".join(full_text)
            citations = [c.__dict__ for c in extract_citations(complete_text)]
            suggested_steps = extract_suggested_steps(complete_text)

            yield f"data: {json.dumps({'done': True, 'citations': citations, 'suggested_steps': suggested_steps})}\n\n"

        except Exception as exc:
            logger.error("Streaming error [session=%s]: %s", session_id, exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── DELETE /session/{session_id} ─────────────────────────────────────────────

@router.delete("/session/{session_id}")
async def clear_session(session_id: str) -> Dict[str, Any]:
    """Clear session state."""
    delete_session(session_id)
    return {"data": None, "status": "success", "message": "Session cleared"}


# ── GET /health ───────────────────────────────────────────────────────────────

@router.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}

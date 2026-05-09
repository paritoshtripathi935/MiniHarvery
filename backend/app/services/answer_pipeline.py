"""Streaming answer pipeline — query resolution, LLM call, persistence.

`prepare_answer` resolves *which* query the answer is for and creates the
pending row, all under one DB session. `stream_answer_sse` is the async
generator the handler hands to FastAPI's StreamingResponse — it owns
chunk yielding, citation extraction, and the finalise / mark-failed
paths in their own short-lived sessions.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import time
import uuid
from typing import AsyncGenerator, List, Optional

from fastapi import HTTPException

from app.db import AsyncSessionLocal
from app.db import repositories as repo
from app.core.settings import settings
from app.schemas.query_model import AnswerRequest
from app.schemas.search_model import LegalSearchResult
from app.services.citation_formatter import extract_citations, extract_suggested_steps
from app.services.cloudflare_ai import LlmCallMetrics
from app.services.language_model import generate_legal_answer

logger = logging.getLogger(__name__)


@dataclasses.dataclass(frozen=True)
class AnswerContext:
    """Everything the streamer needs after the query is resolved."""
    answer_id: uuid.UUID
    query_id: uuid.UUID
    thread_id: uuid.UUID
    user_id: uuid.UUID
    query_text: str
    query_type: str
    search_results: List[LegalSearchResult]
    previous_queries: List[str]


async def prepare_answer(
    *,
    session_uuid: uuid.UUID,
    user_id: uuid.UUID,
    inbox_matter_id: uuid.UUID,
    body: AnswerRequest,
) -> AnswerContext:
    """Resolve the target query and create a pending answer row.

    Three resolution paths in order of preference:
      1. Client sent `query_id` → use it (with ownership check).
      2. Client sent `thread_id` → use the latest query in that thread.
      3. Neither → mint a new thread + ad-hoc query so the FK chain holds
         and the row appears in the user's history.
    """
    query = body.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    async with AsyncSessionLocal() as db:
        await repo.upsert_session(db, session_uuid, user_id)

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
            latest_q = await repo.latest_query_in_thread(db, body.thread_id)

        if latest_q is None:
            thread = await repo.create_thread(
                db,
                user_id=user_id,
                matter_id=inbox_matter_id,
                title=repo.derive_thread_title(query),
            )
            latest_q = await repo.insert_query(
                db,
                session_id=session_uuid,
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
        pending = await repo.create_pending_answer(
            db, query_id=latest_q.id, model=settings.CLOUDFLARE_LLM_MODEL_ANSWER
        )
        await db.commit()

    logger.info(
        "Answer [thread=%s query=%s] '%s' results=%d",
        latest_q.thread_id, latest_q.id, query, len(search_results),
    )

    return AnswerContext(
        answer_id=pending.id,
        query_id=latest_q.id,
        thread_id=latest_q.thread_id,
        user_id=user_id,
        query_text=query,
        query_type=latest_q.query_type,
        search_results=search_results,
        previous_queries=previous_queries,
    )


async def stream_answer_sse(ctx: AnswerContext) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted lines: one `data: {chunk}` per token, then a
    terminal `data: {done: true, ...}` (or `data: {error: ...}`).

    Each finalise/mark-failed call opens its own session so the streaming
    phase doesn't hold a pool connection over the LLM round trip.
    """
    full_text: List[str] = []
    t0 = time.perf_counter()
    captured_metrics: List[LlmCallMetrics] = []

    def capture(m: LlmCallMetrics) -> None:
        captured_metrics.append(m)

    try:
        for chunk in generate_legal_answer(
            query=ctx.query_text,
            query_type=ctx.query_type,
            search_results=ctx.search_results,
            previous_queries=ctx.previous_queries,
            on_complete=capture,
        ):
            full_text.append(chunk)
            yield f"data: {json.dumps({'chunk': chunk})}\n\n"

        complete_text = "".join(full_text)
        citations = [c.__dict__ for c in extract_citations(complete_text)]
        suggested_steps = extract_suggested_steps(complete_text)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        metrics = captured_metrics[0] if captured_metrics else None
        await _finalise(
            ctx, complete_text, latency_ms, citations, suggested_steps, metrics,
        )

        yield (
            "data: "
            + json.dumps({
                "done": True,
                "thread_id": str(ctx.thread_id),
                "query_id": str(ctx.query_id),
                "citations": citations,
                "suggested_steps": suggested_steps,
                "metrics": _metrics_payload(metrics, latency_ms),
            })
            + "\n\n"
        )

    except Exception as exc:
        logger.error("Streaming error: %s", exc)
        metrics = captured_metrics[0] if captured_metrics else None
        await _mark_failed(ctx, str(exc), metrics)
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"


def _metrics_payload(
    metrics: Optional[LlmCallMetrics], outer_latency_ms: int,
) -> dict:
    """Shape the metrics dict the FE consumes. `outer_latency_ms` is the
    wall-clock from the start of streaming through finalise — useful when
    the LLM-internal latency is unavailable (e.g. CF not configured)."""
    if metrics is None:
        return {"latency_ms": outer_latency_ms}
    return {
        "model": metrics.model,
        "latency_ms": metrics.latency_ms,
        "ttft_ms": metrics.ttft_ms,
        "input_tokens": metrics.input_tokens,
        "output_tokens": metrics.output_tokens,
    }


async def _finalise(
    ctx: AnswerContext,
    content: str,
    latency_ms: int,
    citations: list,
    suggested_steps: list,
    metrics: Optional[LlmCallMetrics],
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await repo.finalise_answer(
                db,
                answer_id=ctx.answer_id,
                content=content,
                latency_ms=latency_ms,
                citations=citations,
                suggested_steps=suggested_steps,
            )
            if metrics is not None:
                await repo.record_llm_call(
                    db,
                    user_id=ctx.user_id,
                    call_site="answer",
                    model=metrics.model,
                    latency_ms=metrics.latency_ms,
                    ttft_ms=metrics.ttft_ms,
                    input_tokens=metrics.input_tokens,
                    output_tokens=metrics.output_tokens,
                    status=metrics.status,
                    query_id=ctx.query_id,
                    answer_id=ctx.answer_id,
                    error_class=metrics.error_class,
                )
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Failed to persist final answer")


async def _mark_failed(
    ctx: AnswerContext,
    error: str,
    metrics: Optional[LlmCallMetrics],
) -> None:
    async with AsyncSessionLocal() as db:
        try:
            await repo.mark_answer_failed(db, answer_id=ctx.answer_id, error=error)
            if metrics is not None:
                await repo.record_llm_call(
                    db,
                    user_id=ctx.user_id,
                    call_site="answer",
                    model=metrics.model,
                    latency_ms=metrics.latency_ms,
                    ttft_ms=metrics.ttft_ms,
                    input_tokens=metrics.input_tokens,
                    output_tokens=metrics.output_tokens,
                    status=metrics.status,
                    query_id=ctx.query_id,
                    answer_id=ctx.answer_id,
                    error_class=metrics.error_class,
                )
            await db.commit()
        except Exception:
            await db.rollback()

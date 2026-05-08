"""DB access layer used by the API. Keeps SQL out of query_handler."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings import settings
from app.db import models
from app.models.search_model import LegalSearchResult, VideoResult

logger = logging.getLogger(__name__)


# ── Users ───────────────────────────────────────────────────────────────────

async def upsert_clerk_user(
    db: AsyncSession,
    *,
    clerk_user_id: str,
    email: Optional[str] = None,
    display_name: Optional[str] = None,
) -> uuid.UUID:
    """Find-or-create a `users` row for a verified Clerk identity.

    `clerk_user_id` is the JWT `sub`. We do SELECT-then-INSERT (rather than
    INSERT...ON CONFLICT) because `users.clerk_user_id` is a partial unique
    index (WHERE clerk_user_id IS NOT NULL) — straightforward upsert syntax
    against a partial index is awkward, and this path runs once per request
    so the extra SELECT is cheap.
    """
    now = datetime.now(timezone.utc)
    existing = (
        await db.execute(
            select(models.User.id).where(models.User.clerk_user_id == clerk_user_id)
        )
    ).scalar_one_or_none()
    if existing is not None:
        await db.execute(
            update(models.User)
            .where(models.User.id == existing)
            .values(last_seen_at=now, email=email or models.User.email)
        )
        return existing

    new_id = uuid.uuid4()
    db.add(models.User(
        id=new_id,
        clerk_user_id=clerk_user_id,
        email=email,
        display_name=display_name,
    ))
    await db.flush()
    return new_id


# ── Sessions ────────────────────────────────────────────────────────────────

async def upsert_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> models.Session:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=settings.SESSION_TTL_SECONDS)
    stmt = (
        pg_insert(models.Session)
        .values(
            id=session_id,
            user_id=user_id,
            created_at=now,
            last_accessed_at=now,
            expires_at=expires,
        )
        .on_conflict_do_update(
            index_elements=["id"],
            set_={"last_accessed_at": now, "expires_at": expires},
        )
        .returning(models.Session)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def delete_session(db: AsyncSession, session_id: uuid.UUID) -> bool:
    result = await db.execute(
        delete(models.Session).where(models.Session.id == session_id)
    )
    return result.rowcount > 0


async def evict_expired_sessions(db: AsyncSession) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        delete(models.Session).where(models.Session.expires_at < now)
    )
    return result.rowcount or 0


# ── Threads ─────────────────────────────────────────────────────────────────

def _derive_title(raw_query: str, max_chars: int = 80) -> str:
    title = raw_query.strip().splitlines()[0] if raw_query.strip() else "Untitled"
    return title[:max_chars]


async def create_thread(
    db: AsyncSession, *, user_id: uuid.UUID, title: str
) -> models.Thread:
    thread = models.Thread(user_id=user_id, title=title)
    db.add(thread)
    await db.flush()
    return thread


async def thread_belongs_to_user(
    db: AsyncSession, *, thread_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    stmt = select(models.Thread.id).where(
        models.Thread.id == thread_id,
        models.Thread.user_id == user_id,
        models.Thread.deleted_at.is_(None),
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def bump_thread(db: AsyncSession, thread_id: uuid.UUID) -> None:
    await db.execute(
        update(models.Thread)
        .where(models.Thread.id == thread_id)
        .values(updated_at=datetime.now(timezone.utc))
    )


async def list_user_threads(
    db: AsyncSession, user_id: uuid.UUID, limit: int = 100
) -> List[dict]:
    """Sidebar payload — one row per thread, with query count."""
    from sqlalchemy import func
    stmt = (
        select(
            models.Thread.id,
            models.Thread.title,
            models.Thread.created_at,
            models.Thread.updated_at,
            func.count(models.Query.id).label("query_count"),
        )
        .join(
            models.Query,
            (models.Query.thread_id == models.Thread.id)
            & (models.Query.deleted_at.is_(None)),
            isouter=True,
        )
        .where(models.Thread.user_id == user_id)
        .where(models.Thread.deleted_at.is_(None))
        .group_by(models.Thread.id)
        .order_by(models.Thread.updated_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "created_at": r.created_at.isoformat(),
            "updated_at": r.updated_at.isoformat(),
            "query_count": r.query_count,
        }
        for r in rows
    ]


async def soft_delete_thread(
    db: AsyncSession, *, thread_id: uuid.UUID, user_id: uuid.UUID
) -> bool:
    """Soft-delete a single thread the user owns."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(models.Thread)
        .where(models.Thread.id == thread_id)
        .where(models.Thread.user_id == user_id)
        .where(models.Thread.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    return result.rowcount > 0


async def soft_delete_all_user_threads(
    db: AsyncSession, user_id: uuid.UUID
) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(models.Thread)
        .where(models.Thread.user_id == user_id)
        .where(models.Thread.deleted_at.is_(None))
        .values(deleted_at=now)
    )
    return result.rowcount or 0


# ── Queries ─────────────────────────────────────────────────────────────────

async def insert_query(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    thread_id: uuid.UUID,
    user_id: uuid.UUID,
    raw_query: str,
    rewritten_query: Optional[str],
    query_type: str,
    result_count: int,
    search_latency_ms: Optional[int],
) -> models.Query:
    q = models.Query(
        session_id=session_id,
        thread_id=thread_id,
        user_id=user_id,
        raw_query=raw_query,
        rewritten_query=rewritten_query,
        query_type=query_type,
        result_count=result_count,
        search_latency_ms=search_latency_ms,
    )
    db.add(q)
    await db.flush()
    return q


async def previous_queries_for_thread(
    db: AsyncSession, thread_id: uuid.UUID, limit: int = 3
) -> List[str]:
    stmt = (
        select(models.Query.raw_query)
        .where(models.Query.thread_id == thread_id)
        .where(models.Query.deleted_at.is_(None))
        .order_by(models.Query.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(reversed(rows))  # chronological for the LLM prompt


async def get_query_owned_by(
    db: AsyncSession, *, query_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[models.Query]:
    stmt = (
        select(models.Query)
        .where(models.Query.id == query_id)
        .where(models.Query.user_id == user_id)
        .where(models.Query.deleted_at.is_(None))
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def fetch_thread_full(
    db: AsyncSession, *, thread_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[dict]:
    """One nested payload: thread + every query with answer + sources + videos
    + citations + suggested_steps. Returns None if the thread doesn't belong
    to the user (or doesn't exist / is soft-deleted)."""
    thread = (await db.execute(
        select(models.Thread)
        .where(models.Thread.id == thread_id)
        .where(models.Thread.user_id == user_id)
        .where(models.Thread.deleted_at.is_(None))
    )).scalar_one_or_none()
    if thread is None:
        return None

    queries = (await db.execute(
        select(models.Query)
        .where(models.Query.thread_id == thread_id)
        .where(models.Query.deleted_at.is_(None))
        .order_by(models.Query.created_at)
    )).scalars().all()
    if not queries:
        return {
            "id": str(thread.id),
            "title": thread.title,
            "created_at": thread.created_at.isoformat(),
            "updated_at": thread.updated_at.isoformat(),
            "messages": [],
        }

    query_ids = [q.id for q in queries]
    results_by_query = await _group_search_results(db, query_ids)
    videos_by_query = await _group_videos(db, query_ids)
    answers_by_query = await _group_answers(db, query_ids)

    messages = []
    for q in queries:
        answer = answers_by_query.get(q.id)
        messages.append({
            "query_id": str(q.id),
            "thread_id": str(q.thread_id),
            "raw_query": q.raw_query,
            "query_type": q.query_type,
            "created_at": q.created_at.isoformat(),
            "search_results": results_by_query.get(q.id, []),
            "videos": videos_by_query.get(q.id, []),
            "answer": answer,
        })
    return {
        "id": str(thread.id),
        "title": thread.title,
        "created_at": thread.created_at.isoformat(),
        "updated_at": thread.updated_at.isoformat(),
        "messages": messages,
    }


async def _group_search_results(
    db: AsyncSession, query_ids: List[uuid.UUID]
) -> dict:
    rows = (await db.execute(
        select(models.SearchResult)
        .where(models.SearchResult.query_id.in_(query_ids))
        .order_by(models.SearchResult.query_id, models.SearchResult.rank)
    )).scalars().all()
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r.query_id, []).append({
            "title": r.title, "url": r.url,
            "snippet": r.snippet or "",
            "search_content": r.search_content or "",
            "source": r.source, "doc_type": r.doc_type,
            "jurisdiction": r.jurisdiction, "citation": r.citation, "year": r.year,
            "question": "",
        })
    return grouped


async def _group_videos(db: AsyncSession, query_ids: List[uuid.UUID]) -> dict:
    rows = (await db.execute(
        select(models.Video)
        .where(models.Video.query_id.in_(query_ids))
        .order_by(models.Video.query_id, models.Video.rank)
    )).scalars().all()
    grouped: dict = {}
    for v in rows:
        grouped.setdefault(v.query_id, []).append({
            "video_id": v.video_id, "title": v.title or "",
            "channel": v.channel or "", "description": v.description or "",
            "thumbnail_url": v.thumbnail_url or "", "url": v.url,
            "published_at": v.published_at.isoformat() if v.published_at else None,
            "duration": (
                f"PT{v.duration_seconds}S" if v.duration_seconds else None
            ),
        })
    return grouped


async def _group_answers(db: AsyncSession, query_ids: List[uuid.UUID]) -> dict:
    answers = (await db.execute(
        select(models.Answer).where(models.Answer.query_id.in_(query_ids))
    )).scalars().all()
    if not answers:
        return {}

    answer_ids = [a.id for a in answers]
    citations_rows = (await db.execute(
        select(models.Citation)
        .where(models.Citation.answer_id.in_(answer_ids))
    )).scalars().all()
    steps_rows = (await db.execute(
        select(models.SuggestedStep)
        .where(models.SuggestedStep.answer_id.in_(answer_ids))
        .order_by(models.SuggestedStep.answer_id, models.SuggestedStep.rank)
    )).scalars().all()

    citations_by_answer: dict = {}
    for c in citations_rows:
        citations_by_answer.setdefault(c.answer_id, []).append({
            "text": c.citation_text,
            "citation_type": c.citation_type or "",
            "url": "",
        })
    steps_by_answer: dict = {}
    for s in steps_rows:
        steps_by_answer.setdefault(s.answer_id, []).append(s.text_)

    grouped: dict = {}
    for a in answers:
        grouped[a.query_id] = {
            "content": a.content,
            "status": a.status,
            "model": a.model,
            "latency_ms": a.latency_ms,
            "citations": citations_by_answer.get(a.id, []),
            "suggested_steps": steps_by_answer.get(a.id, []),
        }
    return grouped


# ── Search results ──────────────────────────────────────────────────────────

async def bulk_insert_search_results(
    db: AsyncSession, query_id: uuid.UUID, results: Iterable[LegalSearchResult]
) -> None:
    rows = [
        {
            "query_id": query_id,
            "rank": idx,
            "source": r.source,
            "doc_type": r.doc_type,
            "title": r.title,
            "url": r.url,
            "snippet": r.snippet,
            "search_content": r.search_content,
            "jurisdiction": r.jurisdiction,
            "citation": r.citation,
            "year": r.year,
        }
        for idx, r in enumerate(results)
    ]
    if rows:
        await db.execute(pg_insert(models.SearchResult).values(rows))


async def search_results_for_query(
    db: AsyncSession, query_id: uuid.UUID
) -> List[LegalSearchResult]:
    stmt = (
        select(models.SearchResult)
        .where(models.SearchResult.query_id == query_id)
        .order_by(models.SearchResult.rank)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        LegalSearchResult(
            question="",  # not persisted — populated by caller if needed
            title=r.title,
            url=r.url,
            snippet=r.snippet or "",
            search_content=r.search_content or "",
            source=r.source,
            doc_type=r.doc_type,
            jurisdiction=r.jurisdiction,
            citation=r.citation,
            year=r.year,
        )
        for r in rows
    ]


# ── Videos ──────────────────────────────────────────────────────────────────

def _parse_iso_duration_to_seconds(iso: Optional[str]) -> Optional[int]:
    """Naive ISO-8601 duration parser (PT#H#M#S). Returns None on failure."""
    if not iso or not iso.startswith("PT"):
        return None
    seconds, num = 0, ""
    for ch in iso[2:]:
        if ch.isdigit():
            num += ch
        elif ch == "H":
            seconds += int(num or 0) * 3600; num = ""
        elif ch == "M":
            seconds += int(num or 0) * 60; num = ""
        elif ch == "S":
            seconds += int(num or 0); num = ""
        else:
            return None
    return seconds or None


async def bulk_insert_videos(
    db: AsyncSession, query_id: uuid.UUID, videos: Iterable[VideoResult]
) -> None:
    rows = []
    for idx, v in enumerate(videos):
        published_at: Optional[datetime] = None
        if v.published_at:
            try:
                published_at = datetime.fromisoformat(v.published_at.replace("Z", "+00:00"))
            except ValueError:
                published_at = None
        rows.append({
            "query_id": query_id,
            "rank": idx,
            "video_id": v.video_id,
            "title": v.title,
            "channel": v.channel,
            "description": v.description,
            "thumbnail_url": v.thumbnail_url,
            "url": v.url,
            "published_at": published_at,
            "duration_seconds": _parse_iso_duration_to_seconds(v.duration),
        })
    if rows:
        await db.execute(pg_insert(models.Video).values(rows))


# ── Answers / citations / suggested steps ───────────────────────────────────

async def create_pending_answer(
    db: AsyncSession, *, query_id: uuid.UUID, model: str
) -> models.Answer:
    answer = models.Answer(query_id=query_id, model=model, status="streaming")
    db.add(answer)
    await db.flush()
    return answer


async def finalise_answer(
    db: AsyncSession,
    *,
    answer_id: uuid.UUID,
    content: str,
    latency_ms: int,
    citations: List[dict],
    suggested_steps: List[str],
) -> None:
    now = datetime.now(timezone.utc)
    await db.execute(
        update(models.Answer)
        .where(models.Answer.id == answer_id)
        .values(
            content=content,
            status="complete",
            completed_at=now,
            latency_ms=latency_ms,
        )
    )
    if citations:
        await db.execute(pg_insert(models.Citation).values([
            {
                "answer_id": answer_id,
                "citation_text": c.get("text") or c.get("citation_text") or "",
                "citation_type": c.get("type") or c.get("citation_type"),
                "char_start": c.get("start") or c.get("char_start"),
                "char_end": c.get("end") or c.get("char_end"),
            }
            for c in citations
            if (c.get("text") or c.get("citation_text"))
        ]))
    if suggested_steps:
        await db.execute(pg_insert(models.SuggestedStep).values([
            {"answer_id": answer_id, "rank": i, "text": s}
            for i, s in enumerate(suggested_steps)
        ]))


async def mark_answer_failed(
    db: AsyncSession, *, answer_id: uuid.UUID, error: str
) -> None:
    await db.execute(
        update(models.Answer)
        .where(models.Answer.id == answer_id)
        .values(
            status="error",
            error_message=error[:2000],
            completed_at=datetime.now(timezone.utc),
        )
    )

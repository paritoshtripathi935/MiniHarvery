"""DB access layer used by the API. Keeps SQL out of query_handler."""
from __future__ import annotations

import hashlib
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

def _stable_user_uuid(subject: str) -> uuid.UUID:
    """Deterministic UUID from a subject key (X-User-Id header / IP).

    Lets us upsert a guest row idempotently — same browser/device hits the
    same row across requests without storing a separate cookie mapping.
    """
    digest = hashlib.sha256(f"guest:{subject}".encode()).digest()[:16]
    return uuid.UUID(bytes=digest, version=4)


async def upsert_guest_user(db: AsyncSession, subject: str) -> uuid.UUID:
    user_id = _stable_user_uuid(subject)
    stmt = (
        pg_insert(models.User)
        .values(id=user_id, is_guest=True, display_name=f"guest:{subject[:32]}")
        .on_conflict_do_update(
            index_elements=["id"],
            set_={"last_seen_at": datetime.now(timezone.utc)},
        )
    )
    await db.execute(stmt)
    return user_id


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


# ── Queries ─────────────────────────────────────────────────────────────────

async def insert_query(
    db: AsyncSession,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    raw_query: str,
    rewritten_query: Optional[str],
    query_type: str,
    result_count: int,
    search_latency_ms: Optional[int],
) -> models.Query:
    q = models.Query(
        session_id=session_id,
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


async def previous_queries_for_session(
    db: AsyncSession, session_id: uuid.UUID, limit: int = 3
) -> List[str]:
    stmt = (
        select(models.Query.raw_query)
        .where(models.Query.session_id == session_id)
        .where(models.Query.deleted_at.is_(None))
        .order_by(models.Query.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(reversed(rows))  # chronological for the LLM prompt


async def latest_query_for_session(
    db: AsyncSession, session_id: uuid.UUID
) -> Optional[models.Query]:
    stmt = (
        select(models.Query)
        .where(models.Query.session_id == session_id)
        .where(models.Query.deleted_at.is_(None))
        .order_by(models.Query.created_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


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

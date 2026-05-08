"""ORM models — mirrors docs/schema.sql exactly.

One file because the surface is small (11 tables) and cross-references are
easier to scan inline than across modules.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import CITEXT, ENUM, JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# ── Enums ───────────────────────────────────────────────────────────────────
QueryTypeEnum = ENUM(
    "case_law", "statute", "general",
    name="query_type_enum", create_type=False,
)
SourceEnum = ENUM(
    "indian_kanoon", "india_code", "sci", "google",
    name="source_enum", create_type=False,
)
DocTypeEnum = ENUM(
    "judgment", "act", "article", "general",
    name="doc_type_enum", create_type=False,
)
AnswerStatusEnum = ENUM(
    "streaming", "complete", "error",
    name="answer_status_enum", create_type=False,
)


# ── users ───────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index(
            "users_clerk_user_id_uq",
            "clerk_user_id",
            unique=True,
            postgresql_where=text("clerk_user_id IS NOT NULL"),
        ),
        Index("users_last_seen_at_idx", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    clerk_user_id: Mapped[Optional[str]] = mapped_column(Text)
    is_guest: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    email: Mapped[Optional[str]] = mapped_column(CITEXT)
    display_name: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))


# ── sessions ────────────────────────────────────────────────────────────────
class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("sessions_user_recent_idx", "user_id", "last_accessed_at"),
        Index("sessions_expires_at_idx", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    last_accessed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


# ── queries ─────────────────────────────────────────────────────────────────
class Query(Base):
    __tablename__ = "queries"
    __table_args__ = (
        Index(
            "queries_user_history_idx",
            "user_id", "created_at",
            postgresql_where=text("deleted_at IS NULL"),
        ),
        Index("queries_session_idx", "session_id", "created_at"),
        Index(
            "queries_raw_query_fts_idx",
            text("to_tsvector('english', raw_query)"),
            postgresql_using="gin",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    raw_query: Mapped[str] = mapped_column(Text, nullable=False)
    rewritten_query: Mapped[Optional[str]] = mapped_column(Text)
    query_type: Mapped[str] = mapped_column(QueryTypeEnum, nullable=False)
    result_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    search_latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))


# ── documents ───────────────────────────────────────────────────────────────
class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    url: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    source: Mapped[str] = mapped_column(SourceEnum, nullable=False)
    doc_type: Mapped[str] = mapped_column(DocTypeEnum, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    citation: Mapped[Optional[str]] = mapped_column(Text)
    jurisdiction: Mapped[Optional[str]] = mapped_column(Text)
    year: Mapped[Optional[int]] = mapped_column(SmallInteger)
    content: Mapped[Optional[str]] = mapped_column(Text)
    content_hash: Mapped[Optional[bytes]] = mapped_column(LargeBinary)
    first_fetched_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    last_fetched_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    fetch_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))


# ── search_results ──────────────────────────────────────────────────────────
class SearchResult(Base):
    __tablename__ = "search_results"
    __table_args__ = (
        Index("search_results_query_rank_idx", "query_id", "rank"),
        Index("search_results_url_idx", "url"),
        Index(
            "search_results_citation_idx",
            "citation",
            postgresql_where=text("citation IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="SET NULL")
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    source: Mapped[str] = mapped_column(SourceEnum, nullable=False)
    doc_type: Mapped[str] = mapped_column(DocTypeEnum, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    snippet: Mapped[Optional[str]] = mapped_column(Text)
    search_content: Mapped[Optional[str]] = mapped_column(Text)
    jurisdiction: Mapped[Optional[str]] = mapped_column(Text)
    citation: Mapped[Optional[str]] = mapped_column(Text)
    year: Mapped[Optional[int]] = mapped_column(SmallInteger)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


# ── videos ──────────────────────────────────────────────────────────────────
class Video(Base):
    __tablename__ = "videos"
    __table_args__ = (
        Index("videos_query_rank_idx", "query_id", "rank"),
        Index("videos_video_id_idx", "video_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    video_id: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    channel: Mapped[Optional[str]] = mapped_column(Text)
    description: Mapped[Optional[str]] = mapped_column(Text)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


# ── answers ─────────────────────────────────────────────────────────────────
class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        Index("answers_created_at_idx", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("queries.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    model: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(
        AnswerStatusEnum, nullable=False, server_default=text("'streaming'")
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMP(timezone=True))
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)


# ── citations ───────────────────────────────────────────────────────────────
class Citation(Base):
    __tablename__ = "citations"
    __table_args__ = (
        Index("citations_answer_idx", "answer_id"),
        Index("citations_text_idx", "citation_text"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    answer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    source_result_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("search_results.id", ondelete="SET NULL")
    )
    citation_text: Mapped[str] = mapped_column(Text, nullable=False)
    citation_type: Mapped[Optional[str]] = mapped_column(Text)
    char_start: Mapped[Optional[int]] = mapped_column(Integer)
    char_end: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


# ── suggested_steps ─────────────────────────────────────────────────────────
class SuggestedStep(Base):
    __tablename__ = "suggested_steps"
    __table_args__ = (
        UniqueConstraint("answer_id", "rank"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    answer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    text_: Mapped[str] = mapped_column("text", Text, nullable=False)


# ── bookmarks ───────────────────────────────────────────────────────────────
class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "query_id"),
        Index("bookmarks_user_idx", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE"), nullable=False
    )
    note: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


# ── feedback ────────────────────────────────────────────────────────────────
class Feedback(Base):
    __tablename__ = "feedback"
    __table_args__ = (
        CheckConstraint("rating IN (-1, 0, 1)"),
        UniqueConstraint("user_id", "answer_id"),
        Index("feedback_answer_idx", "answer_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    answer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


# ── rate_limits ─────────────────────────────────────────────────────────────
class RateLimit(Base):
    __tablename__ = "rate_limits"
    __table_args__ = (
        Index("rate_limits_window_idx", "window_start"),
    )

    subject: Mapped[str] = mapped_column(Text, primary_key=True)
    endpoint: Mapped[str] = mapped_column(Text, primary_key=True)
    window_start: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), primary_key=True
    )
    count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

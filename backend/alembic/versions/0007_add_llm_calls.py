"""llm_calls — per-call telemetry for every Cloudflare Workers AI invocation.

Captures latency, token usage, model, status, and the row this call
produced (matter / query / document / answer FKs, all nullable). Goal
is to inform a future caching layer: we need to know how often the
same prompt is hashed before we know what's worth caching.

Pure additive migration — new table only, no NOT NULL on existing
tables, safe under expand-then-contract.

Revision ID: 0007_add_llm_calls
Revises: 0006_add_documents
Create Date: 2026-05-09
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision: str = "0007_add_llm_calls"
down_revision: Union[str, None] = "0006_add_documents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_calls",
        sa.Column(
            "id", pg.UUID(as_uuid=True),
            primary_key=True, server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("call_site", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        # Optional anchors — every call belongs to at most one of these.
        sa.Column(
            "matter_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "query_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("queries.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "document_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "answer_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("answers.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        # ttft_ms (time to first token) only set for streaming calls.
        sa.Column("ttft_ms", sa.Integer(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("error_class", sa.Text(), nullable=True),
        # SHA-256 hex of the canonicalised prompt — populated when the call
        # site can produce a stable hash. Used later to identify cache
        # candidates (same prompt → same response).
        sa.Column("prompt_hash", sa.Text(), nullable=True),
        sa.Column(
            "created_at", pg.TIMESTAMP(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
    )
    op.create_check_constraint(
        "llm_calls_call_site_check", "llm_calls",
        "call_site IN ('rewrite', 'answer', 'brief', 'draft')",
    )
    op.create_check_constraint(
        "llm_calls_status_check", "llm_calls",
        "status IN ('success', 'error', 'timeout')",
    )
    op.create_index(
        "llm_calls_user_recent_idx", "llm_calls",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "llm_calls_call_site_recent_idx", "llm_calls",
        ["call_site", sa.text("created_at DESC")],
    )
    # For cache analysis later: how often does the same prompt hash appear?
    op.create_index(
        "llm_calls_prompt_hash_idx", "llm_calls",
        ["call_site", "prompt_hash"],
        postgresql_where=sa.text("prompt_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("llm_calls_prompt_hash_idx", table_name="llm_calls")
    op.drop_index("llm_calls_call_site_recent_idx", table_name="llm_calls")
    op.drop_index("llm_calls_user_recent_idx", table_name="llm_calls")
    op.drop_table("llm_calls")

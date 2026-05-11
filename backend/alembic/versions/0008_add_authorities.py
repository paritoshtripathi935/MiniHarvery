"""authorities — per-matter pinned cases for Table-of-Authorities generation.

One row per (matter, case). Idempotent on (matter_id, indian_kanoon_tid)
when the case originates from Indian Kanoon (the canonical de-dup key),
falling back to (matter_id, lower(case_name)) when it doesn't. Pinning
the same case twice from different surfaces is a no-op.

Pure additive migration — new table only, safe under expand-then-contract.

Revision ID: 0008_add_authorities
Revises: 0007_add_llm_calls
Create Date: 2026-05-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision: str = "0008_add_authorities"
down_revision: Union[str, None] = "0007_add_llm_calls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "authorities",
        sa.Column(
            "id", pg.UUID(as_uuid=True),
            primary_key=True, server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "matter_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "user_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        # Case identity
        sa.Column("case_name", sa.Text(), nullable=False),
        sa.Column("citation", sa.Text(), nullable=True),
        sa.Column("court", sa.Text(), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("source_url", sa.Text(), nullable=True),
        # Canonical de-dup key when the case comes from IK; parsed from the
        # source URL path. Free-text non-IK cases fall back to case_name.
        sa.Column("indian_kanoon_tid", sa.Text(), nullable=True),
        # Advocate-authored
        sa.Column(
            "proposition", sa.Text(),
            nullable=False, server_default=sa.text("''"),
        ),
        sa.Column(
            "paragraphs", pg.JSONB(),
            nullable=False, server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        # Provenance — nullable + ON DELETE SET NULL so deleting the source
        # document/thread/answer doesn't cascade-delete the authority.
        sa.Column(
            "first_pinned_from_document_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "first_pinned_from_thread_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("threads.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "first_pinned_from_answer_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("answers.id", ondelete="SET NULL"), nullable=True,
        ),
        # User-reorderable in v1.5; defaults to insertion order.
        sa.Column(
            "sort_order", sa.Integer(),
            nullable=False, server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at", pg.TIMESTAMP(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", pg.TIMESTAMP(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", pg.TIMESTAMP(timezone=True), nullable=True),
    )

    # List per matter
    op.create_index(
        "authorities_matter_recent_idx", "authorities",
        ["matter_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # IK tid is the canonical de-dup key when present
    op.create_index(
        "authorities_matter_ik_uq", "authorities",
        ["matter_id", "indian_kanoon_tid"],
        unique=True,
        postgresql_where=sa.text(
            "indian_kanoon_tid IS NOT NULL AND deleted_at IS NULL"
        ),
    )
    # Fallback de-dup for non-IK cases: case-insensitive name within matter
    op.create_index(
        "authorities_matter_name_uq", "authorities",
        ["matter_id", sa.text("lower(case_name)")],
        unique=True,
        postgresql_where=sa.text(
            "indian_kanoon_tid IS NULL AND deleted_at IS NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("authorities_matter_name_uq", table_name="authorities")
    op.drop_index("authorities_matter_ik_uq", table_name="authorities")
    op.drop_index("authorities_matter_recent_idx", table_name="authorities")
    op.drop_table("authorities")

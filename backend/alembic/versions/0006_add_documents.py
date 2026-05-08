"""documents — polymorphic store for case briefs, drafts, notes, etc.

A Document is anything the lawyer wants to *keep* inside a matter (vs.
threads, which are ephemeral research scratchpads). The schema is
deliberately polymorphic via a `type` column + `content` jsonb so adding
new document kinds (drafts, authorities tables, etc.) is a one-liner —
no new table per type.

Revision ID: 0006_add_documents
Revises: 0005_add_matters
Create Date: 2026-05-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision: str = "0006_add_documents"
down_revision: Union[str, None] = "0005_add_matters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Repurpose the `documents` name. The legacy 0001 schema declared a
    # `documents` table as a URL-keyed cross-query cache (search_results
    # had a `document_id` FK pointing at it). That cache was never wired up
    # — empty in production. Drop it so we can rebuild the name as the
    # polymorphic case-brief / draft / note store.
    op.execute(
        "ALTER TABLE search_results DROP CONSTRAINT IF EXISTS "
        "search_results_document_id_fkey"
    )
    op.execute("ALTER TABLE search_results DROP COLUMN IF EXISTS document_id")
    op.execute("DROP TABLE IF EXISTS documents")

    op.create_table(
        "documents",
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
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        # content is type-specific. For case_brief:
        #   {facts, issues, arguments_petitioner, arguments_respondent,
        #    ratio, holding, dicta, citations: [...]}
        sa.Column(
            "content", pg.JSONB(),
            nullable=False, server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column(
            "source_query_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("queries.id", ondelete="SET NULL"), nullable=True,
        ),
        sa.Column(
            "status", sa.Text(),
            nullable=False, server_default=sa.text("'draft'"),
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
    op.create_check_constraint(
        "documents_type_check", "documents",
        "type IN ('case_brief', 'pleading_draft', 'authorities_table', 'note')",
    )
    op.create_check_constraint(
        "documents_status_check", "documents",
        "status IN ('draft', 'final')",
    )
    op.create_index(
        "documents_matter_recent_idx", "documents",
        ["matter_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "documents_user_type_idx", "documents",
        ["user_id", "type"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("documents_user_type_idx", table_name="documents")
    op.drop_index("documents_matter_recent_idx", table_name="documents")
    op.drop_table("documents")

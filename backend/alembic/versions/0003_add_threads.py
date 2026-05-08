"""add threads + queries.thread_id

Threads are the user-facing conversation grouping. A thread spans many
queries; a query has at most one thread. We keep `session_id` on queries
unchanged for backwards compat with the URL pattern /search/{session_id}.

Revision ID: 0003_add_threads
Revises: 0002_drop_users_is_guest
Create Date: 2026-05-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_add_threads"
down_revision: Union[str, None] = "0002_drop_users_is_guest"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "threads",
        sa.Column(
            "id", sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True, server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.dialects.postgresql.TIMESTAMP(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at", sa.dialects.postgresql.TIMESTAMP(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.dialects.postgresql.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "threads_user_recent_idx",
        "threads",
        ["user_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # Add thread_id to queries. Nullable so we can backfill existing rows in
    # one shot, then enforce NOT NULL.
    op.add_column(
        "queries",
        sa.Column(
            "thread_id", sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("threads.id", ondelete="CASCADE"), nullable=True,
        ),
    )

    # Backfill: every existing query gets its own single-query thread, owned
    # by the same user, titled by its raw_query (truncated). Cheap and keeps
    # all historical data visible in the new UI.
    op.execute("""
        WITH new_threads AS (
            INSERT INTO threads (id, user_id, title, created_at, updated_at)
            SELECT
                gen_random_uuid(),
                q.user_id,
                LEFT(q.raw_query, 80),
                q.created_at,
                q.created_at
            FROM queries q
            RETURNING id, user_id, created_at
        )
        UPDATE queries q
        SET thread_id = nt.id
        FROM new_threads nt
        WHERE nt.user_id = q.user_id AND nt.created_at = q.created_at
          AND q.thread_id IS NULL
    """)

    # If any row is still null (extremely unlikely — only if two queries from
    # the same user share the exact same created_at to the microsecond) just
    # delete those orphan queries. Better than leaving the schema half-typed.
    op.execute("DELETE FROM queries WHERE thread_id IS NULL")
    op.alter_column("queries", "thread_id", nullable=False)
    op.create_index("queries_thread_idx", "queries", ["thread_id", "created_at"])


def downgrade() -> None:
    op.drop_index("queries_thread_idx", table_name="queries")
    op.drop_column("queries", "thread_id")
    op.drop_index("threads_user_recent_idx", table_name="threads")
    op.drop_table("threads")

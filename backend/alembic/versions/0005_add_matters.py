"""matters + threads.matter_id (clean slate)

Matter = the user-facing case file. Sits above threads in the hierarchy:
    user -> matter -> thread -> query -> ...

The user requested no backfill. We TRUNCATE threads (cascading through all
queries / search_results / videos / answers / citations / suggested_steps /
sessions) and require threads.matter_id NOT NULL going forward.

Revision ID: 0005_add_matters
Revises: 0004_user_mode
Create Date: 2026-05-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg

revision: str = "0005_add_matters"
down_revision: Union[str, None] = "0004_user_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Clean slate — no backfill requested. CASCADE through threads kills
    # queries -> (search_results, videos, answers -> citations + steps).
    # Sessions are independently truncated since they were FK'd from queries.
    op.execute("TRUNCATE TABLE threads CASCADE")
    op.execute("TRUNCATE TABLE sessions CASCADE")

    op.create_table(
        "matters",
        sa.Column(
            "id", pg.UUID(as_uuid=True),
            primary_key=True, server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        # parties: [{role: 'plaintiff'|'defendant'|'petitioner'|..., name: '...'}]
        sa.Column(
            "parties", pg.JSONB(),
            nullable=False, server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("court", sa.Text(), nullable=True),
        sa.Column("cause_number", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.Text(),
            nullable=False, server_default=sa.text("'active'"),
        ),
        # is_inbox flags the auto-created 'Inbox' matter for unscoped research.
        # Indexed below so resolve_caller can fetch it in O(1).
        sa.Column(
            "is_inbox", sa.Boolean(),
            nullable=False, server_default=sa.text("false"),
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
        "matters_status_check", "matters",
        "status IN ('active', 'closed', 'archived')",
    )
    op.create_index(
        "matters_user_recent_idx", "matters",
        ["user_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    # One inbox per user. Partial unique so a user can have only one row
    # with is_inbox=true (the auto-created landing matter).
    op.create_index(
        "matters_user_inbox_uq", "matters",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_inbox = true AND deleted_at IS NULL"),
    )

    op.add_column(
        "threads",
        sa.Column(
            "matter_id", pg.UUID(as_uuid=True),
            sa.ForeignKey("matters.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index(
        "threads_matter_recent_idx", "threads",
        ["matter_id", "updated_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("threads_matter_recent_idx", table_name="threads")
    op.drop_column("threads", "matter_id")
    op.drop_index("matters_user_inbox_uq", table_name="matters")
    op.drop_index("matters_user_recent_idx", table_name="matters")
    op.drop_table("matters")

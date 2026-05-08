"""user mode + firm_name + bar_council_id

Carries the 'who is this user' metadata Vidhi uses to (eventually) gate
features per segment — associate / solo / student. Default is 'associate'
since v2 is built for mid-firm associates first.

Revision ID: 0004_user_mode
Revises: 0003_add_threads
Create Date: 2026-05-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004_user_mode"
down_revision: Union[str, None] = "0003_add_threads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Using TEXT + CHECK rather than a Postgres ENUM: makes adding new modes
# (e.g. 'paralegal') a one-line ALTER instead of a multi-step enum migration.
def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "mode", sa.Text(),
            nullable=False, server_default=sa.text("'associate'"),
        ),
    )
    op.create_check_constraint(
        "users_mode_check",
        "users",
        "mode IN ('associate', 'solo', 'student')",
    )
    op.add_column("users", sa.Column("firm_name", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("bar_council_id", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "bar_council_id")
    op.drop_column("users", "firm_name")
    op.drop_constraint("users_mode_check", "users", type_="check")
    op.drop_column("users", "mode")

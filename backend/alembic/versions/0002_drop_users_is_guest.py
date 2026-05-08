"""drop users.is_guest

Guest mode was removed from the application. The column has no readers and
no writers; dropping it keeps the schema honest.

Revision ID: 0002_drop_users_is_guest
Revises: 0001_initial_schema
Create Date: 2026-05-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_drop_users_is_guest"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("users", "is_guest")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_guest",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

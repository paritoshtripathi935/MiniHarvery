"""initial schema — runs docs/schema.sql verbatim

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-08
"""
from __future__ import annotations

from pathlib import Path
from typing import Sequence, Union

from alembic import op

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Path to docs/schema.sql relative to repo root. The migration is the
# single source of truth for v1 — no hand-rolled op.create_table() calls
# duplicating the same DDL.
SCHEMA_SQL = (
    Path(__file__).resolve().parents[3] / "docs" / "schema.sql"
)


def upgrade() -> None:
    sql = SCHEMA_SQL.read_text()
    # The file wraps everything in BEGIN/COMMIT; Alembic already runs in a
    # transaction, and nested BEGINs are no-ops in psycopg but cleaner stripped.
    sql = sql.replace("BEGIN;", "").replace("COMMIT;", "")
    op.execute(sql)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS rate_limits CASCADE;
        DROP TABLE IF EXISTS feedback CASCADE;
        DROP TABLE IF EXISTS bookmarks CASCADE;
        DROP TABLE IF EXISTS suggested_steps CASCADE;
        DROP TABLE IF EXISTS citations CASCADE;
        DROP TABLE IF EXISTS answers CASCADE;
        DROP TABLE IF EXISTS videos CASCADE;
        DROP TABLE IF EXISTS search_results CASCADE;
        DROP TABLE IF EXISTS documents CASCADE;
        DROP TABLE IF EXISTS queries CASCADE;
        DROP TABLE IF EXISTS sessions CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TYPE IF EXISTS answer_status_enum;
        DROP TYPE IF EXISTS doc_type_enum;
        DROP TYPE IF EXISTS source_enum;
        DROP TYPE IF EXISTS query_type_enum;
    """)

"""Alembic env — sync engine using DATABASE_URL_UNPOOLED (direct connection)."""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

# Make `app` importable when running `alembic` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.settings import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db import models  # noqa: F401, E402  — ensures all tables registered

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _resolve_url() -> str:
    url = os.getenv("DATABASE_URL_UNPOOLED") or settings.DATABASE_URL_UNPOOLED
    if not url:
        url = os.getenv("DATABASE_URL") or settings.DATABASE_URL
    if not url:
        raise RuntimeError(
            "DATABASE_URL[_UNPOOLED] is not set — cannot run migrations."
        )
    # Alembic uses sync driver; strip async marker if present.
    if url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_resolve_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_resolve_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

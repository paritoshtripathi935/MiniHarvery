"""Async SQLAlchemy engine + session factory for Neon.

If `settings.DATABASE_URL` is empty, the engine is `None` and `db_enabled` is
False — callers must fall back to the in-memory path (offline dev).
"""
from __future__ import annotations

import logging
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.settings import settings

logger = logging.getLogger(__name__)


def _build_engine() -> Optional[AsyncEngine]:
    if not settings.db_enabled:
        logger.info("DATABASE_URL not set — DB-backed features disabled")
        return None

    url = settings.async_database_url
    logger.info("Initialising async engine for Neon (pool=%d)", settings.DB_POOL_SIZE)
    return create_async_engine(
        url,
        echo=settings.IS_DB_ECHO_LOG,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_POOL_OVERFLOW,
        pool_pre_ping=True,
        connect_args={"ssl": True},  # Neon requires TLS
    )


engine: Optional[AsyncEngine] = _build_engine()

AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = (
    async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    if engine is not None
    else None
)


def db_enabled() -> bool:
    return engine is not None


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency — yields an AsyncSession, commits on success."""
    if AsyncSessionLocal is None:
        raise RuntimeError("Database is not configured (DATABASE_URL is empty)")
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

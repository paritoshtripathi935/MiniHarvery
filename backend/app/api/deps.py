"""Shared FastAPI dependencies.

`resolve_caller` is the auth gate. Every request must carry a valid Clerk
session JWT — there is no guest path. Returns the resolved `users.id` UUID.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request

from app.db import AsyncSessionLocal, db_enabled
from app.db import repositories as repo
from app.utils.clerk_auth import ClerkAuthError, auth_enabled, verify_clerk_jwt

logger = logging.getLogger(__name__)


@dataclass
class CallerIdentity:
    """Resolved identity for a single request."""
    user_id: uuid.UUID
    clerk_user_id: str
    mode: str
    inbox_matter_id: uuid.UUID

    @property
    def subject(self) -> str:
        """Key used for rate-limiting."""
        return self.clerk_user_id


def _bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip() or None
    return None


def _email_from_claims(claims: dict) -> Optional[str]:
    return (
        claims.get("email")
        or claims.get("primary_email")
        or claims.get("primary_email_address")
    )


def _name_from_claims(claims: dict) -> Optional[str]:
    return (
        claims.get("name")
        or " ".join(filter(None, [claims.get("first_name"), claims.get("last_name")])).strip()
        or claims.get("username")
        or None
    )


async def resolve_caller(request: Request) -> CallerIdentity:
    """Verify the Clerk JWT and return the caller's user_id.

    - No `Authorization: Bearer …` header        → 401
    - Token signature/issuer/expiry invalid      → 401
    - `CLERK_JWT_ISSUER` not configured          → 503
    - `DATABASE_URL` not configured              → 503
    """
    if not auth_enabled():
        raise HTTPException(
            status_code=503,
            detail="Server auth is not configured (CLERK_JWT_ISSUER missing).",
        )
    if not db_enabled():
        raise HTTPException(
            status_code=503,
            detail="Server database is not configured (DATABASE_URL missing).",
        )

    token = _bearer_token(request)
    if token is None:
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    try:
        claims = verify_clerk_jwt(token)
    except ClerkAuthError as exc:
        logger.info("Rejected request with invalid Clerk token: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid Clerk token") from exc

    clerk_user_id = claims["sub"]
    async with AsyncSessionLocal() as db:
        try:
            user = await repo.upsert_clerk_user(
                db,
                clerk_user_id=clerk_user_id,
                email=_email_from_claims(claims),
                display_name=_name_from_claims(claims),
            )
            inbox = await repo.ensure_inbox_matter(db, user.id)
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    return CallerIdentity(
        user_id=user.id,
        clerk_user_id=clerk_user_id,
        mode=user.mode,
        inbox_matter_id=inbox.id,
    )

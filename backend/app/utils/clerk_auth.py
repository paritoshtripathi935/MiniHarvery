"""Clerk JWT verification.

Uses Clerk's JWKS endpoint to verify RS256 session tokens. The verified `sub`
claim is the Clerk user_id. Issuer is pinned via `settings.CLERK_JWT_ISSUER`.

JWKS is cached in-process for `CLERK_JWKS_TTL_SECONDS` (default 1 hour) — Clerk
rotates keys infrequently and we'd rather not hit the network on every request.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, Optional, Tuple

import httpx
from jose import jwt
from jose.exceptions import JWTError

from app.core.settings import settings

logger = logging.getLogger(__name__)


class ClerkAuthError(Exception):
    """Raised when a Clerk JWT cannot be verified."""


_jwks_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def _fetch_jwks(issuer: str) -> Dict[str, Any]:
    """Get JWKS for an issuer, caching for CLERK_JWKS_TTL_SECONDS."""
    now = time.time()
    cached = _jwks_cache.get(issuer)
    if cached and cached[0] > now:
        return cached[1]

    url = issuer.rstrip("/") + "/.well-known/jwks.json"
    try:
        resp = httpx.get(url, timeout=5.0)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        raise ClerkAuthError(f"Could not fetch JWKS from {url}: {exc}") from exc

    jwks = resp.json()
    _jwks_cache[issuer] = (now + settings.CLERK_JWKS_TTL_SECONDS, jwks)
    return jwks


def _key_for_kid(jwks: Dict[str, Any], kid: str) -> Optional[Dict[str, Any]]:
    for k in jwks.get("keys", []):
        if k.get("kid") == kid:
            return k
    return None


def verify_clerk_jwt(token: str) -> Dict[str, Any]:
    """Verify a Clerk session JWT and return its claims.

    Raises ClerkAuthError on any failure (bad signature, expired, wrong issuer,
    issuer not configured, etc.). Callers should map that to HTTP 401.
    """
    issuer = settings.CLERK_JWT_ISSUER
    if not issuer:
        raise ClerkAuthError("CLERK_JWT_ISSUER not configured")

    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise ClerkAuthError(f"Malformed token: {exc}") from exc

    kid = header.get("kid")
    if not kid:
        raise ClerkAuthError("Token header missing kid")

    jwks = _fetch_jwks(issuer)
    key = _key_for_kid(jwks, kid)
    if key is None:
        # Force refresh once — the signing key may have rotated.
        _jwks_cache.pop(issuer, None)
        jwks = _fetch_jwks(issuer)
        key = _key_for_kid(jwks, kid)
        if key is None:
            raise ClerkAuthError(f"No JWKS key for kid={kid}")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=issuer,
            # Clerk session tokens don't have an audience by default; if you
            # turn audience on in Clerk, pass it via CLERK_JWT_AUDIENCE and
            # extend this call.
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise ClerkAuthError(f"Token verification failed: {exc}") from exc

    sub = claims.get("sub")
    if not sub:
        raise ClerkAuthError("Token missing sub claim")
    return claims


def auth_enabled() -> bool:
    """Auth is wired up only when an issuer is configured."""
    return bool(settings.CLERK_JWT_ISSUER)

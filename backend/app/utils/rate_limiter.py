"""
Token bucket rate limiter — ported directly from MiniPerplexity.
30 calls/min per endpoint key, 0.5 tokens/sec refill.
"""
import time
import threading
from typing import Dict
from fastapi import HTTPException

from app.core.settings import settings


class TokenBucket:
    """Token bucket algorithm (same as MiniPerplexity's rate_limter.py)."""

    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate  # tokens per second
        self.last_refill = time.time()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = time.time()
        elapsed = now - self.last_refill
        added = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + added)
        self.last_refill = now

    def consume(self) -> bool:
        with self._lock:
            self._refill()
            if self.tokens >= 1:
                self.tokens -= 1
                return True
            return False


# Per-endpoint buckets keyed by "{endpoint}:{user_id}"
_buckets: Dict[str, TokenBucket] = {}
_buckets_lock = threading.Lock()


def _get_bucket(key: str) -> TokenBucket:
    with _buckets_lock:
        if key not in _buckets:
            _buckets[key] = TokenBucket(
                capacity=settings.RATE_LIMIT_CALLS_PER_MIN,
                refill_rate=settings.RATE_LIMIT_CALLS_PER_MIN / 60.0,
            )
        return _buckets[key]


def check_rate_limit(endpoint: str, user_id: str = "anonymous") -> None:
    """Raise 429 if rate limit exceeded. Call at the top of each handler."""
    key = f"{endpoint}:{user_id}"
    bucket = _get_bucket(key)
    if not bucket.consume():
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Please wait before sending another request.",
        )

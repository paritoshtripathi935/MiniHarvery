"""
Session store — ported directly from MiniPerplexity's session management.
UUID-keyed in-memory dict with TTL eviction.
"""
import time
from typing import Dict, List, Optional
from dataclasses import dataclass, field

from app.core.settings import settings


@dataclass
class SessionData:
    search_results: List[dict] = field(default_factory=list)
    previous_queries: List[str] = field(default_factory=list)
    query_type: str = "general"
    created_at: float = field(default_factory=time.time)
    last_accessed: float = field(default_factory=time.time)


# In-memory session store (same pattern as MiniPerplexity)
_sessions: Dict[str, SessionData] = {}


def _evict_expired() -> None:
    now = time.time()
    expired = [
        sid for sid, data in _sessions.items()
        if now - data.last_accessed > settings.SESSION_TTL_SECONDS
    ]
    for sid in expired:
        del _sessions[sid]


def get_session(session_id: str) -> Optional[SessionData]:
    _evict_expired()
    session = _sessions.get(session_id)
    if session:
        session.last_accessed = time.time()
    return session


def get_or_create_session(session_id: str) -> SessionData:
    _evict_expired()
    if session_id not in _sessions:
        _sessions[session_id] = SessionData()
    else:
        _sessions[session_id].last_accessed = time.time()
    return _sessions[session_id]


def update_session(session_id: str, search_results: List[dict], query: str, query_type: str) -> None:
    session = get_or_create_session(session_id)
    session.search_results = search_results
    session.query_type = query_type
    # Keep last 3 queries for context (same as MiniPerplexity)
    session.previous_queries.append(query)
    if len(session.previous_queries) > 3:
        session.previous_queries = session.previous_queries[-3:]


def delete_session(session_id: str) -> bool:
    if session_id in _sessions:
        del _sessions[session_id]
        return True
    return False

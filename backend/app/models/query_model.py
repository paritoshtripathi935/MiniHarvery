from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class SearchRequest(BaseModel):
    """Request body for /search.

    `thread_id` — when present, append to that thread (server verifies
        ownership). When absent, mint a new thread inside `matter_id`.
    `matter_id` — only consulted when minting a new thread; defaults to
        the caller's Inbox matter."""
    query: str
    thread_id: Optional[UUID] = None
    matter_id: Optional[UUID] = None


class AnswerRequest(BaseModel):
    """Request body for /answer.

    `query_id` lets the client pin the answer to a specific query. Falls back
    to "latest query in this thread that has no answer" when omitted."""
    query: str
    query_id: Optional[UUID] = None
    thread_id: Optional[UUID] = None

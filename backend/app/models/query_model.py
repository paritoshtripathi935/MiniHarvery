from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.models.search_model import LegalSearchResult


class QueryRequest(BaseModel):
    """Legacy /answer body shape (unused by the live FE — kept for OpenAPI)."""
    query: str
    search_results: List[LegalSearchResult] = []
    previous_queries: List[str] = []
    query_type: str = "general"


class SearchRequest(BaseModel):
    """Request body for /search.

    `thread_id` is optional — when missing the server creates a new thread
    titled from the first query. When provided, the query is appended to
    that thread (server verifies it belongs to the caller)."""
    query: str
    thread_id: Optional[UUID] = None


class AnswerRequest(BaseModel):
    """Request body for /answer.

    `query_id` lets the client pin the answer to a specific query. Falls back
    to "latest query in this thread that has no answer" when omitted."""
    query: str
    query_id: Optional[UUID] = None
    thread_id: Optional[UUID] = None

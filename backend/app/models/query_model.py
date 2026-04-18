from typing import List
from pydantic import BaseModel

from app.models.search_model import LegalSearchResult


class QueryRequest(BaseModel):
    """
    Request body for /answer endpoint.
    Mirrors MiniPerplexity's QueryRequest.
    """
    query: str
    search_results: List[LegalSearchResult] = []
    previous_queries: List[str] = []
    query_type: str = "general"


class SearchRequest(BaseModel):
    """Request body for /search endpoint."""
    query: str

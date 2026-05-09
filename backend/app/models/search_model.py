from typing import Optional
from pydantic import BaseModel


class LegalSearchResult(BaseModel):
    """One legal search result — judgment, act, article, or generic page."""
    question: str
    title: str
    url: str
    snippet: str
    search_content: str
    source: str           # "indian_kanoon" | "india_code" | "sci" | "google"
    doc_type: str         # "judgment" | "act" | "article" | "general"
    jurisdiction: Optional[str] = None   # "Supreme Court" | "Delhi HC" | etc.
    citation: Optional[str] = None       # "AIR 2023 SC 1234" or "Section 302 IPC"
    year: Optional[int] = None


class VideoResult(BaseModel):
    """Supplementary YouTube video result — explainer/lecture content."""
    video_id: str
    title: str
    channel: str
    description: str
    thumbnail_url: str
    url: str                          # https://www.youtube.com/watch?v=...
    published_at: Optional[str] = None
    duration: Optional[str] = None    # Optional; not always fetched

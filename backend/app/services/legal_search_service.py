"""
Legal search service — parallel fetch from Indian legal sources.
Architecture mirrors MiniPerplexity's search_service.py (ThreadPoolExecutor pattern).

Sources (in authority order):
  1. Indian Kanoon API  — official REST API, needs auth token. Complete SC/HC/
                          tribunal judgment coverage with proper AIR/SCC citations.
  2. India Code         — indiacode.nic.in scrape (no public API). Central Acts.
  3. Google CSE         — broad Indian legal web, backfills gaps.

Note: we previously had a direct main.sci.gov.in scraper. It was removed —
main.sci.gov.in's judgment search is a JavaScript-rendered portal behind session
cookies and form tokens that `requests` cannot scrape, their SSL cert is chronically
expired, and Indian Kanoon already covers every Supreme Court judgment with
better metadata. Google CSE surfaces any remaining main.sci.gov.in pages.
"""
import logging
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List

import requests
from bs4 import BeautifulSoup

from app.core.settings import settings
from app.models.search_model import LegalSearchResult, VideoResult
from app.services.content_extractor import fetch_content_from_url, _next_agent

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
# Indian Kanoon API
# ─────────────────────────────────────────────

_IK_SEARCH_URL = "https://api.indiankanoon.org/search/"
_IK_DOC_URL = "https://api.indiankanoon.org/doc/{tid}/"
_IK_BROWSE_URL = "https://indiankanoon.org/doc/{tid}/"


def _search_indian_kanoon(query: str) -> List[LegalSearchResult]:
    """Fetch results from Indian Kanoon REST API."""
    if not settings.INDIAN_KANOON_API_TOKEN:
        logger.warning("INDIAN_KANOON_API_TOKEN not set — skipping Indian Kanoon search")
        return []

    try:
        resp = requests.post(
            _IK_SEARCH_URL,
            data={"formInput": query, "pagenum": 0},
            headers={
                "Authorization": f"Token {settings.INDIAN_KANOON_API_TOKEN}",
                "Accept": "application/json",
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Indian Kanoon search failed: %s", exc)
        return []

    results = []
    for doc in data.get("docs", [])[: settings.MAX_SEARCH_RESULTS]:
        tid = doc.get("tid", "")
        browse_url = _IK_BROWSE_URL.format(tid=tid)

        # Strip HTML tags from headline snippet
        snippet = re.sub(r"<[^>]+>", "", doc.get("headline", "")).strip()

        # Determine jurisdiction from court field
        court = doc.get("court", "") or doc.get("docsource", "")
        jurisdiction = _normalise_court(court)

        # Try to get full content (graceful skip on failure)
        content = fetch_content_from_url(browse_url)

        results.append(
            LegalSearchResult(
                question=query,
                title=doc.get("title", "Unknown"),
                url=browse_url,
                snippet=snippet,
                search_content=content,
                source="indian_kanoon",
                doc_type="judgment" if doc.get("doctype") == "judgment" else "act",
                jurisdiction=jurisdiction,
                citation=doc.get("citation"),
                year=_extract_year(doc.get("publishdate", "")),
            )
        )
    return results


# ─────────────────────────────────────────────
# India Code scraper
# ─────────────────────────────────────────────

_INDIA_CODE_SEARCH = "https://www.indiacode.nic.in/handle/123456789/1362/simple-search?query={query}&rpp=10&sort_by=score&order=desc"


def _search_india_code(query: str) -> List[LegalSearchResult]:
    """Scrape India Code for acts and statutes."""
    try:
        url = _INDIA_CODE_SEARCH.format(query=urllib.parse.quote(query))
        resp = requests.get(
            url,
            headers={"User-Agent": _next_agent()},
            timeout=8,
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as exc:
        logger.warning("India Code search failed: %s", exc)
        return []

    results = []
    # Result rows are in <tr> within .discovery-result-results or similar tables
    rows = soup.select("div.artifact-description") or soup.select("div.item-description")

    for row in rows[: settings.MAX_SEARCH_RESULTS]:
        link_tag = row.find("a", href=True)
        if not link_tag:
            continue

        title = link_tag.get_text(strip=True)
        href = link_tag["href"]
        full_url = href if href.startswith("http") else f"https://www.indiacode.nic.in{href}"

        snippet_tag = row.find("p") or row.find("div", class_="description")
        snippet = snippet_tag.get_text(strip=True)[:300] if snippet_tag else ""

        content = fetch_content_from_url(full_url)

        results.append(
            LegalSearchResult(
                question=query,
                title=title,
                url=full_url,
                snippet=snippet,
                search_content=content,
                source="india_code",
                doc_type="act",
                jurisdiction="Central Government",
            )
        )
    return results


# ─────────────────────────────────────────────
# Google Custom Search — broad Indian legal web results
# ─────────────────────────────────────────────

_GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1"


def _search_google(query: str) -> List[LegalSearchResult]:
    """Fetch results from Google Custom Search. Biases query toward Indian law."""
    if not settings.GOOGLE_API_KEY or not settings.GOOGLE_SEARCH_CX:
        logger.warning("GOOGLE_API_KEY / GOOGLE_SEARCH_CX not set — skipping Google search")
        return []

    try:
        resp = requests.get(
            _GOOGLE_CSE_URL,
            params={
                "key": settings.GOOGLE_API_KEY,
                "cx": settings.GOOGLE_SEARCH_CX,
                "q": f"{query} India law",
                "num": min(settings.MAX_SEARCH_RESULTS, 10),
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Google CSE search failed: %s", exc)
        return []

    results: List[LegalSearchResult] = []
    for item in data.get("items", [])[: settings.MAX_SEARCH_RESULTS]:
        url = item.get("link", "")
        if not url:
            continue
        title = item.get("title", "Untitled")
        snippet = item.get("snippet", "")
        display_link = item.get("displayLink", "")

        # Heuristic doc_type from domain
        doc_type = "article"
        if "indiankanoon" in display_link:
            doc_type = "judgment"
        elif "indiacode.nic.in" in display_link or "legislative.gov.in" in display_link:
            doc_type = "act"

        # Skip full-page fetch for Google results (noisy; snippet is usually enough)
        results.append(
            LegalSearchResult(
                question=query,
                title=title,
                url=url,
                snippet=snippet,
                search_content=snippet,
                source="google",
                doc_type=doc_type,
                jurisdiction=None,
            )
        )
    return results


# ─────────────────────────────────────────────
# YouTube Data API — explainer / lecture videos
# ─────────────────────────────────────────────

_YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"


def search_videos(query: str, max_results: int = 6) -> List[VideoResult]:
    """
    Fetch supplementary explainer videos from YouTube.
    Uses YOUTUBE_API_KEY if set, else falls back to GOOGLE_API_KEY.
    """
    api_key = settings.YOUTUBE_API_KEY or settings.GOOGLE_API_KEY
    if not api_key:
        logger.warning("No YouTube / Google API key — skipping video search")
        return []

    try:
        resp = requests.get(
            _YOUTUBE_SEARCH_URL,
            params={
                "key": api_key,
                "q": f"{query} Indian law explained",
                "part": "snippet",
                "type": "video",
                "maxResults": max_results,
                "relevanceLanguage": "en",
                "safeSearch": "strict",
            },
            timeout=8,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("YouTube search failed: %s", exc)
        return []

    videos: List[VideoResult] = []
    for item in data.get("items", []):
        vid = item.get("id", {}).get("videoId")
        snip = item.get("snippet", {}) or {}
        if not vid:
            continue
        thumbs = snip.get("thumbnails", {}) or {}
        thumb_url = (
            thumbs.get("medium", {}).get("url")
            or thumbs.get("default", {}).get("url")
            or ""
        )
        videos.append(
            VideoResult(
                video_id=vid,
                title=snip.get("title", "Untitled"),
                channel=snip.get("channelTitle", ""),
                description=snip.get("description", ""),
                thumbnail_url=thumb_url,
                url=f"https://www.youtube.com/watch?v={vid}",
                published_at=snip.get("publishedAt"),
            )
        )
    return videos


# ─────────────────────────────────────────────
# Parallel orchestrator (mirrors MiniPerplexity's ThreadPoolExecutor pattern)
# ─────────────────────────────────────────────

def search_legal_sources(query: str) -> List[LegalSearchResult]:
    """
    Run the three legal search workers in parallel.
    Returns a balanced, round-robin interleaving of results by source so the
    UI never becomes a wall of results from one provider (usually Google).
    """
    by_source: dict[str, List[LegalSearchResult]] = {
        "indian_kanoon": [],
        "india_code": [],
        "google": [],
    }

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(_search_indian_kanoon, query): "indian_kanoon",
            executor.submit(_search_india_code, query): "india_code",
            executor.submit(_search_google, query): "google",
        }
        for future in as_completed(futures):
            source = futures[future]
            try:
                results = future.result()
                logger.info("Source %s returned %d results", source, len(results))
                by_source[source] = results
            except Exception as exc:
                logger.error("Source %s raised an exception: %s", source, exc)

    # Round-robin interleave — authoritative sources first, Google last so its
    # results fill gaps rather than dominate the top of the list.
    order = ["indian_kanoon", "india_code", "google"]
    interleaved: List[LegalSearchResult] = []
    max_len = max((len(by_source[s]) for s in order), default=0)
    for i in range(max_len):
        for s in order:
            if i < len(by_source[s]):
                interleaved.append(by_source[s][i])

    # Deduplicate by URL (preserve first occurrence — matches round-robin order)
    seen_urls: set[str] = set()
    deduplicated: List[LegalSearchResult] = []
    for result in interleaved:
        if result.url not in seen_urls:
            seen_urls.add(result.url)
            deduplicated.append(result)

    return deduplicated


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _normalise_court(court: str) -> str:
    """Map raw court string to a normalised jurisdiction label."""
    if not court:
        return "Unknown"
    court_lower = court.lower()
    if "supreme" in court_lower:
        return "Supreme Court of India"
    if "high court" in court_lower or " hc" in court_lower:
        # Extract state if possible, e.g. "Delhi High Court"
        return court.title()
    if "tribunal" in court_lower:
        return "Tribunal"
    return court.title()


def _extract_year(date_str: str) -> int | None:
    """Extract 4-digit year from a date string."""
    match = re.search(r"\b(19|20)\d{2}\b", date_str)
    return int(match.group()) if match else None

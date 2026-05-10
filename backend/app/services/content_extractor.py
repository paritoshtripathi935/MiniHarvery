"""BS4-based HTML stripper. Targets Indian legal page structures, falls back
to a generic paragraph collector for everything else.

Indian Kanoon's HTML document pages (`indiankanoon.org/doc/<tid>/`) 403 most
non-browser clients in production. We have an API token for the same data,
so we route IK URLs through `api.indiankanoon.org/doc/<tid>/` whenever the
token is configured."""
import logging
import re
from typing import Optional

import requests
from bs4 import BeautifulSoup

from app.core.settings import settings

logger = logging.getLogger(__name__)

# Rotated to look less bot-like to upstreams that throttle on UA.
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
]

_agent_index = 0

_IK_DOC_URL_RE = re.compile(r"indiankanoon\.org/doc(?:fragment)?/(\d+)/?", re.IGNORECASE)
_IK_API_DOC_URL = "https://api.indiankanoon.org/doc/{tid}/"


def _next_agent() -> str:
    global _agent_index
    agent = _USER_AGENTS[_agent_index % len(_USER_AGENTS)]
    _agent_index += 1
    return agent


def _extract_ik_tid(url: str) -> Optional[str]:
    match = _IK_DOC_URL_RE.search(url or "")
    return match.group(1) if match else None


def _fetch_indian_kanoon_doc(tid: str, max_chars: int, timeout: int) -> str:
    """Pull a judgment via Indian Kanoon's authenticated REST API. Returns
    empty string on any failure — caller decides what to do next."""
    if not settings.INDIAN_KANOON_API_TOKEN:
        return ""
    try:
        resp = requests.post(
            _IK_API_DOC_URL.format(tid=tid),
            headers={
                "Authorization": f"Token {settings.INDIAN_KANOON_API_TOKEN}",
                "Accept": "application/json",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Indian Kanoon API fetch failed for tid=%s: %s", tid, exc)
        return ""

    # IK returns the judgment body as HTML in `doc`. Other top-level fields
    # (title, citation, …) are intentionally ignored — the LLM extracts those.
    body_html = data.get("doc") or ""
    if not body_html:
        return ""
    return extract_text(body_html, max_chars)


def fetch_content_from_url(url: str, max_chars: int = 2000, timeout: int = 5) -> str:
    """Fetch a URL and extract clean text.

    Indian Kanoon document URLs are routed through the authenticated API
    (the public HTML 403s most non-browser clients). Everything else goes
    through a generic GET + BS4 extractor.

    `max_chars` is also the budget passed to `extract_text` — bump it for
    full-judgment fetches, leave it small for search-snippet fetches.
    `timeout` defaults to 5s for snippet fetches; brief generation should
    pass something larger because real judgment pages are big.
    """
    tid = _extract_ik_tid(url)
    if tid:
        text = _fetch_indian_kanoon_doc(tid, max_chars, timeout)
        if text:
            return text
        # Fall through to HTML scrape if the API path produced nothing
        # (no token, or transient error). The HTML 403s often, but not
        # always — and a partial result beats nothing.

    try:
        response = requests.get(
            url,
            headers={"User-Agent": _next_agent()},
            timeout=timeout,
        )
        response.raise_for_status()
        return extract_text(response.text, max_chars)
    except Exception as exc:
        logger.warning("Failed to fetch %s: %s", url, exc)
        return ""


def extract_text(html: str, max_chars: int = 2000) -> str:
    """Extract clean text from HTML, favouring legal document containers."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove noise elements
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "aside"]):
        tag.decompose()

    # Indian Kanoon judgment body (also matches what the API returns in `doc`)
    judgment_div = soup.find("div", class_="judgments")
    if judgment_div:
        return _clean(judgment_div.get_text(separator=" "), max_chars)

    # India Code act content
    act_div = soup.find("div", class_="act_content") or soup.find("div", id="act_content")
    if act_div:
        return _clean(act_div.get_text(separator=" "), max_chars)

    # Modern article containers — most legal news sites (livelaw, barandbench,
    # the wire, etc.) wrap the body in <article> or [role="main"]. Try those
    # before falling through to a raw paragraph sweep.
    container = soup.find("article") or soup.find(attrs={"role": "main"}) or soup.find("main")
    if container:
        text = _collect_paragraphs(container, max_chars)
        if text:
            return text

    # Generic fallback — collect every paragraph >50 chars up to the budget.
    # The previous 5-paragraph cap caused empty briefs on sites whose first
    # few <p> tags are nav, share-bar, or "subscribe to read" banners.
    return _collect_paragraphs(soup, max_chars)


def _collect_paragraphs(root, max_chars: int) -> str:
    parts: list[str] = []
    total = 0
    for p in root.find_all("p"):
        text = p.get_text(strip=True)
        if len(text) <= 50:
            continue
        parts.append(text)
        total += len(text) + 1  # +1 for the joining space
        if total >= max_chars:
            break
    return _clean(" ".join(parts), max_chars)


def _clean(text: str, max_chars: int) -> str:
    """Collapse whitespace and truncate."""
    cleaned = " ".join(text.split())
    return cleaned[:max_chars]

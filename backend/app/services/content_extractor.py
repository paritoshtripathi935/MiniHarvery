"""
Content extractor — BS4-based HTML stripper for legal documents.
Ported from MiniPerplexity's fetch_content_from_url pattern.
Adapted for Indian legal page structures.
"""
import logging
import requests
from bs4 import BeautifulSoup
from typing import Optional

logger = logging.getLogger(__name__)

# User agents to rotate (same as MiniPerplexity)
_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
]

_agent_index = 0


def _next_agent() -> str:
    global _agent_index
    agent = _USER_AGENTS[_agent_index % len(_USER_AGENTS)]
    _agent_index += 1
    return agent


def fetch_content_from_url(url: str, max_chars: int = 2000) -> str:
    """
    Fetch a URL and extract clean text.
    Prioritises legal-specific containers; falls back to paragraph extraction.
    Max 2000 chars per result to keep context window manageable.
    """
    try:
        response = requests.get(
            url,
            headers={"User-Agent": _next_agent()},
            timeout=5,
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

    # Indian Kanoon judgment body
    judgment_div = soup.find("div", class_="judgments")
    if judgment_div:
        return _clean(judgment_div.get_text(separator=" "), max_chars)

    # India Code act content
    act_div = soup.find("div", class_="act_content") or soup.find("div", id="act_content")
    if act_div:
        return _clean(act_div.get_text(separator=" "), max_chars)

    # Generic: collect first 5 meaningful paragraphs (same as MiniPerplexity)
    paragraphs = []
    for p in soup.find_all("p"):
        text = p.get_text(strip=True)
        if len(text) > 50:
            paragraphs.append(text)
        if len(paragraphs) >= 5:
            break

    return _clean(" ".join(paragraphs), max_chars)


def _clean(text: str, max_chars: int) -> str:
    """Collapse whitespace and truncate."""
    cleaned = " ".join(text.split())
    return cleaned[:max_chars]

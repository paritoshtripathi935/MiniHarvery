"""
Citation formatter — extract and structure Indian legal citations from text.
Supports AIR, SCC, SCR, ILR formats and Section/Article references.
"""
import re
from dataclasses import dataclass
from typing import List


@dataclass
class Citation:
    text: str
    citation_type: str   # "case" | "statute"
    url: str = ""        # optional deeplink back to source


# ── Regex patterns ──────────────────────────────────────────────────────────

_PATTERNS = {
    # AIR 2023 SC 1234  /  AIR 2022 Bom 567
    "air": re.compile(r"AIR\s+\d{4}\s+[A-Z][A-Za-z]+\s+\d+"),
    # (2023) 5 SCC 678
    "scc": re.compile(r"\(\d{4}\)\s+\d+\s+SCC\s+\d+"),
    # 2023 SCR 1 45
    "scr": re.compile(r"\d{4}\s+SCR\s+\d+\s+\d+"),
    # ILR 2022 Delhi 890
    "ilr": re.compile(r"ILR\s+\d{4}\s+[A-Z][A-Za-z]+\s+\d+"),
    # Section 302 of the Indian Penal Code  /  Section 138 NI Act
    "section": re.compile(
        r"[Ss]ection\s+\d+[A-Z]?(?:\([a-z]\))?"
        r"(?:\s+(?:of\s+(?:the\s+)?)?[A-Z][A-Za-z\s]{2,30})?(?=[\s,\.\;]|$)"
    ),
    # Article 21 of the Constitution
    "article": re.compile(
        r"[Aa]rticle\s+\d+[A-Z]?"
        r"(?:\s+(?:of\s+(?:the\s+)?)?[A-Z][A-Za-z\s]{2,30})?(?=[\s,\.\;]|$)"
    ),
}

_CASE_TYPES = {"air", "scc", "scr", "ilr"}
_STATUTE_TYPES = {"section", "article"}


def extract_citations(text: str) -> List[Citation]:
    """Extract all Indian legal citations from a block of text."""
    citations: List[Citation] = []
    seen: set = set()

    for ctype, pattern in _PATTERNS.items():
        for match in pattern.finditer(text):
            raw = match.group().strip()
            if raw in seen:
                continue
            seen.add(raw)

            kind = "case" if ctype in _CASE_TYPES else "statute"
            url = _build_ik_search_url(raw) if kind == "case" else ""
            citations.append(Citation(text=raw, citation_type=kind, url=url))

    return citations


def extract_suggested_steps(text: str) -> List[str]:
    """
    Parse the '**Suggested Next Steps**' section from Harvey's response.
    Returns a list of plain-text step strings.
    """
    # Find the section header
    section_match = re.search(
        r"\*{0,2}Suggested Next Steps\*{0,2}\s*:?\s*\n(.*?)(?=\n\*{0,2}[A-Z]|\Z)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not section_match:
        return []

    section_text = section_match.group(1)
    steps = []

    # Match numbered list items: "1. ..." or "- ..."
    for line in section_text.splitlines():
        line = line.strip()
        step_match = re.match(r"^(?:\d+[\.\)]\s*|-\s*)(.+)$", line)
        if step_match:
            steps.append(step_match.group(1).strip())

    return steps


def _build_ik_search_url(citation: str) -> str:
    """Build an Indian Kanoon search URL for a citation string."""
    import urllib.parse
    return f"https://indiankanoon.org/search/?formInput={urllib.parse.quote(citation)}"

"""
Language model service — Cloudflare AI Workers integration.
Mirrors MiniPerplexity's language_model.py exactly, adapted for the Harvey legal persona.
"""
import json
import logging
from typing import Generator, List

import requests

from app.core.settings import settings
from app.models.search_model import LegalSearchResult

logger = logging.getLogger(__name__)

_CF_URL = (
    "https://api.cloudflare.com/client/v4/accounts/{account_id}"
    "/ai/run/@cf/meta/llama-3.1-70b-instruct"
)

# ── Harvey system prompt ─────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are Harvey, an expert Indian legal research assistant with deep knowledge of:
- The Constitution of India (all articles and amendments)
- Indian Penal Code (IPC), Code of Criminal Procedure (CrPC), Code of Civil Procedure (CPC)
- The Negotiable Instruments Act, Companies Act, Consumer Protection Act, RTI Act, and all major central legislation
- Landmark Supreme Court and High Court judgments

Structure EVERY answer in exactly this format (use markdown headers):

**Issue:** [Identify the precise legal question]

**Applicable Law:** [List relevant Acts, Sections, Articles with full names]

**Relevant Cases:** [Cite cases in AIR/SCC format — ONLY cases you are certain exist; never invent citations]

**Analysis:** [Apply the law to the facts, explain reasoning]

**Conclusion:** [Clear, direct answer to the question]

**Suggested Next Steps:**
1. [Specific actionable step with legal reference]
2. [Specific actionable step with legal reference]
3. [Specific actionable step with legal reference]

**Follow-up Questions:**
- [A short related question the user is likely to ask next — keep it under 12 words]
- [Another angle of the same matter — procedural, remedial, or jurisdictional]
- [A practical edge case or related statute worth researching]

Rules:
- Always cite section numbers and act names precisely (e.g., "Section 138 of the Negotiable Instruments Act, 1881")
- Use Indian legal citation format: AIR YYYY Court PageNo or (YYYY) Vol SCC PageNo
- If you cannot find a relevant case from the search results, say so — do not invent one
- End every response with: *⚠️ Disclaimer: This is legal information only, not legal advice. For your specific situation, consult a qualified advocate registered with the Bar Council of India.*"""


def _format_search_results(results: List[LegalSearchResult]) -> str:
    """Format search results for LLM context injection (same pattern as MiniPerplexity)."""
    if not results:
        return "No search results available."

    lines = []
    for i, r in enumerate(results, 1):
        lines.append(f"[{i}] {r.title}")
        lines.append(f"    Source: {r.source} | Type: {r.doc_type}")
        if r.jurisdiction:
            lines.append(f"    Jurisdiction: {r.jurisdiction}")
        if r.citation:
            lines.append(f"    Citation: {r.citation}")
        lines.append(f"    URL: {r.url}")
        lines.append(f"    Snippet: {r.snippet}")
        if r.search_content:
            lines.append(f"    Content: {r.search_content[:800]}")
        lines.append("")
    return "\n".join(lines)


def _build_messages(
    query: str,
    query_type: str,
    search_results: List[LegalSearchResult],
    previous_queries: List[str],
) -> List[dict]:
    """Build Cloudflare AI message array (same structure as MiniPerplexity)."""
    user_content = f"""Query: {query}
Query Type: {query_type}
"""
    if previous_queries:
        user_content += f"Previous context: {'; '.join(previous_queries[-3:])}\n"

    user_content += f"""
Search Results from Indian Legal Sources:
{_format_search_results(search_results)}

Answer the query using the search results above. Follow the required structure strictly."""

    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


_REWRITE_SYSTEM = """You rewrite user questions into concise Indian legal search queries.

Output ONE LINE: 4–10 keywords optimized for legal databases (Indian Kanoon, India Code, Supreme Court of India, Google).

Rules:
- Preserve the specific Act, Section, or Article names the user mentioned.
- If the user describes a situation, infer the governing Act/Section (e.g. "my cheque bounced" → "Section 138 Negotiable Instruments Act cheque dishonour").
- Use Indian legal terminology (IPC, CrPC, CPC, NI Act, HMA, COPRA, etc.).
- Include "India" or "Indian" ONLY if the query is ambiguous on jurisdiction.
- No quotes, no commentary, no trailing punctuation. Output the query only."""


def rewrite_query_for_search(raw_query: str) -> str:
    """
    Rewrite a user's natural-language question into a focused legal search query.
    Falls back to the raw query on any failure — searching must never be blocked
    by the rewrite step.
    """
    if not settings.CLOUDFLARE_API_TOKEN or not settings.CLOUDFLARE_ACCOUNT_ID:
        return raw_query

    url = _CF_URL.format(account_id=settings.CLOUDFLARE_ACCOUNT_ID)
    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messages": [
                    {"role": "system", "content": _REWRITE_SYSTEM},
                    {"role": "user", "content": raw_query},
                ],
                "stream": False,
            },
            timeout=8,
        )
        response.raise_for_status()
        data = response.json()

        # Cloudflare non-stream response: {"result": {"response": "text"}, "success": true, ...}
        rewritten = (
            (data.get("result") or {}).get("response", "")
            or data.get("response", "")
            or ""
        ).strip()

        # Guardrails: strip quotes, collapse whitespace, cap length
        rewritten = rewritten.strip("\"'` \n\t")
        rewritten = " ".join(rewritten.split())

        # Defensive: if the model returned nothing useful, empty, or a refusal-like sentence, fall back.
        if not rewritten or len(rewritten) < 3 or len(rewritten) > 200:
            return raw_query
        if rewritten.lower().startswith(("i cannot", "i can't", "sorry")):
            return raw_query

        logger.info("Query rewrite: '%s' → '%s'", raw_query, rewritten)
        return rewritten

    except Exception as exc:
        logger.warning("Query rewrite failed, using raw query: %s", exc)
        return raw_query


def generate_legal_answer(
    query: str,
    query_type: str,
    search_results: List[LegalSearchResult],
    previous_queries: List[str],
) -> Generator[str, None, None]:
    """
    Call Cloudflare AI Workers with streaming.
    Yields text chunks as they arrive (SSE compatible).
    Mirrors MiniPerplexity's language_model.py streaming pattern.
    """
    if not settings.CLOUDFLARE_API_TOKEN or not settings.CLOUDFLARE_ACCOUNT_ID:
        yield "Cloudflare AI is not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
        return

    url = _CF_URL.format(account_id=settings.CLOUDFLARE_ACCOUNT_ID)
    messages = _build_messages(query, query_type, search_results, previous_queries)

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.CLOUDFLARE_API_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messages": messages,
                "stream": True,
                # Cloudflare's default is 256 tokens — far too small for a
                # legal memo with Issue/Law/Authorities/Discussion/Conclusion
                # /Actions/Follow-ups. Bump to the model's practical ceiling
                # so the brief never gets truncated mid-section.
                "max_tokens": 2048,
            },
            stream=True,
            timeout=90,
        )
        response.raise_for_status()

        for line in response.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                decoded = decoded[6:]
            if decoded == "[DONE]":
                break
            try:
                chunk = json.loads(decoded)
                # Cloudflare streams: {"response": "text"} per chunk
                text = chunk.get("response", "")
                if text:
                    yield text
            except json.JSONDecodeError:
                continue

    except requests.exceptions.Timeout:
        logger.error("Cloudflare AI request timed out")
        yield "\n\n[Error: The AI response timed out. Please try again.]"
    except Exception as exc:
        logger.error("Cloudflare AI error: %s", exc)
        yield f"\n\n[Error: {exc}]"

"""Prompts and orchestration for the streaming legal answer + query rewrite.

Pure prompt engineering — HTTP plumbing lives in `cloudflare_ai`.
"""
from __future__ import annotations

import logging
from typing import Generator, List, Optional, Tuple

import requests

from app.core.settings import settings
from app.schemas.search_model import LegalSearchResult
from app.services import cloudflare_ai
from app.services.cloudflare_ai import LlmCallMetrics, OnComplete

logger = logging.getLogger(__name__)


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


_REWRITE_SYSTEM = """You rewrite user questions into concise Indian legal search queries.

Output ONE LINE: 4–10 keywords optimized for legal databases (Indian Kanoon, India Code, Supreme Court of India, Google).

Rules:
- Preserve the specific Act, Section, or Article names the user mentioned.
- If the user describes a situation, infer the governing Act/Section (e.g. "my cheque bounced" → "Section 138 Negotiable Instruments Act cheque dishonour").
- Use Indian legal terminology (IPC, CrPC, CPC, NI Act, HMA, COPRA, etc.).
- Include "India" or "Indian" ONLY if the query is ambiguous on jurisdiction.
- No quotes, no commentary, no trailing punctuation. Output the query only."""


def _format_search_results(results: List[LegalSearchResult]) -> str:
    """Format search results for LLM context injection."""
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
    """Build the Cloudflare AI messages array."""
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


def rewrite_query_for_search(raw_query: str) -> Tuple[str, Optional[LlmCallMetrics]]:
    """Rewrite a natural-language question into a focused legal search query.

    Returns `(rewritten_query, metrics_or_None)`. Metrics is None when no
    LLM call happened (Cloudflare not configured, or the rewrite was
    rejected after the call and we returned the raw query — the metrics
    object still describes the call we made and is the second return).

    Falls back to the raw query on any failure — searching must never be
    blocked by the rewrite step.
    """
    if not cloudflare_ai.is_configured():
        return raw_query, None

    messages = [
        {"role": "system", "content": _REWRITE_SYSTEM},
        {"role": "user", "content": raw_query},
    ]

    captured: List[LlmCallMetrics] = []

    def capture(m: LlmCallMetrics) -> None:
        captured.append(m)

    try:
        rewritten = cloudflare_ai.chat_completion(
            messages,
            model=settings.CLOUDFLARE_LLM_MODEL_REWRITE,
            max_tokens=64,
            timeout=8,
            on_complete=capture,
        )
    except Exception as exc:
        logger.warning("Query rewrite failed, using raw query: %s", exc)
        return raw_query, captured[0] if captured else None

    metrics = captured[0] if captured else None
    rewritten = " ".join(rewritten.strip("\"'` \n\t").split())
    if not rewritten or len(rewritten) < 3 or len(rewritten) > 200:
        return raw_query, metrics
    if rewritten.lower().startswith(("i cannot", "i can't", "sorry")):
        return raw_query, metrics

    logger.info("Query rewrite: '%s' → '%s'", raw_query, rewritten)
    return rewritten, metrics


def generate_legal_answer(
    query: str,
    query_type: str,
    search_results: List[LegalSearchResult],
    previous_queries: List[str],
    *,
    on_complete: Optional[OnComplete] = None,
) -> Generator[str, None, None]:
    """Stream the legal answer chunk-by-chunk (SSE-friendly).

    Optional `on_complete` is invoked once after the stream ends with the
    call's latency, ttft, and (if Cloudflare reports them) token counts.
    """
    if not cloudflare_ai.is_configured():
        yield "Cloudflare AI is not configured. Please set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID."
        return

    messages = _build_messages(query, query_type, search_results, previous_queries)
    # 2048 max_tokens: Cloudflare's 256 default truncates the briefs mid-section.
    try:
        yield from cloudflare_ai.chat_completion_stream(
            messages,
            model=settings.CLOUDFLARE_LLM_MODEL_ANSWER,
            max_tokens=2048,
            timeout=90,
            on_complete=on_complete,
        )
    except requests.exceptions.Timeout:
        logger.error("Cloudflare AI request timed out")
        yield "\n\n[Error: The AI response timed out. Please try again.]"
    except Exception as exc:
        logger.error("Cloudflare AI error: %s", exc)
        yield f"\n\n[Error: {exc}]"

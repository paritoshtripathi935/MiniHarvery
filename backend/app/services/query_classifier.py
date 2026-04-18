"""
Query classifier — lightweight keyword heuristics, no API call needed.
Determines whether a legal query is about case law, statutes, or general.
"""
from enum import Enum


class QueryType(str, Enum):
    CASE_LAW = "case_law"
    STATUTE = "statute"
    GENERAL = "general"


# Keywords that indicate statute/act queries
_STATUTE_KEYWORDS = {
    "section", "act", "ipc", "cpc", "crpc", "article", "constitution",
    "amendment", "schedule", "rule", "regulation", "ordinance", "bill",
    "provision", "clause", "sub-section", "chapter", "bare act", "statute",
    "legislation", "code", "bylaw", "notification", "gazette",
}

# Keywords that indicate case law / judgment queries
_CASE_LAW_KEYWORDS = {
    "judgment", "judgement", "case", "court", "ruling", "held", "bench",
    "verdict", "order", "petition", "appeal", "writ", "suo motu", "PIL",
    "plaintiff", "defendant", "appellant", "respondent", "landmark",
    "precedent", "overruled", "affirmed", "acquitted", "convicted",
    "supreme court", "high court", "district court", "tribunal", "sc", "hc",
    "air", "scc", "scr", "ilr",
}


def classify_query(query: str) -> QueryType:
    """
    Classify user query into case_law, statute, or general.
    Scores both categories; highest score wins. Ties go to case_law.
    """
    lower = query.lower()
    tokens = set(lower.split())

    statute_score = len(tokens & _STATUTE_KEYWORDS)
    statute_score += sum(1 for kw in _STATUTE_KEYWORDS if " " in kw and kw in lower)

    case_law_score = len(tokens & _CASE_LAW_KEYWORDS)
    case_law_score += sum(1 for kw in _CASE_LAW_KEYWORDS if " " in kw and kw in lower)

    if statute_score == 0 and case_law_score == 0:
        return QueryType.GENERAL
    if case_law_score >= statute_score:
        return QueryType.CASE_LAW
    return QueryType.STATUTE

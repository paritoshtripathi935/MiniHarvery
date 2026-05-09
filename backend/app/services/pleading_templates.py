"""Pleading-draft templates — single source of truth.

Each entry pairs a field schema with a system + user prompt. The handler
fetches a template by id, validates the inbound fields against it, and
hands the system/user messages to `cloudflare_ai.chat_completion`.

Templates intentionally live in code (not the DB): they're config more
than data, they evolve with prompt iteration, and shipping a change is
just a deploy.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from app.schemas.draft_model import DraftField, DraftTemplate


# ── Common fields shared by every template ───────────────────────────────────

_COMMON_FIELDS: List[DraftField] = [
    DraftField(
        id="court_name",
        label="Before",
        type="text",
        placeholder="In the High Court of Delhi at New Delhi",
        required=True,
    ),
    DraftField(
        id="cause_number",
        label="Cause / case number",
        type="text",
        placeholder="e.g. CS(OS) 1234/2024 (leave blank if filing fresh)",
    ),
    DraftField(
        id="jurisdiction",
        label="Jurisdictional clause",
        type="textarea",
        hint="Why this court has jurisdiction. Defaults are inferred from the court name.",
    ),
]


# ── Template definitions ─────────────────────────────────────────────────────

_PLAINT = DraftTemplate(
    id="plaint",
    label="Plaint (CPC O.VII)",
    description="Civil suit. Used to initiate any civil action in subordinate or original-side proceedings.",
    fields=_COMMON_FIELDS + [
        DraftField(id="reliefs", label="Reliefs sought", type="list",
                   hint='"This Hon\'ble Court may be pleased to grant…" — one bullet per relief.', required=True),
        DraftField(id="cause_of_action", label="Cause of action", type="textarea",
                   hint="When + where + what gave rise to the claim. Becomes paragraphs 4–8.", required=True),
        DraftField(id="facts", label="Material facts", type="list",
                   hint="5–10 bullets, chronological. The LLM expands each into a numbered paragraph.", required=True),
        DraftField(id="valuation", label="Valuation for court fees", type="text",
                   placeholder="e.g. Rs. 5,00,000/-"),
        DraftField(id="limitation_note", label="Limitation", type="textarea",
                   hint="When the cause of action arose; why the suit is within limitation."),
    ],
)


_WRIT_226 = DraftTemplate(
    id="writ_226",
    label="Writ Petition (Article 226)",
    description="Constitutional writ before a High Court — fundamental rights breaches and unconstitutional state action.",
    fields=_COMMON_FIELDS + [
        DraftField(id="reliefs", label="Prayer (reliefs)", type="list", required=True),
        DraftField(id="fundamental_rights", label="Fundamental rights breached", type="list",
                   hint="e.g. Article 14 (equality), Article 21 (life and liberty). One per row."),
        DraftField(id="impugned_action", label="Impugned action / order", type="textarea",
                   hint="What the State has done that is unconstitutional or illegal.", required=True),
        DraftField(id="facts", label="Brief facts", type="list", required=True),
        DraftField(id="alternative_remedy_note", label="Alternative remedy", type="textarea",
                   hint="Why no efficacious alternative is available, or why writ is still maintainable despite one."),
        DraftField(id="urgency", label="Grounds of urgency", type="textarea"),
    ],
)


_ANTICIPATORY_BAIL = DraftTemplate(
    id="anticipatory_bail",
    label="Anticipatory Bail (CrPC s.438)",
    description="Pre-arrest bail application. Files in Sessions Court or High Court.",
    fields=_COMMON_FIELDS + [
        DraftField(id="fir_details", label="FIR / case details", type="textarea",
                   placeholder="FIR No., police station, date of registration, sections invoked", required=True),
        DraftField(id="sections_invoked", label="Sections invoked", type="list",
                   hint="e.g. IPC 420, IPC 406, IPC 506. One per row.", required=True),
        DraftField(id="allegations_summary", label="Allegations (summary)", type="textarea", required=True),
        DraftField(id="denial_grounds", label="Why allegations are false / motivated", type="list", required=True),
        DraftField(id="cooperation_offer", label="Cooperation offered", type="textarea",
                   hint="e.g. willing to join investigation, surrender passport, not influence witnesses."),
        DraftField(id="antecedents", label="Clean antecedents (if any)", type="textarea"),
    ],
)


_LEGAL_NOTICE = DraftTemplate(
    id="legal_notice",
    label="Legal Notice",
    description="Pre-litigation correspondence demanding action with a stated consequence.",
    # Legal notices don't go before a court — only the common 'jurisdiction' field
    # is irrelevant. Notices include the addressee instead.
    fields=[
        DraftField(id="addressee_name", label="Addressee", type="text", required=True),
        DraftField(id="addressee_address", label="Addressee address", type="textarea", required=True),
        DraftField(id="sender_capacity", label="On whose behalf", type="text",
                   placeholder="e.g. Mr. X, my client", required=True),
        DraftField(id="subject", label="Subject", type="text", required=True),
        DraftField(id="facts", label="Facts giving rise to grievance", type="list", required=True),
        DraftField(id="demand", label="Demand", type="textarea",
                   hint="What the addressee must do, by when.", required=True),
        DraftField(id="consequence", label="Consequence of non-compliance", type="textarea",
                   placeholder="e.g. legal proceedings under Section 138 of the Negotiable Instruments Act, 1881"),
        DraftField(id="compliance_period", label="Compliance period", type="text",
                   placeholder="e.g. 15 days", required=True),
    ],
)


TEMPLATES: Dict[str, DraftTemplate] = {
    t.id: t for t in (_PLAINT, _WRIT_226, _ANTICIPATORY_BAIL, _LEGAL_NOTICE)
}


def list_templates() -> List[DraftTemplate]:
    return list(TEMPLATES.values())


def get_template(template_id: str) -> DraftTemplate | None:
    return TEMPLATES.get(template_id)


# ── Per-template prompts ─────────────────────────────────────────────────────

_BASE_RULES = """Output rules:
- Pure Markdown, no commentary, no preamble.
- Numbered paragraphs (1., 2., 3., …) for the body.
- Use **bold** for headings (e.g. **MEMO OF PARTIES**, **PRAYER**, **VERIFICATION**).
- Indian legal English: formal register, third-person where convention demands it.
- Cite section numbers and act names in full on first mention (e.g. "Section 9 of the Code of Civil Procedure, 1908").
- Where the user has left a field blank or marked uncertain, leave a clearly bracketed gap like `[insert details]` rather than inventing facts.
- End with the conventional signature/verification block appropriate to the document type.
"""


_PROMPTS: Dict[str, Tuple[str, str]] = {
    # Each entry: (system_prompt, user_template).
    # User templates are .format()'d with the field map after we render
    # list-typed fields into bullet strings.
    "plaint": (
        f"""You are drafting a Plaint under Order VII of the Code of Civil Procedure, 1908.
Produce the Plaint in full, with these conventional sections:
  1. Cause title (court, parties).
  2. Numbered paragraphs covering: parties; jurisdiction; cause of action; material facts; valuation; limitation; cause of action accruing; reliefs.
  3. PRAYER block listing the reliefs in roman numerals.
  4. VERIFICATION block.
  5. Signature line for the Plaintiff and Counsel.

{_BASE_RULES}""",
        """Court: {court_name}
Cause / case number: {cause_number}
Parties: {parties_block}
Jurisdiction (user-supplied): {jurisdiction}
Reliefs sought:
{reliefs}
Cause of action:
{cause_of_action}
Material facts:
{facts}
Valuation: {valuation}
Limitation note: {limitation_note}

Draft the complete Plaint as Markdown.""",
    ),
    "writ_226": (
        f"""You are drafting a Writ Petition under Article 226 of the Constitution of India before a High Court.
Produce the petition with these sections:
  1. Cause title.
  2. Numbered paragraphs: status of petitioner / respondent; locus standi; the impugned action; facts; fundamental rights breached and how; the absence of (or insufficiency of) alternative remedy; urgency.
  3. GROUNDS section listing each ground in bold.
  4. PRAYER block.
  5. AFFIDAVIT-IN-SUPPORT verification.

{_BASE_RULES}""",
        """Court: {court_name}
Cause / case number: {cause_number}
Parties: {parties_block}
Jurisdiction (user-supplied): {jurisdiction}
Impugned action: {impugned_action}
Brief facts:
{facts}
Fundamental rights breached:
{fundamental_rights}
Alternative remedy: {alternative_remedy_note}
Urgency: {urgency}
Reliefs:
{reliefs}

Draft the complete Writ Petition as Markdown.""",
    ),
    "anticipatory_bail": (
        f"""You are drafting an application for Anticipatory Bail under Section 438 of the Code of Criminal Procedure, 1973.
Produce the application with these sections:
  1. Cause title.
  2. Numbered paragraphs: applicant's profile and clean antecedents; FIR details; allegations summary; why allegations are false / motivated; absence of flight risk; offer of cooperation.
  3. PRAYER block.
  4. VERIFICATION.

{_BASE_RULES}""",
        """Court: {court_name}
Cause / case number: {cause_number}
Parties: {parties_block}
FIR details: {fir_details}
Sections invoked:
{sections_invoked}
Allegations summary: {allegations_summary}
Grounds for denial:
{denial_grounds}
Cooperation offered: {cooperation_offer}
Antecedents: {antecedents}
Jurisdiction (user-supplied): {jurisdiction}

Draft the complete Anticipatory Bail Application as Markdown.""",
    ),
    "legal_notice": (
        f"""You are drafting a pre-litigation Legal Notice in Indian advocacy practice.
Produce the notice with:
  1. Letterhead block (counsel's name placeholder, date placeholder).
  2. Addressee block.
  3. Subject line.
  4. Numbered factual paragraphs.
  5. The DEMAND clause.
  6. The CONSEQUENCE clause stating the legal action contemplated.
  7. Stated compliance period.
  8. Signature line for Counsel.

The tone is firm, formal, and quotable — assume opposing counsel will read every word.

{_BASE_RULES}""",
        """Addressee: {addressee_name}
Address: {addressee_address}
On behalf of: {sender_capacity}
Subject: {subject}
Facts:
{facts}
Demand: {demand}
Consequence: {consequence}
Compliance period: {compliance_period}

Draft the complete Legal Notice as Markdown.""",
    ),
}


def get_prompts(template_id: str) -> Tuple[str, str] | None:
    return _PROMPTS.get(template_id)

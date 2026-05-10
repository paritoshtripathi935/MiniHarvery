"""Schemas for the Drafting Workshop.

`DraftTemplate` and `DraftField` describe the form the FE renders for
each pleading. Templates are server-owned (one source of truth, easy
to evolve without a redeploy of the FE) and surfaced via
`GET /api/v1/draft-templates`.
"""
from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel
from uuid import UUID


FieldType = Literal["text", "textarea", "list"]


class DraftField(BaseModel):
    id: str
    label: str
    type: FieldType
    placeholder: Optional[str] = None
    hint: Optional[str] = None
    required: bool = False


class DraftTemplate(BaseModel):
    id: str
    label: str
    description: str
    fields: List[DraftField]


class GenerateDraftRequest(BaseModel):
    """POST /matters/{matter_id}/drafts body.

    `fields` is a free-form dict whose shape is constrained by the
    template's field schema. List-typed fields arrive as `list[str]`,
    text/textarea as `str`. Validation against the schema happens in
    the handler so we can return precise 400s.
    """
    template_id: str
    title: Optional[str] = None
    fields: Dict[str, object] = {}
    query_id: Optional[UUID] = None


# ── Conversational drafting (PAI-11) ────────────────────────────────────────

DraftingRole = Literal["user", "assistant"]


class DraftingMessage(BaseModel):
    role: DraftingRole
    content: str


class DraftingTurnRequest(BaseModel):
    """POST /api/v1/drafting/{template_id}/turn body.

    Stateless: the FE owns the message history and the running field map,
    re-sending both with every turn. No new tables — the in-progress
    session lives entirely on the client until the user hits "Generate"
    and we persist a Document via the existing /matters/{id}/drafts
    endpoint.
    """
    messages: List[DraftingMessage]
    extracted_fields: Dict[str, object] = {}


class DraftingTurnResponse(BaseModel):
    """`kind="ask"` means we still need more info — `question` carries the
    next prompt for the user. `kind="ready"` means every required field
    has been collected and the FE can offer a "Generate draft now" CTA."""
    kind: Literal["ask", "ready"]
    question: Optional[str] = None
    extracted_fields: Dict[str, object] = {}
    missing_required: List[str] = []

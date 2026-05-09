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

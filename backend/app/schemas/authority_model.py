"""Request DTOs for the authorities API."""
from __future__ import annotations

import uuid
from typing import List, Optional

from pydantic import BaseModel, Field


class PinAuthorityRequest(BaseModel):
    """POST /matters/{id}/authorities — pin a case to a matter.

    Idempotent. If a row already exists for (matter, indian_kanoon_tid) or
    (matter, lower(case_name)) the server returns the existing row instead
    of inserting a duplicate."""

    case_name: str = Field(..., min_length=1, max_length=500)
    citation: Optional[str] = Field(default=None, max_length=500)
    court: Optional[str] = Field(default=None, max_length=200)
    year: Optional[int] = Field(default=None, ge=1800, le=2100)
    source_url: Optional[str] = Field(default=None, max_length=2000)
    indian_kanoon_tid: Optional[str] = Field(default=None, max_length=100)
    proposition: Optional[str] = Field(default=None, max_length=2000)
    paragraphs: Optional[List[str]] = None
    notes: Optional[str] = Field(default=None, max_length=5000)
    first_pinned_from_document_id: Optional[uuid.UUID] = None
    first_pinned_from_thread_id: Optional[uuid.UUID] = None
    first_pinned_from_answer_id: Optional[uuid.UUID] = None


class UpdateAuthorityRequest(BaseModel):
    """PATCH /authorities/{id} — partial update of advocate-authored fields."""

    case_name: Optional[str] = Field(default=None, min_length=1, max_length=500)
    citation: Optional[str] = Field(default=None, max_length=500)
    court: Optional[str] = Field(default=None, max_length=200)
    year: Optional[int] = Field(default=None, ge=1800, le=2100)
    proposition: Optional[str] = Field(default=None, max_length=2000)
    paragraphs: Optional[List[str]] = None
    notes: Optional[str] = Field(default=None, max_length=5000)
    sort_order: Optional[int] = None

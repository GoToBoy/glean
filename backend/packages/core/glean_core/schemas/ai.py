"""Schemas for local AI integration REST APIs."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


def _string_list_factory() -> list[str]:
    return []


def _record_list_factory() -> list[dict[str, Any]]:
    return []


def _metadata_factory() -> dict[str, Any]:
    return {}


class AIEntrySupplementPayload(BaseModel):
    """Entry-level AI supplement payload."""

    model: str | None = None
    summary: str | None = None
    key_points: list[str] = Field(default_factory=_string_list_factory)
    tags: list[str] = Field(default_factory=_string_list_factory)
    reading_priority: str | None = Field(default=None, max_length=20)
    reason: str | None = None
    metadata: dict[str, Any] = Field(default_factory=_metadata_factory)


class AIEntrySupplementResponse(AIEntrySupplementPayload):
    """Entry-level AI supplement response."""

    id: str
    user_id: str
    entry_id: str
    created_at: datetime
    updated_at: datetime


class AIDailySummaryPayload(BaseModel):
    """Day-level AI summary payload."""

    date: date
    timezone: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = None
    title: str | None = None
    summary: str | None = None
    highlights: list[dict[str, Any]] = Field(default_factory=_record_list_factory)
    topics: list[dict[str, Any]] = Field(default_factory=_record_list_factory)
    recommended_entry_ids: list[str] = Field(default_factory=_string_list_factory)
    metadata: dict[str, Any] = Field(default_factory=_metadata_factory)


class AIDailySummaryResponse(AIDailySummaryPayload):
    """Day-level AI summary response."""

    id: str
    user_id: str
    timezone: str
    created_at: datetime
    updated_at: datetime


class AITodayEntryItem(BaseModel):
    """AI-facing entry list item."""

    id: str
    title: str
    url: str
    author: str | None
    feed_id: str
    feed_title: str | None
    published_at: datetime | None
    ingested_at: datetime | None
    summary: str | None
    content: str | None = None
    content_available: bool
    is_read: bool
    is_bookmarked: bool
    ai_supplement_available: bool


class AITodayEntriesResponse(BaseModel):
    """AI-facing today entries response."""

    date: date
    timezone: str
    total: int
    items: list[AITodayEntryItem]


class AIEntryDetailResponse(BaseModel):
    """AI-facing full entry detail response."""

    id: str
    title: str
    url: str
    author: str | None
    feed_id: str
    feed_title: str | None
    published_at: datetime | None
    ingested_at: datetime | None
    summary: str | None
    content: str | None
    content_source: str | None
    ai_supplement: AIEntrySupplementResponse | None = None

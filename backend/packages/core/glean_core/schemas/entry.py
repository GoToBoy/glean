"""
Entry schemas.

Request and response models for entry-related operations.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class EntryBase(BaseModel):
    """Base entry fields."""

    title: str
    url: str


class EntryResponse(BaseModel):
    """Entry response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    feed_id: str
    url: str
    title: str
    author: str | None
    content: str | None
    summary: str | None
    published_at: datetime | None
    created_at: datetime
    # User-specific fields (from UserEntry)
    is_read: bool = False
    is_liked: bool | None = None
    read_later: bool = False
    read_at: datetime | None = None


class EntryListResponse(BaseModel):
    """Paginated entry list response."""

    items: list[EntryResponse]
    total: int
    page: int
    per_page: int
    has_more: bool


class UpdateEntryStateRequest(BaseModel):
    """Update entry state request."""

    is_read: bool | None = None
    is_liked: bool | None = None
    read_later: bool | None = None

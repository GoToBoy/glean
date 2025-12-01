"""
Tag schemas.

Pydantic models for tag-related API request/response handling.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TagBase(BaseModel):
    """Base tag schema with common fields."""

    name: str = Field(..., min_length=1, max_length=50)
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")


class TagCreate(TagBase):
    """Schema for creating a new tag."""

    pass


class TagUpdate(BaseModel):
    """Schema for updating a tag."""

    name: str | None = Field(None, min_length=1, max_length=50)
    color: str | None = Field(None, pattern="^#[0-9A-Fa-f]{6}$")


class TagResponse(TagBase):
    """Response schema for a single tag."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    created_at: datetime


class TagWithCountsResponse(TagResponse):
    """Response schema for tag with usage counts."""

    bookmark_count: int = 0
    entry_count: int = 0


class TagListResponse(BaseModel):
    """Response schema for tag list."""

    tags: list[TagWithCountsResponse]


class TagBatchRequest(BaseModel):
    """Schema for batch tag operations."""

    action: str = Field(..., pattern="^(add|remove)$")
    tag_id: str
    target_type: str = Field(..., pattern="^(bookmark|user_entry)$")
    target_ids: list[str]


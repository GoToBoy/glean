"""
Feed and subscription schemas.

Request and response models for feed-related operations.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


class FeedBase(BaseModel):
    """Base feed fields."""

    url: HttpUrl
    title: str | None = None
    description: str | None = None


class FeedResponse(BaseModel):
    """Feed response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    title: str | None
    site_url: str | None
    description: str | None
    icon_url: str | None
    language: str | None
    status: str
    error_count: int
    last_fetched_at: datetime | None
    last_entry_at: datetime | None
    created_at: datetime


class SubscriptionResponse(BaseModel):
    """Subscription response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    feed_id: str
    custom_title: str | None
    created_at: datetime
    feed: FeedResponse
    unread_count: int = 0


class DiscoverFeedRequest(BaseModel):
    """Discover feed from URL request."""

    url: HttpUrl


class UpdateSubscriptionRequest(BaseModel):
    """Update subscription request."""

    custom_title: str | None = None

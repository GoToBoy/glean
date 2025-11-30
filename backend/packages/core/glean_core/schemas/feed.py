"""
Feed and subscription schemas.

Request and response models for feed-related operations.
"""

from datetime import datetime

from pydantic import BaseModel, HttpUrl


class FeedBase(BaseModel):
    """Base feed fields."""

    url: HttpUrl
    title: str | None = None
    description: str | None = None


class FeedResponse(BaseModel):
    """Feed response model."""

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

    class Config:
        from_attributes = True


class SubscriptionResponse(BaseModel):
    """Subscription response model."""

    id: str
    user_id: str
    feed_id: str
    custom_title: str | None
    created_at: datetime
    feed: FeedResponse

    class Config:
        from_attributes = True


class DiscoverFeedRequest(BaseModel):
    """Discover feed from URL request."""

    url: HttpUrl


class UpdateSubscriptionRequest(BaseModel):
    """Update subscription request."""

    custom_title: str | None = None

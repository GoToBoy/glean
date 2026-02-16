"""
Discovery schemas.

Request and response models for source discovery APIs.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


DiscoveryFeedbackType = Literal[
    "dismiss_source",
    "reduce_topic",
    "trial_start",
    "trial_end",
    "subscribed",
]


class DiscoveryCandidateResponse(BaseModel):
    """Discovery candidate response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    feed_url: str
    site_url: str | None = None
    title: str | None = None
    language: str | None = None
    topic: str
    source_kind: str
    reason: str
    quality_score: float
    relevance_score: float
    novelty_score: float
    diversity_score: float
    discovery_score: float
    fetch_success_rate: float
    update_stability_score: float
    dedup_ratio: float
    is_blocked: bool
    trial_started_at: datetime | None = None
    trial_ends_at: datetime | None = None
    subscribed_at: datetime | None = None
    refreshed_at: datetime


class DiscoveryListResponse(BaseModel):
    """Discovery candidates list response."""

    items: list[DiscoveryCandidateResponse]
    total: int


class DiscoveryTrialRequest(BaseModel):
    """Start trial request."""

    days: int = 7


class DiscoveryFeedbackRequest(BaseModel):
    """Submit discovery feedback."""

    feedback_type: DiscoveryFeedbackType
    topic: str | None = None


class DiscoveryActionResponse(BaseModel):
    """Generic discovery action response."""

    ok: bool = True
    message: str

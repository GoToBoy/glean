"""
Pydantic schemas for API requests and responses.
"""

from .auth import LoginRequest, RefreshTokenRequest, RegisterRequest, TokenResponse
from .entry import EntryListResponse, EntryResponse, UpdateEntryStateRequest
from .feed import (
    DiscoverFeedRequest,
    FeedResponse,
    SubscriptionResponse,
    UpdateSubscriptionRequest,
)
from .user import UserResponse, UserUpdate

__all__ = [
    # Auth
    "LoginRequest",
    "RefreshTokenRequest",
    "RegisterRequest",
    "TokenResponse",
    # User
    "UserResponse",
    "UserUpdate",
    # Feed
    "FeedResponse",
    "SubscriptionResponse",
    "DiscoverFeedRequest",
    "UpdateSubscriptionRequest",
    # Entry
    "EntryResponse",
    "EntryListResponse",
    "UpdateEntryStateRequest",
]

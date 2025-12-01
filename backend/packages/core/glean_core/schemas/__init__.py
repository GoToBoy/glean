"""
Pydantic schemas for API requests and responses.
"""

from .auth import LoginRequest, RefreshTokenRequest, RegisterRequest, TokenResponse
from .bookmark import (
    BookmarkCreate,
    BookmarkFolderRequest,
    BookmarkListResponse,
    BookmarkResponse,
    BookmarkTagRequest,
    BookmarkUpdate,
)
from .entry import EntryListResponse, EntryResponse, UpdateEntryStateRequest
from .feed import (
    BatchDeleteSubscriptionsRequest,
    BatchDeleteSubscriptionsResponse,
    DiscoverFeedRequest,
    FeedResponse,
    SubscriptionResponse,
    UpdateSubscriptionRequest,
)
from .folder import (
    FolderCreate,
    FolderMove,
    FolderReorder,
    FolderResponse,
    FolderTreeNode,
    FolderTreeResponse,
    FolderUpdate,
)
from .tag import (
    TagBatchRequest,
    TagCreate,
    TagListResponse,
    TagResponse,
    TagUpdate,
    TagWithCountsResponse,
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
    "BatchDeleteSubscriptionsRequest",
    "BatchDeleteSubscriptionsResponse",
    # Entry
    "EntryResponse",
    "EntryListResponse",
    "UpdateEntryStateRequest",
    # M2: Bookmark
    "BookmarkCreate",
    "BookmarkUpdate",
    "BookmarkResponse",
    "BookmarkListResponse",
    "BookmarkFolderRequest",
    "BookmarkTagRequest",
    # M2: Folder
    "FolderCreate",
    "FolderUpdate",
    "FolderMove",
    "FolderReorder",
    "FolderResponse",
    "FolderTreeNode",
    "FolderTreeResponse",
    # M2: Tag
    "TagCreate",
    "TagUpdate",
    "TagResponse",
    "TagWithCountsResponse",
    "TagListResponse",
    "TagBatchRequest",
]

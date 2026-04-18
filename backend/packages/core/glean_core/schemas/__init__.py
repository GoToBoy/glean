"""
Pydantic schemas for API requests and responses.
"""

from .ai import (
    AIDailySummaryPayload,
    AIDailySummaryResponse,
    AIEntryDetailResponse,
    AIEntrySupplementPayload,
    AIEntrySupplementResponse,
    AITodayEntriesResponse,
    AITodayEntryItem,
)
from .api_token import (
    APITokenCreate,
    APITokenCreateResponse,
    APITokenListResponse,
    APITokenResponse,
)
from .auth import LoginRequest, RefreshTokenRequest, RegisterRequest, TokenResponse
from .bookmark import (
    BookmarkCreate,
    BookmarkFolderRequest,
    BookmarkListResponse,
    BookmarkResponse,
    BookmarkTagRequest,
    BookmarkUpdate,
)
from .config import (
    AIIntegrationConfig,
    AIIntegrationConfigResponse,
    AIIntegrationConfigUpdateRequest,
    AIIntegrationStatusResponse,
    EmbeddingConfig,
    EmbeddingConfigResponse,
    EmbeddingConfigUpdateRequest,
    EmbeddingRebuildProgress,
    PreferenceConfig,
    RateLimitConfig,
    RSSHubConfig,
    RSSHubConfigUpdateRequest,
    ScoreConfig,
    SystemTimeResponse,
    ValidationResult,
    VectorizationStatus,
    VectorizationStatusResponse,
)
from .discovery import (
    DiscoveryActionResponse,
    DiscoveryCandidateResponse,
    DiscoveryFeedbackRequest,
    DiscoveryListResponse,
    DiscoveryTrialRequest,
)
from .entry import (
    EntryListResponse,
    EntryResponse,
    ParagraphTranslationsResponse,
    TranslateEntryRequest,
    TranslateTextsRequest,
    TranslateTextsResponse,
    TranslationResponse,
    UpdateEntryStateRequest,
)
from .feed import (
    BatchDeleteSubscriptionsRequest,
    BatchDeleteSubscriptionsResponse,
    DiscoverFeedRequest,
    FeedResponse,
    SubscriptionListResponse,
    SubscriptionResponse,
    SubscriptionSyncResponse,
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
from .user import UserResponse, UserSettings, UserUpdate

__all__ = [
    # API Token
    "APITokenCreate",
    "APITokenCreateResponse",
    "APITokenListResponse",
    "APITokenResponse",
    # Auth
    "LoginRequest",
    "RefreshTokenRequest",
    "RegisterRequest",
    "TokenResponse",
    # AI
    "AIDailySummaryPayload",
    "AIDailySummaryResponse",
    "AIEntryDetailResponse",
    "AIEntrySupplementPayload",
    "AIEntrySupplementResponse",
    "AITodayEntriesResponse",
    "AITodayEntryItem",
    # User
    "UserResponse",
    "UserSettings",
    "UserUpdate",
    # Feed
    "FeedResponse",
    "SubscriptionResponse",
    "SubscriptionListResponse",
    "SubscriptionSyncResponse",
    "DiscoverFeedRequest",
    "UpdateSubscriptionRequest",
    "BatchDeleteSubscriptionsRequest",
    "BatchDeleteSubscriptionsResponse",
    # Entry
    "EntryResponse",
    "EntryListResponse",
    "UpdateEntryStateRequest",
    "TranslateEntryRequest",
    "TranslateTextsRequest",
    "TranslateTextsResponse",
    "TranslationResponse",
    "ParagraphTranslationsResponse",
    # M2: Bookmark
    "BookmarkCreate",
    "BookmarkUpdate",
    "BookmarkResponse",
    "BookmarkListResponse",
    "BookmarkFolderRequest",
    "BookmarkTagRequest",
    # Discovery
    "DiscoveryCandidateResponse",
    "DiscoveryListResponse",
    "DiscoveryTrialRequest",
    "DiscoveryFeedbackRequest",
    "DiscoveryActionResponse",
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
    # Config
    "AIIntegrationConfig",
    "AIIntegrationConfigResponse",
    "AIIntegrationConfigUpdateRequest",
    "AIIntegrationStatusResponse",
    "EmbeddingConfig",
    "EmbeddingConfigResponse",
    "EmbeddingConfigUpdateRequest",
    "EmbeddingRebuildProgress",
    "PreferenceConfig",
    "RateLimitConfig",
    "RSSHubConfig",
    "RSSHubConfigUpdateRequest",
    "ScoreConfig",
    "SystemTimeResponse",
    "ValidationResult",
    "VectorizationStatus",
    "VectorizationStatusResponse",
]

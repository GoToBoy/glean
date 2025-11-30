"""
Admin schemas.

Pydantic models for admin API requests and responses.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AdminLoginRequest(BaseModel):
    """Admin login request schema."""

    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1)


class AdminLoginResponse(BaseModel):
    """Admin login response schema."""

    access_token: str
    token_type: str = "bearer"
    admin: "AdminUserResponse"


class AdminUserResponse(BaseModel):
    """Admin user response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserListItem(BaseModel):
    """User list item schema."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str | None
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class UserListResponse(BaseModel):
    """User list response schema."""

    items: list[UserListItem]
    total: int
    page: int
    per_page: int
    total_pages: int


class ToggleUserStatusRequest(BaseModel):
    """Toggle user status request schema."""

    is_active: bool


class DashboardStatsResponse(BaseModel):
    """Dashboard statistics response schema."""

    total_users: int
    active_users: int
    total_feeds: int
    total_entries: int
    total_subscriptions: int
    new_users_today: int
    new_entries_today: int


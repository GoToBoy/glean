"""
User schemas.

Request and response models for user-related operations.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr


class UserBase(BaseModel):
    """Base user fields."""

    email: EmailStr | None = None  # Email can be None for OAuth users without email scope
    name: str | None = None
    username: str | None = None  # Username (e.g., preferred_username from OIDC)
    phone: str | None = None  # Phone number (e.g., phone_number from OIDC)


class UserResponse(UserBase):
    """User response model."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    avatar_url: str | None = None
    is_active: bool
    is_verified: bool
    settings: dict[str, Any] | None = None
    created_at: datetime
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    """User creation request (for internal use)."""

    email: EmailStr
    name: str
    password: str


class UserUpdate(BaseModel):
    """User update request."""

    name: str | None = None
    username: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    settings: dict[str, Any] | None = None

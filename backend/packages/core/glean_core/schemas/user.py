"""
User schemas.

Request and response models for user-related operations.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Base user fields."""

    email: EmailStr
    name: str


class UserResponse(UserBase):
    """User response model."""

    id: str
    avatar_url: str | None = None
    is_active: bool
    is_verified: bool
    settings: dict[str, Any] | None = None
    created_at: datetime
    last_login_at: datetime | None = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    """User update request."""

    name: str | None = None
    avatar_url: str | None = None
    settings: dict[str, Any] | None = None

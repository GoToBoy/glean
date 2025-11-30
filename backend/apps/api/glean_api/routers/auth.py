"""
Authentication router.

Provides endpoints for user registration, login, token refresh, and user profile.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from glean_core.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from glean_core.services import AuthService

from ..dependencies import get_auth_service, get_current_user

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict[str, UserResponse | TokenResponse]:
    """
    Register a new user account.

    Args:
        data: User registration data.
        auth_service: Authentication service.

    Returns:
        User profile and authentication tokens.

    Raises:
        HTTPException: If email is already registered.
    """
    try:
        user, tokens = await auth_service.register(data)
        return {"user": user, "tokens": tokens}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login")
async def login(
    data: LoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict[str, UserResponse | TokenResponse]:
    """
    Authenticate user and issue tokens.

    Args:
        data: User login credentials.
        auth_service: Authentication service.

    Returns:
        User profile and authentication tokens.

    Raises:
        HTTPException: If credentials are invalid.
    """
    try:
        user, tokens = await auth_service.login(data)
        return {"user": user, "tokens": tokens}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/refresh")
async def refresh_token(
    data: RefreshTokenRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    """
    Refresh access token using refresh token.

    Args:
        data: Refresh token request.
        auth_service: Authentication service.

    Returns:
        New access and refresh tokens.

    Raises:
        HTTPException: If refresh token is invalid or expired.
    """
    try:
        tokens = await auth_service.refresh_access_token(data.refresh_token)
        return tokens
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/logout")
async def logout() -> dict[str, str]:
    """
    Logout user (placeholder for token invalidation).

    Returns:
        Success message.
    """
    # In a production system, you might want to invalidate the refresh token
    # by storing it in Redis with an expiration
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_me(
    current_user: Annotated[UserResponse, Depends(get_current_user)],
) -> UserResponse:
    """
    Get current authenticated user information.

    Args:
        current_user: Current authenticated user from token.

    Returns:
        User profile data.
    """
    return current_user

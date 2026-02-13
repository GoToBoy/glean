"""
Authentication router.

Provides endpoints for user registration, login, token refresh, and user profile.
"""

from typing import Annotated

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from glean_core import RedisKeys
from glean_core.schemas import (
    LoginRequest,
    RefreshTokenRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UserUpdate,
)
from glean_core.services import AuthService, TypedConfigService, UserService

from ..dependencies import (
    get_auth_service,
    get_current_user,
    get_redis_pool,
    get_typed_config_service,
    get_user_service,
)

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    config_service: Annotated[TypedConfigService, Depends(get_typed_config_service)],
) -> dict[str, UserResponse | TokenResponse]:
    """
    Register a new user account.

    Args:
        data: User registration data.
        auth_service: Authentication service.
        config_service: Typed config service.

    Returns:
        User profile and authentication tokens.

    Raises:
        HTTPException: If email is already registered or registration is disabled.
    """
    if not await config_service.is_registration_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently disabled by the administrator",
        )

    try:
        user, tokens = await auth_service.register(data)
        return {"user": user, "tokens": tokens}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from None


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from None


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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from None


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


@router.patch("/me")
async def update_me(
    data: UserUpdate,
    current_user: Annotated[UserResponse, Depends(get_current_user)],
    user_service: Annotated[UserService, Depends(get_user_service)],
) -> UserResponse:
    """
    Update current user profile and settings.

    Args:
        data: Update data (name, avatar_url, settings).
        current_user: Current authenticated user from token.
        user_service: User service.

    Returns:
        Updated user profile data.
    """
    return await user_service.update_user(current_user.id, data)


# OAuth/OIDC endpoints


@router.get("/oauth/oidc/authorize")
async def oidc_authorize(
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
):
    """
    Get OIDC authorization URL.

    Args:
        auth_service: Authentication service.
        redis: Redis connection pool for state storage.

    Returns:
        authorization_url: URL to redirect user to OIDC provider.
        state: CSRF protection token.

    Raises:
        HTTPException: If OIDC is not enabled or provider not configured.
    """
    from secrets import token_urlsafe

    from fastapi.responses import JSONResponse

    from glean_core.auth.providers import AuthProviderFactory
    from glean_core.config import auth_provider_config

    # Check if OIDC is enabled
    if not auth_provider_config.oidc_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="OIDC authentication is not enabled"
        )

    # Get OIDC provider config
    provider_config = auth_service.provider_configs.get("oidc")
    if not provider_config:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OIDC provider not configured",
        )

    try:
        # Create OIDC provider
        provider = AuthProviderFactory.create("oidc", provider_config)

        # Load OIDC discovery config
        await provider._get_oidc_config()  # type: ignore[attr-defined]

        # Generate CSRF state with timestamp to prevent caching
        state = token_urlsafe(32)

        # Store state in Redis with 5-minute TTL for verification in callback
        await redis.setex(
            RedisKeys.oidc_state(state),
            RedisKeys.OIDC_STATE_TTL,
            "1",
        )

        # Get authorization URL with nonce to prevent caching
        auth_url = provider.get_authorization_url(
            state=state, redirect_uri=str(provider_config["redirect_uri"])
        )

        if not auth_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate authorization URL",
            )

        # Return response with no-cache headers to prevent browser caching
        return JSONResponse(
            content={
                "authorization_url": auth_url,
                "state": state,
            },
            headers={
                "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate authorization URL: {e}",
        ) from None


class OIDCCallbackRequest(BaseModel):
    """OIDC callback request payload."""

    code: str
    state: str


@router.post("/oauth/oidc/callback")
async def oidc_callback(
    data: OIDCCallbackRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    redis: Annotated[ArqRedis, Depends(get_redis_pool)],
) -> dict[str, UserResponse | TokenResponse]:
    """
    Handle OIDC callback after user authorization.

    Args:
        data: OIDC callback data containing code and state.
        auth_service: Authentication service.
        redis: Redis connection pool for state validation.

    Returns:
        user: User profile.
        tokens: JWT access and refresh tokens.

    Raises:
        HTTPException: If authentication fails or provider not configured.
    """
    # Validate state from Redis to prevent CSRF attacks
    state_key = RedisKeys.oidc_state(data.state)
    state_valid = await redis.exists(state_key)
    if not state_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired state"
        )

    # Delete state from Redis to prevent replay attacks
    await redis.delete(state_key)

    # Get provider config
    provider_config = auth_service.provider_configs.get("oidc")
    if not provider_config:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OIDC provider not configured",
        )

    # Prepare credentials
    credentials = {
        "code": data.code,
        "redirect_uri": str(provider_config["redirect_uri"]),
    }

    try:
        # Authenticate with OIDC provider
        user, tokens = await auth_service.login_with_provider("oidc", credentials)
        return {"user": user, "tokens": tokens}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from None

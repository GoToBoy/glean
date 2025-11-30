"""
FastAPI dependencies.

Provides dependency injection for database sessions, authentication, and services.
"""

from typing import Annotated, AsyncGenerator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.auth import JWTConfig, verify_token
from glean_core.schemas import UserResponse
from glean_core.services import AuthService, EntryService, FeedService, UserService
from glean_database.session import get_session

from .config import settings

# Security scheme for JWT bearer tokens
security = HTTPBearer()


def get_jwt_config() -> JWTConfig:
    """
    Get JWT configuration.

    Returns:
        JWT configuration instance.
    """
    return JWTConfig(
        secret_key=settings.secret_key,
        algorithm=settings.jwt_algorithm,
        access_token_expire_minutes=settings.jwt_access_token_expire_minutes,
        refresh_token_expire_days=settings.jwt_refresh_token_expire_days,
    )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    session: Annotated[AsyncSession, Depends(get_session)],
    jwt_config: Annotated[JWTConfig, Depends(get_jwt_config)],
) -> UserResponse:
    """
    Get current authenticated user from JWT token.

    Args:
        credentials: HTTP bearer credentials.
        session: Database session.
        jwt_config: JWT configuration.

    Returns:
        Current user information.

    Raises:
        HTTPException: If token is invalid or user not found.
    """
    token = credentials.credentials
    token_data = verify_token(token, jwt_config)

    if not token_data or token_data.type != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_service = AuthService(session, jwt_config)
    try:
        user = await auth_service.get_current_user(token)
        return user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        )


# Service dependencies
def get_auth_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    jwt_config: Annotated[JWTConfig, Depends(get_jwt_config)],
) -> AuthService:
    """Get authentication service instance."""
    return AuthService(session, jwt_config)


def get_user_service(session: Annotated[AsyncSession, Depends(get_session)]) -> UserService:
    """Get user service instance."""
    return UserService(session)


def get_feed_service(session: Annotated[AsyncSession, Depends(get_session)]) -> FeedService:
    """Get feed service instance."""
    return FeedService(session)


def get_entry_service(session: Annotated[AsyncSession, Depends(get_session)]) -> EntryService:
    """Get entry service instance."""
    return EntryService(session)

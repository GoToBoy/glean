"""
Authentication service.

Handles user registration, login, and token management.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from glean_core.auth import (
    JWTConfig,
    create_access_token,
    create_refresh_token,
    hash_password,
    verify_password,
    verify_token,
)
from glean_core.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from glean_database.models import User


class AuthService:
    """Authentication service."""

    def __init__(self, session: AsyncSession, jwt_config: JWTConfig):
        """
        Initialize authentication service.

        Args:
            session: Database session.
            jwt_config: JWT configuration.
        """
        self.session = session
        self.jwt_config = jwt_config

    async def register(self, request: RegisterRequest) -> tuple[UserResponse, TokenResponse]:
        """
        Register a new user.

        Args:
            request: Registration request data.

        Returns:
            Tuple of (user response, token response).

        Raises:
            ValueError: If email already exists.
        """
        # Check if email exists
        stmt = select(User).where(User.email == request.email)
        result = await self.session.execute(stmt)
        existing_user = result.scalar_one_or_none()

        if existing_user:
            raise ValueError("Email already registered")

        # Create new user
        user = User(
            email=request.email,
            name=request.name,
            password_hash=hash_password(request.password),
            is_active=True,
            is_verified=False,
        )

        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)

        # Generate tokens
        access_token = create_access_token(user.id, self.jwt_config)
        refresh_token = create_refresh_token(user.id, self.jwt_config)

        user_response = UserResponse.model_validate(user)
        token_response = TokenResponse(
            access_token=access_token, refresh_token=refresh_token
        )

        return user_response, token_response

    async def login(self, request: LoginRequest) -> tuple[UserResponse, TokenResponse]:
        """
        Authenticate user and generate tokens.

        Args:
            request: Login request data.

        Returns:
            Tuple of (user response, token response).

        Raises:
            ValueError: If credentials are invalid.
        """
        # Find user by email
        stmt = select(User).where(User.email == request.email)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not verify_password(request.password, user.password_hash):
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is disabled")

        # Update last login
        user.last_login_at = datetime.now(timezone.utc)
        await self.session.commit()
        await self.session.refresh(user)

        # Generate tokens
        access_token = create_access_token(user.id, self.jwt_config)
        refresh_token = create_refresh_token(user.id, self.jwt_config)

        user_response = UserResponse.model_validate(user)
        token_response = TokenResponse(
            access_token=access_token, refresh_token=refresh_token
        )

        return user_response, token_response

    async def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        """
        Refresh access token using refresh token.

        Args:
            refresh_token: Refresh token.

        Returns:
            New token response.

        Raises:
            ValueError: If refresh token is invalid.
        """
        token_data = verify_token(refresh_token, self.jwt_config)

        if not token_data or token_data.type != "refresh":
            raise ValueError("Invalid refresh token")

        # Verify user still exists and is active
        stmt = select(User).where(User.id == token_data.sub)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user or not user.is_active:
            raise ValueError("User not found or inactive")

        # Generate new tokens
        access_token = create_access_token(user.id, self.jwt_config)
        new_refresh_token = create_refresh_token(user.id, self.jwt_config)

        return TokenResponse(access_token=access_token, refresh_token=new_refresh_token)

    async def get_current_user(self, access_token: str) -> UserResponse:
        """
        Get current user from access token.

        Args:
            access_token: Access token.

        Returns:
            User response.

        Raises:
            ValueError: If token is invalid.
        """
        token_data = verify_token(access_token, self.jwt_config)

        if not token_data or token_data.type != "access":
            raise ValueError("Invalid access token")

        stmt = select(User).where(User.id == token_data.sub)
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if not user:
            raise ValueError("User not found")

        return UserResponse.model_validate(user)

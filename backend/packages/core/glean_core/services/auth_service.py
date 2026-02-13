"""
Authentication service.

Handles user registration, login, and token management with provider support.
"""

from datetime import UTC, datetime
from typing import Any

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
from glean_core.auth.providers import AuthProviderFactory, AuthResult
from glean_core.schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from glean_database.models import User, UserAuthProvider


class AuthService:
    """Authentication service with multi-provider support."""

    def __init__(
        self,
        session: AsyncSession,
        jwt_config: JWTConfig,
        provider_configs: dict[str, dict[str, Any]] | None = None,
    ):
        """
        Initialize authentication service.

        Args:
            session: Database session.
            jwt_config: JWT configuration.
            provider_configs: Provider-specific configurations (optional).
        """
        self.session = session
        self.jwt_config = jwt_config
        self.provider_configs = provider_configs or {}

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

        # Create new user with local authentication
        user = User(
            email=request.email,
            name=request.name,
            password_hash=hash_password(request.password),
            primary_auth_provider="local",
            provider_user_id=request.email,
            is_active=True,
            is_verified=False,
        )

        self.session.add(user)
        await self.session.flush()  # Flush to get user.id

        # Create local auth provider mapping
        auth_provider = UserAuthProvider(
            user_id=user.id,
            provider_id="local",
            provider_user_id=request.email,
            provider_metadata={},
        )
        self.session.add(auth_provider)

        await self.session.commit()
        await self.session.refresh(user)

        # Generate tokens
        access_token = create_access_token(str(user.id), self.jwt_config)
        refresh_token = create_refresh_token(str(user.id), self.jwt_config)

        user_response = UserResponse.model_validate(user)
        token_response = TokenResponse(access_token=access_token, refresh_token=refresh_token)

        return user_response, token_response

    async def login(self, request: LoginRequest) -> tuple[UserResponse, TokenResponse]:
        """
        Authenticate user with email and password (local provider).

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

        # Verify user exists and has a password (local auth)
        if not user:
            raise ValueError("Invalid email or password")

        # OAuth users don't have passwords
        if not user.password_hash:
            raise ValueError("Invalid email or password")

        # Verify password
        if not verify_password(request.password, user.password_hash):
            raise ValueError("Invalid email or password")

        if not user.is_active:
            raise ValueError("Account is disabled")

        # Update last login
        user.last_login_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(user)

        # Generate tokens
        access_token = create_access_token(str(user.id), self.jwt_config)
        refresh_token = create_refresh_token(str(user.id), self.jwt_config)

        user_response = UserResponse.model_validate(user)
        token_response = TokenResponse(access_token=access_token, refresh_token=refresh_token)

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
        access_token = create_access_token(str(user.id), self.jwt_config)
        new_refresh_token = create_refresh_token(str(user.id), self.jwt_config)

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

    async def login_with_provider(
        self, provider_id: str, credentials: dict[str, Any]
    ) -> tuple[UserResponse, TokenResponse]:
        """
        Authenticate with OAuth/OIDC provider.

        Args:
            provider_id: Provider identifier (e.g., 'oidc', 'google').
            credentials: Provider-specific credentials (e.g., authorization code).

        Returns:
            Tuple of (user response, token response).

        Raises:
            ValueError: If provider not configured or authentication fails.
        """
        # Get provider configuration
        provider_config = self.provider_configs.get(provider_id)
        if not provider_config:
            raise ValueError(f"Provider '{provider_id}' is not configured")

        # Create provider instance and authenticate
        provider = AuthProviderFactory.create(provider_id, provider_config)
        auth_result = await provider.authenticate(credentials)

        # Find or create user
        user = await self._find_or_create_oauth_user(provider_id, auth_result)

        # Update auth provider mapping
        await self._update_auth_provider(user.id, provider_id, auth_result)

        # Update last login
        user.last_login_at = datetime.now(UTC)
        await self.session.commit()
        await self.session.refresh(user)

        # Generate tokens
        access_token = create_access_token(str(user.id), self.jwt_config)
        refresh_token = create_refresh_token(str(user.id), self.jwt_config)

        user_response = UserResponse.model_validate(user)
        token_response = TokenResponse(access_token=access_token, refresh_token=refresh_token)

        return user_response, token_response

    async def _find_or_create_oauth_user(self, provider_id: str, auth_result: AuthResult) -> User:
        """
        Find existing user or create new one from OAuth authentication.

        Args:
            provider_id: Provider identifier.
            auth_result: Authentication result from provider.

        Returns:
            User instance.
        """
        # First, try to find existing user by provider mapping (most reliable)
        stmt = (
            select(User)
            .join(UserAuthProvider)
            .where(
                UserAuthProvider.provider_id == provider_id,
                UserAuthProvider.provider_user_id == auth_result["provider_user_id"],
            )
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()

        if user:
            # Update user info from provider if needed
            if auth_result.get("name") and not user.name:
                user.name = auth_result["name"]
            if auth_result.get("username") and not user.username:
                user.username = auth_result.get("username")
            if auth_result.get("phone") and not user.phone:
                user.phone = auth_result.get("phone")
            if auth_result.get("avatar_url") and not user.avatar_url:
                user.avatar_url = auth_result["avatar_url"]
            # Update email if provided and not set
            if auth_result.get("email") and not user.email:
                user.email = auth_result["email"]
            # Mark as verified if provider verified the email
            if auth_result["metadata"].get("email_verified"):
                user.is_verified = True
            return user

        # If email is provided, try to find existing user by email
        if auth_result.get("email"):
            stmt = select(User).where(User.email == auth_result["email"])
            result = await self.session.execute(stmt)
            user = result.scalar_one_or_none()

            if user:
                # Link this OAuth provider to existing user
                # The provider mapping will be created in _update_auth_provider
                # Update user info from provider if needed
                if auth_result.get("name") and not user.name:
                    user.name = auth_result["name"]
                if auth_result.get("username") and not user.username:
                    user.username = auth_result.get("username")
                if auth_result.get("phone") and not user.phone:
                    user.phone = auth_result.get("phone")
                if auth_result.get("avatar_url") and not user.avatar_url:
                    user.avatar_url = auth_result["avatar_url"]
                # Mark as verified if provider verified the email
                if auth_result["metadata"].get("email_verified"):
                    user.is_verified = True
                return user

        # Create new user from OAuth data
        user = User(
            email=auth_result.get("email"),  # Can be None for providers without email
            name=auth_result.get("name"),
            username=auth_result.get("username"),
            phone=auth_result.get("phone"),
            avatar_url=auth_result.get("avatar_url"),
            password_hash=None,  # OAuth users don't need passwords
            primary_auth_provider=provider_id,
            provider_user_id=auth_result["provider_user_id"],
            is_active=True,
            is_verified=auth_result["metadata"].get("email_verified", False),
        )

        self.session.add(user)
        await self.session.flush()  # Flush to get user.id without committing

        return user

    async def _update_auth_provider(
        self, user_id: str, provider_id: str, auth_result: AuthResult
    ) -> None:
        """
        Update or create user auth provider mapping.

        Args:
            user_id: User ID.
            provider_id: Provider identifier.
            auth_result: Authentication result from provider.
        """
        # Check if mapping exists
        stmt = select(UserAuthProvider).where(
            UserAuthProvider.user_id == user_id, UserAuthProvider.provider_id == provider_id
        )
        result = await self.session.execute(stmt)
        auth_provider = result.scalar_one_or_none()

        if auth_provider:
            # Update existing mapping
            auth_provider.provider_user_id = auth_result["provider_user_id"]
            auth_provider.provider_metadata = auth_result["metadata"]
            auth_provider.last_used_at = datetime.now(UTC)
        else:
            # Create new mapping
            auth_provider = UserAuthProvider(
                user_id=user_id,
                provider_id=provider_id,
                provider_user_id=auth_result["provider_user_id"],
                provider_metadata=auth_result["metadata"],
                last_used_at=datetime.now(UTC),
            )
            self.session.add(auth_provider)

"""
OpenID Connect (OIDC) authentication provider.

This module implements OIDC authentication for OAuth providers like Google, Microsoft, etc.
"""

from typing import Any
from urllib.parse import urlencode

import httpx
from jose import jwt

from glean_core import get_logger

from .base import AuthProvider, AuthResult

logger = get_logger(__name__)


class OIDCProvider(AuthProvider):
    """
    Base OpenID Connect provider.

    Supports any OIDC-compliant identity provider (Google, Microsoft, Auth0, Keycloak, etc.).
    """

    def __init__(self, provider_id: str, config: dict[str, Any]) -> None:
        """
        Initialize OIDC provider.

        Args:
            provider_id: Provider identifier (e.g., 'oidc', 'google').
            config: Configuration dictionary with:
                - client_id: OAuth client ID
                - client_secret: OAuth client secret
                - issuer: OIDC issuer URL
                - scopes: List of OAuth scopes (default: ['openid', 'email', 'profile'])
                - discovery_url: OIDC discovery URL (optional, defaults to {issuer}/.well-known/openid-configuration)
                - redirect_uri: OAuth callback URL
        """
        super().__init__(provider_id, config)
        self.client_id = config["client_id"]
        self.client_secret = config["client_secret"]
        self.issuer = config["issuer"]
        self.scopes = config.get("scopes", ["openid", "email", "profile"])
        self.discovery_url = config.get(
            "discovery_url", f"{self.issuer}/.well-known/openid-configuration"
        )
        self._oidc_config: dict[str, Any] | None = None

    async def authenticate(self, credentials: dict[str, Any]) -> AuthResult:
        """
        Exchange authorization code for tokens and user info.

        Args:
            credentials: Dictionary containing:
                - code: Authorization code from OIDC provider
                - redirect_uri: OAuth callback URL (must match registration)

        Returns:
            AuthResult with user information from ID token.

        Raises:
            ValueError: If code exchange or token verification fails.
        """
        code = credentials.get("code")
        redirect_uri = credentials.get("redirect_uri")

        if not code or not redirect_uri:
            raise ValueError("Authorization code and redirect_uri are required")

        # Get OIDC configuration
        oidc_config = await self._get_oidc_config()

        # Exchange authorization code for tokens
        async with httpx.AsyncClient() as client:
            response = await client.post(
                oidc_config["token_endpoint"],
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                },
            )

            if response.status_code != 200:
                raise ValueError(f"Token exchange failed: {response.text}")

            tokens = response.json()

        # Verify ID token and extract user info
        user_info = await self._verify_id_token(tokens["id_token"], oidc_config)

        logger.info("[OIDC] received user info from IdP", extra={"user_info": user_info})

        return {
            "user_info": user_info,
            "provider_user_id": user_info["sub"],
            "email": user_info.get("email") or None,  # Normalize empty string to None
            "name": user_info.get("name") or None,
            # Try both 'username' (some IdPs) and 'preferred_username' (standard OIDC)
            "username": user_info.get("username") or user_info.get("preferred_username") or None,
            "phone": user_info.get("phone_number") or None,  # OIDC phone number field
            "avatar_url": user_info.get("picture") or None,
            "metadata": {
                "tokens": tokens,
                "email_verified": user_info.get("email_verified", False),
            },
        }

    async def validate_config(self) -> bool:
        """
        Validate OIDC configuration.

        Returns:
            True if configuration is valid.

        Raises:
            ValueError: If configuration is invalid.
        """
        if not self.client_id or not self.client_secret:
            raise ValueError("client_id and client_secret are required")

        if not self.issuer:
            raise ValueError("issuer is required")

        # Try to fetch OIDC discovery configuration
        await self._get_oidc_config()
        return True

    def get_authorization_url(self, state: str, redirect_uri: str) -> str | None:
        """
        Generate OIDC authorization URL.

        Caller must ensure _get_oidc_config() was called first to populate _oidc_config.

        Args:
            state: CSRF protection state parameter.
            redirect_uri: OAuth callback URL.

        Returns:
            Authorization URL to redirect user to.

        Raises:
            ValueError: If OIDC config not loaded.
        """
        from secrets import token_urlsafe
        from time import time_ns

        if not self._oidc_config:
            raise ValueError("OIDC config not loaded - call _get_oidc_config() first")

        scope = " ".join(self.scopes)
        auth_endpoint = self._oidc_config["authorization_endpoint"]

        # Build URL with query parameters
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope,
            "state": state,
            # Add nonce and timestamp to prevent caching
            "nonce": token_urlsafe(16),
            # Add timestamp as cache-buster (in nanoseconds to ensure uniqueness)
            "_t": str(time_ns()),
        }

        return f"{auth_endpoint}?{urlencode(params)}"

    async def _get_oidc_config(self) -> dict[str, Any]:
        """
        Fetch OIDC discovery configuration.

        Returns:
            OIDC configuration dictionary.

        Raises:
            ValueError: If discovery endpoint fails.
        """
        if self._oidc_config is not None:
            return self._oidc_config

        async with httpx.AsyncClient() as client:
            response = await client.get(self.discovery_url)

            if response.status_code != 200:
                raise ValueError(f"Failed to fetch OIDC config: {response.text}")

            config: dict[str, Any] = response.json()
            self._oidc_config = config
            return config

    async def _verify_id_token(self, id_token: str, _oidc_config: dict[str, Any]) -> dict[str, Any]:
        """
        Verify and decode ID token.

        Args:
            id_token: JWT ID token from OIDC provider.
            _oidc_config: OIDC configuration dictionary (unused in simplified implementation).

        Returns:
            Decoded token claims.

        Raises:
            ValueError: If token verification fails.

        Note:
            This is a simplified implementation that decodes without signature verification.
            Production deployments should implement proper JWKS verification.
        """
        try:
            # Decode without verification (simplified for now)
            # TODO: Implement proper JWKS verification in production
            claims = jwt.get_unverified_claims(id_token)

            # Basic validation
            if claims.get("iss") != self.issuer:
                raise ValueError("Invalid issuer")

            if claims.get("aud") != self.client_id:
                raise ValueError("Invalid audience")

            # TODO: Verify expiration, signature, etc.

            return claims
        except Exception as e:
            raise ValueError(f"ID token verification failed: {e}") from e

"""
OpenID Connect (OIDC) authentication provider.

This module implements OIDC authentication for OAuth providers like Google, Microsoft, etc.
"""

from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx
from jose import jwk, jwt
from jose.constants import ALGORITHMS
from jose.exceptions import ExpiredSignatureError, JWTClaimsError, JWTError

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
        self._jwks: dict[str, Any] | None = None  # JWKS cache

    async def authenticate(self, credentials: dict[str, Any]) -> AuthResult:
        """
        Exchange authorization code for tokens and user info.

        Args:
            credentials: Dictionary containing:
                - code: Authorization code from OIDC provider
                - redirect_uri: OAuth callback URL (must match registration)
                - nonce: Nonce value from authorization request (for replay protection)

        Returns:
            AuthResult with user information from ID token.

        Raises:
            ValueError: If code exchange or token verification fails.
        """
        code = credentials.get("code")
        redirect_uri = credentials.get("redirect_uri")
        nonce = credentials.get("nonce")

        if not code or not redirect_uri:
            raise ValueError("Authorization code and redirect_uri are required")

        if not nonce:
            raise ValueError("Nonce is required for token verification")

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
        user_info = await self._verify_id_token(
            tokens["id_token"],
            oidc_config,
            nonce,
            tokens.get("access_token"),
        )

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

    def get_authorization_url(
        self, state: str, redirect_uri: str, nonce: str | None = None
    ) -> str | None:
        """
        Generate OIDC authorization URL.

        Caller must ensure _get_oidc_config() was called first to populate _oidc_config.

        Args:
            state: CSRF protection state parameter.
            redirect_uri: OAuth callback URL.
            nonce: Nonce value for replay attack prevention.

        Returns:
            Authorization URL to redirect user to.

        Raises:
            ValueError: If OIDC config not loaded.
        """
        from time import time_ns

        if not self._oidc_config:
            raise ValueError("OIDC config not loaded - call _get_oidc_config() first")

        if not nonce:
            raise ValueError("Nonce is required for OIDC authorization")

        scope = " ".join(self.scopes)
        auth_endpoint = self._oidc_config["authorization_endpoint"]

        # Build URL with query parameters
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": scope,
            "state": state,
            "nonce": nonce,  # Nonce for replay attack prevention
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

    async def _verify_id_token(
        self,
        id_token: str,
        oidc_config: dict[str, Any],
        nonce: str,
        access_token: str | None = None,
    ) -> dict[str, Any]:
        """
        Verify and decode ID token with proper signature verification.

        This implementation follows OpenID Connect Core 1.0 specification:
        - Verifies JWT signature using JWKS from provider
        - Validates issuer, audience, expiration, not-before time
        - Validates nonce to prevent replay attacks

        Args:
            id_token: JWT ID token from OIDC provider.
            oidc_config: OIDC configuration dictionary with jwks_uri.
            nonce: Expected nonce value from authorization request.
            access_token: OAuth access token used for at_hash validation when present.

        Returns:
            Decoded token claims.

        Raises:
            ValueError: If token verification fails.

        References:
            OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation
        """
        try:
            # Step 1: Decode header to get key ID (kid)
            unverified_header = jwt.get_unverified_header(id_token)
            kid = unverified_header.get("kid")

            if not kid:
                raise ValueError("ID token missing 'kid' in header")

            # Step 2: Fetch JWKS (JSON Web Key Set) from provider
            jwks = await self._get_jwks(oidc_config)

            # Step 3: Find matching key in JWKS
            signing_key = None
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    signing_key = key
                    break

            if not signing_key:
                raise ValueError(f"No matching key found for kid: {kid}")

            # Step 4: Construct RSA public key from JWK
            public_key = jwk.construct(signing_key)

            # Step 5: Verify signature and decode claims
            # This performs cryptographic signature verification
            claims = jwt.decode(
                id_token,
                public_key,
                algorithms=[signing_key.get("alg", ALGORITHMS.RS256)],
                audience=self.client_id,
                issuer=self.issuer,
                access_token=access_token,
                options={
                    "verify_signature": True,
                    "verify_aud": True,
                    "verify_iat": True,
                    "verify_exp": True,
                    "verify_nbf": True,
                    "verify_iss": True,
                    "require_exp": True,
                    "require_iat": True,
                },
            )

            # Step 6: Additional OIDC-specific validations

            # Validate nonce (prevents replay attacks)
            token_nonce = claims.get("nonce")
            if token_nonce != nonce:
                raise ValueError("Nonce mismatch - possible replay attack")

            # Validate issued-at time (iat) is not in the future
            iat = claims.get("iat")
            if iat:
                iat_time = datetime.fromtimestamp(iat, UTC)
                now = datetime.now(UTC)
                # Allow 60 seconds clock skew
                if iat_time.timestamp() > now.timestamp() + 60:
                    raise ValueError("Token issued in the future")

            # Validate not-before time (nbf) if present
            nbf = claims.get("nbf")
            if nbf:
                nbf_time = datetime.fromtimestamp(nbf, UTC)
                now = datetime.now(UTC)
                # Allow 60 seconds clock skew
                if now.timestamp() < nbf_time.timestamp() - 60:
                    raise ValueError("Token not yet valid (nbf)")

            # Validate expiration is checked (already done by jwt.decode, but log it)
            exp = claims.get("exp")
            if exp:
                exp_time = datetime.fromtimestamp(exp, UTC)
                logger.debug(
                    "[OIDC] Token expiration validated",
                    extra={"expires_at": exp_time.isoformat()},
                )

            logger.info(
                "[OIDC] ID token verified successfully",
                extra={
                    "sub": claims.get("sub"),
                    "iss": claims.get("iss"),
                    "aud": claims.get("aud"),
                },
            )

            return claims

        except ExpiredSignatureError as e:
            raise ValueError("ID token has expired") from e
        except JWTClaimsError as e:
            raise ValueError(f"ID token claims validation failed: {e}") from e
        except JWTError as e:
            raise ValueError(f"ID token verification failed: {e}") from e
        except Exception as e:
            raise ValueError(f"ID token verification failed: {e}") from e

    async def _get_jwks(self, oidc_config: dict[str, Any]) -> dict[str, Any]:
        """
        Fetch JSON Web Key Set (JWKS) from provider.

        JWKS contains public keys used to verify JWT signatures.

        Args:
            oidc_config: OIDC configuration dictionary with jwks_uri.

        Returns:
            JWKS dictionary with keys.

        Raises:
            ValueError: If JWKS fetch fails.
        """
        if self._jwks is not None:
            return self._jwks

        jwks_uri = oidc_config.get("jwks_uri")
        if not jwks_uri:
            raise ValueError("OIDC config missing 'jwks_uri'")

        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_uri)

            if response.status_code != 200:
                raise ValueError(f"Failed to fetch JWKS: {response.text}")

            jwks: dict[str, Any] = response.json()
            self._jwks = jwks

            logger.debug(
                "[OIDC] JWKS fetched successfully",
                extra={"num_keys": len(jwks.get("keys", []))},
            )

            return jwks

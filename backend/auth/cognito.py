"""
AWS Cognito JWT validation and user context for FastAPI.

Features:
- JWT token validation using Cognito JWKS
- JWKS caching for performance
- AUTH_DISABLED mode for local development
- Role-based access control
"""

import os
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)
from typing import Optional, List, Callable
from functools import lru_cache
import httpx
from jose import jwt, JWTError
from jose.exceptions import ExpiredSignatureError
from pydantic import BaseModel
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from cachetools import TTLCache

# Environment variables
COGNITO_REGION = os.getenv("COGNITO_REGION", "ap-southeast-2")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")
AUTH_DISABLED = os.getenv("AUTH_DISABLED", "false").lower() == "true"

# Security scheme
security = HTTPBearer(auto_error=False)

# JWKS cache (1 hour TTL)
jwks_cache: TTLCache = TTLCache(maxsize=1, ttl=3600)


class CognitoUser(BaseModel):
    """User information extracted from Cognito JWT."""
    sub: str  # Cognito user ID
    email: str
    name: Optional[str] = None
    role: str = "viewer"  # Default role if not set
    email_verified: bool = False

    @property
    def display_name(self) -> str:
        """Return name or email for display."""
        return self.name or self.email.split("@")[0]


# Mock admin user for AUTH_DISABLED mode
MOCK_ADMIN_USER = CognitoUser(
    sub="mock-admin-user",
    email="admin@localhost",
    name="Local Admin",
    role="admin",
    email_verified=True,
)


class CognitoTokenVerifier:
    """
    Verifies Cognito JWT tokens using JWKS.

    Features:
    - Caches JWKS for performance
    - Validates token signature, expiry, audience, and issuer
    - Extracts user attributes from claims
    """

    def __init__(self):
        self.region = COGNITO_REGION
        self.user_pool_id = COGNITO_USER_POOL_ID
        self.client_id = COGNITO_CLIENT_ID
        self.issuer = f"https://cognito-idp.{self.region}.amazonaws.com/{self.user_pool_id}"
        self.jwks_url = f"{self.issuer}/.well-known/jwks.json"

    def _get_jwks(self) -> dict:
        """Fetch and cache JWKS from Cognito."""
        if "jwks" in jwks_cache:
            return jwks_cache["jwks"]

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(self.jwks_url)
                response.raise_for_status()
                jwks = response.json()
                jwks_cache["jwks"] = jwks
                return jwks
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to fetch JWKS: {str(e)}"
            )

    def _get_signing_key(self, token: str) -> dict:
        """Get the signing key for the token from JWKS."""
        try:
            headers = jwt.get_unverified_headers(token)
            kid = headers.get("kid")
            if not kid:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token missing key ID (kid)"
                )

            jwks = self._get_jwks()
            for key in jwks.get("keys", []):
                if key.get("kid") == kid:
                    return key

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find matching key"
            )
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token format: {str(e)}"
            )

    def verify_token(self, token: str) -> CognitoUser:
        """
        Verify a Cognito JWT and extract user information.

        Args:
            token: JWT access token or ID token

        Returns:
            CognitoUser with extracted claims

        Raises:
            HTTPException: If token is invalid or expired
        """
        try:
            # Get signing key
            signing_key = self._get_signing_key(token)

            # First decode without verification to check token type
            unverified_claims = jwt.get_unverified_claims(token)
            token_use = unverified_claims.get("token_use", "")

            # For ID tokens, audience is client_id; for access tokens, check client_id claim
            # ID tokens have "token_use": "id", access tokens have "token_use": "access"
            if token_use == "id":
                # ID token - verify audience is client_id
                claims = jwt.decode(
                    token,
                    signing_key,
                    algorithms=["RS256"],
                    audience=self.client_id,
                    issuer=self.issuer,
                    options={
                        "verify_aud": True,
                        "verify_iss": True,
                        "verify_exp": True,
                    }
                )
            else:
                # Access token - no audience claim, verify client_id separately
                claims = jwt.decode(
                    token,
                    signing_key,
                    algorithms=["RS256"],
                    issuer=self.issuer,
                    options={
                        "verify_aud": False,  # Access tokens don't have aud
                        "verify_iss": True,
                        "verify_exp": True,
                    }
                )
                # Verify client_id for access tokens
                if claims.get("client_id") != self.client_id:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid token client_id"
                    )

            # Debug: log token claims to see what's available
            logger.info(f"[Auth] Token claims: sub={claims.get('sub')}, email={claims.get('email')}, "
                        f"name={claims.get('name')}, username={claims.get('username')}, "
                        f"cognito:username={claims.get('cognito:username')}, token_use={token_use}")

            # Extract user info from claims
            # Cognito uses 'cognito:username' for the username in ID tokens
            email = claims.get("email") or claims.get("cognito:username") or claims.get("username", "")

            return CognitoUser(
                sub=claims.get("sub", ""),
                email=email,
                name=claims.get("name"),
                role=claims.get("custom:role", "viewer"),
                email_verified=claims.get("email_verified", False),
            )

        except ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired",
                headers={"WWW-Authenticate": "Bearer"},
            )
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}",
                headers={"WWW-Authenticate": "Bearer"},
            )


# Singleton verifier instance
@lru_cache()
def get_token_verifier() -> CognitoTokenVerifier:
    """Get cached token verifier instance."""
    return CognitoTokenVerifier()


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CognitoUser:
    """
    FastAPI dependency to get the current authenticated user.

    In AUTH_DISABLED mode, returns a mock admin user.
    Otherwise, validates the JWT and returns user info.

    Usage:
        @router.get("/protected")
        async def protected_route(user: CognitoUser = Depends(get_current_user)):
            return {"user": user.email}
    """
    logger.info(f"[Auth] get_current_user called, AUTH_DISABLED={AUTH_DISABLED}, has_credentials={credentials is not None}")

    # Development mode - return mock admin
    if AUTH_DISABLED:
        logger.info("[Auth] AUTH_DISABLED mode, returning mock admin")
        return MOCK_ADMIN_USER

    # Validate Cognito configuration
    if not COGNITO_USER_POOL_ID or not COGNITO_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication not configured. Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID."
        )

    # Check for credentials
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token
    verifier = get_token_verifier()
    return verifier.verify_token(credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[CognitoUser]:
    """
    FastAPI dependency to optionally get the current user.

    Returns None if no valid token is provided (instead of raising an error).
    Useful for endpoints that work with or without authentication.

    In AUTH_DISABLED mode, always returns the mock admin user.
    """
    if AUTH_DISABLED:
        return MOCK_ADMIN_USER

    if not credentials:
        return None

    if not COGNITO_USER_POOL_ID or not COGNITO_CLIENT_ID:
        return None

    try:
        verifier = get_token_verifier()
        return verifier.verify_token(credentials.credentials)
    except HTTPException:
        return None


def require_role(allowed_roles: List[str]) -> Callable:
    """
    Factory for creating role-based access dependencies.

    Usage:
        @router.delete("/admin-only")
        async def admin_route(
            user: CognitoUser = Depends(require_role(["admin"]))
        ):
            return {"message": "Admin action performed"}
    """
    async def role_checker(
        user: CognitoUser = Depends(get_current_user),
    ) -> CognitoUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(allowed_roles)}"
            )
        return user

    return role_checker

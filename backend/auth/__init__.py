"""
AWS Cognito authentication module for CompliCheckAI Studio.

This module provides JWT validation and user context for FastAPI endpoints.
"""

from .cognito import (
    CognitoUser,
    CognitoTokenVerifier,
    get_current_user,
    get_optional_user,
    require_role,
    AUTH_DISABLED,
)

__all__ = [
    "CognitoUser",
    "CognitoTokenVerifier",
    "get_current_user",
    "get_optional_user",
    "require_role",
    "AUTH_DISABLED",
]

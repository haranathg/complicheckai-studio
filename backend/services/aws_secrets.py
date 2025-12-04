"""
AWS Secrets Manager utility for retrieving API keys and secrets.
Falls back to environment variables if secrets are not found or if running locally.
"""

import os
import json
import boto3
from botocore.exceptions import ClientError
from functools import lru_cache


# Secret names in AWS Secrets Manager
SECRET_NAMES = {
    "VISION_AGENT_API_KEY": "LandingAI-API-Key",
    "ANTHROPIC_API_KEY": "Anthropic-API-Key",
    "GOOGLE_GEMINI_API_KEY": "Google-Gemini-API-Key",
}


@lru_cache(maxsize=10)
def get_secret(secret_name: str, region_name: str = None) -> str | None:
    """
    Retrieve a secret from AWS Secrets Manager.
    Uses LRU cache to avoid repeated API calls for the same secret.

    Args:
        secret_name: The name/ID of the secret in Secrets Manager
        region_name: AWS region (defaults to AWS_REGION env var or ap-southeast-2)

    Returns:
        The secret value as a string, or None if not found
    """
    if not region_name:
        region_name = os.getenv("AWS_REGION", "ap-southeast-2")

    try:
        session = boto3.session.Session()
        client = session.client(
            service_name='secretsmanager',
            region_name=region_name
        )

        response = client.get_secret_value(SecretId=secret_name)
        secret_string = response['SecretString']

        # Try to parse as JSON (secrets might be stored as key-value pairs)
        try:
            secret_dict = json.loads(secret_string)
            # If it's a dict, try common key names
            for key in ['api_key', 'apiKey', 'key', 'value', 'secret']:
                if key in secret_dict:
                    return secret_dict[key]
            # If none of those, return first value
            if secret_dict:
                return list(secret_dict.values())[0]
        except json.JSONDecodeError:
            # Not JSON, return as plain string
            pass

        return secret_string

    except ClientError as e:
        error_code = e.response.get('Error', {}).get('Code', '')
        if error_code in ['ResourceNotFoundException', 'AccessDeniedException']:
            print(f"[Secrets] Secret '{secret_name}' not found or access denied: {error_code}")
        else:
            print(f"[Secrets] Error retrieving secret '{secret_name}': {e}")
        return None
    except Exception as e:
        print(f"[Secrets] Unexpected error retrieving secret '{secret_name}': {e}")
        return None


def get_api_key(key_name: str) -> str | None:
    """
    Get an API key, trying AWS Secrets Manager first, then falling back to env vars.

    Args:
        key_name: The environment variable name (e.g., 'VISION_AGENT_API_KEY')

    Returns:
        The API key value, or None if not found
    """
    # First, check if we have an environment variable (for local dev or direct config)
    env_value = os.getenv(key_name)
    if env_value:
        return env_value

    # Try AWS Secrets Manager
    secret_name = SECRET_NAMES.get(key_name)
    if secret_name:
        secret_value = get_secret(secret_name)
        if secret_value:
            return secret_value

    # Not found anywhere
    print(f"[Secrets] API key '{key_name}' not found in env vars or Secrets Manager")
    return None


def clear_cache():
    """Clear the secrets cache (useful for testing or refreshing secrets)."""
    get_secret.cache_clear()

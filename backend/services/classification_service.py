"""Classification service for auto-classifying documents using AI."""
import json
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from models.database_models import Document, ParseResult, ProjectSettings
from services.config_service import load_default_checks_config


def get_bedrock_client():
    """Get boto3 Bedrock runtime client."""
    import boto3
    import os

    # Use configured profile if available
    profile = os.getenv("AWS_PROFILE")
    region = os.getenv("AWS_REGION", "us-west-2")

    if profile:
        session = boto3.Session(profile_name=profile)
        return session.client('bedrock-runtime', region_name=region)
    else:
        return boto3.client('bedrock-runtime', region_name=region)


def resolve_model_id(model_name: str) -> str:
    """Resolve model name to Bedrock model ID."""
    model_map = {
        "bedrock-claude-sonnet-3.5": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "bedrock-claude-haiku-3.5": "anthropic.claude-3-5-haiku-20241022-v1:0",
        "bedrock-claude-opus-4": "anthropic.claude-opus-4-20250514-v1:0",
    }
    return model_map.get(model_name, model_name)


async def classify_document_content(
    markdown_content: str,
    checks_config: Optional[Dict[str, Any]] = None,
    model: str = "bedrock-claude-sonnet-3.5"
) -> Dict[str, Any]:
    """
    Classify document content using AI.

    Args:
        markdown_content: The parsed document content
        checks_config: Optional custom checks config (defaults to standard config)
        model: Model to use for classification

    Returns:
        Dict with document_type, confidence, and signals_found
    """
    if not checks_config:
        checks_config = load_default_checks_config()

    # Build classification prompt
    doc_types_desc = "\n".join([
        f"- {dt_id}: {dt.get('name')} - {dt.get('description')}"
        for dt_id, dt in checks_config.get("document_types", {}).items()
    ])

    prompt = f"""Classify this document into one of these types:

{doc_types_desc}

Document content (first 5000 chars):
{markdown_content[:5000] if markdown_content else "No content"}

Respond with JSON only:
{{
    "document_type": "type_id",
    "confidence": 0-100,
    "signals_found": ["list", "of", "signals"]
}}"""

    # Call AI using Bedrock
    client = get_bedrock_client()
    model_id = resolve_model_id(model)

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body)
        )

        response_body = json.loads(response["body"].read())
        response_text = response_body["content"][0]["text"]

        # Parse response
        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            result = json.loads(response_text.strip())
        except:
            result = {"document_type": "unknown", "confidence": 0, "signals_found": []}

        return result

    except Exception as e:
        print(f"Classification failed: {e}")
        return {"document_type": "unknown", "confidence": 0, "signals_found": [], "error": str(e)}


async def classify_document(
    document: Document,
    parse_result: ParseResult,
    db: Session,
    model: Optional[str] = None,
    checks_config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Classify a document and update its classification fields.

    Args:
        document: The document to classify
        parse_result: The parse result with markdown content
        db: Database session
        model: Optional model override
        checks_config: Optional custom checks config

    Returns:
        Dict with classification result
    """
    # Get project settings for model if not provided
    if not model:
        settings = db.query(ProjectSettings).filter(
            ProjectSettings.project_id == document.project_id
        ).first()
        model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
        if not checks_config and settings and settings.checks_config:
            checks_config = settings.checks_config

    # Classify the content
    result = await classify_document_content(
        markdown_content=parse_result.markdown or "",
        checks_config=checks_config,
        model=model
    )

    # Update document
    document.document_type = result.get("document_type", "unknown")
    document.classification_confidence = result.get("confidence", 0)
    document.classification_signals = result.get("signals_found", [])
    document.classification_model = model
    document.classification_override = False

    db.commit()

    return result

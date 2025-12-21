"""Configuration service for loading and managing compliance checks configuration."""
import json
import os
from functools import lru_cache
from typing import Dict, Any, Optional, List

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'compliance_checks_v2.json')


@lru_cache()
def load_default_checks_config() -> Dict[str, Any]:
    """Load the default checks configuration."""
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)


def get_document_type_config(doc_type: str, custom_config: Optional[Dict] = None) -> Dict[str, Any]:
    """Get checks config for a specific document type."""
    config = custom_config or load_default_checks_config()
    return config.get("document_types", {}).get(doc_type, {})


def get_work_type_config(work_type: str) -> Dict[str, Any]:
    """Get work type template configuration."""
    config = load_default_checks_config()
    return config.get("work_types", {}).get(work_type, {})


def list_document_types() -> List[Dict[str, Any]]:
    """List all available document types."""
    config = load_default_checks_config()
    return [
        {
            "id": dt_id,
            "name": dt.get("name"),
            "description": dt.get("description"),
            "upload_slot": dt.get("upload_slot")
        }
        for dt_id, dt in config.get("document_types", {}).items()
    ]


def list_work_types() -> List[Dict[str, Any]]:
    """List all available work type templates."""
    config = load_default_checks_config()
    return [
        {
            "id": wt_id,
            "name": wt.get("name"),
            "description": wt.get("description"),
            "required_documents": wt.get("required_documents", []),
            "optional_documents": wt.get("optional_documents", []),
            "default_settings": wt.get("default_settings", {})
        }
        for wt_id, wt in config.get("work_types", {}).items()
    ]


def get_upload_slots() -> List[Dict[str, Any]]:
    """Get upload slot definitions."""
    config = load_default_checks_config()
    return config.get("upload_slots", {}).get("slots", [])


def get_checks_for_document_type(doc_type: str, custom_config: Optional[Dict] = None) -> Dict[str, List]:
    """Get completeness and compliance checks for a document type."""
    doc_config = get_document_type_config(doc_type, custom_config)
    return {
        "completeness_checks": doc_config.get("completeness_checks", []),
        "compliance_checks": doc_config.get("compliance_checks", [])
    }


def get_classification_signals(doc_type: str) -> Dict[str, Any]:
    """Get classification signals for a document type."""
    doc_config = get_document_type_config(doc_type)
    return doc_config.get("classification_signals", {})

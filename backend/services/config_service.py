"""Configuration service for loading and managing compliance checks configuration."""
import json
import os
from functools import lru_cache
from typing import Dict, Any, Optional, List

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'compliance_checks_v2.json')
CONFIG_PATH_V3 = os.path.join(os.path.dirname(__file__), '..', 'config', 'compliance_checks_v3.json')


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


# ============ V3 CONFIG FUNCTIONS (Page-level) ============

@lru_cache()
def load_checks_config_v3() -> Dict[str, Any]:
    """Load the v3 checks configuration with page-level types."""
    with open(CONFIG_PATH_V3, 'r') as f:
        return json.load(f)


def get_page_types() -> Dict[str, Any]:
    """Get all page type definitions from v3 config."""
    config = load_checks_config_v3()
    return config.get("page_types", {})


def list_page_types() -> List[Dict[str, Any]]:
    """List all available page types."""
    page_types = get_page_types()
    return [
        {
            "id": pt_id,
            "name": pt.get("name"),
            "description": pt.get("description"),
            "classification_signals": pt.get("classification_signals", [])
        }
        for pt_id, pt in page_types.items()
    ]


def get_checks_v3() -> List[Dict[str, Any]]:
    """Get all checks from v3 config."""
    config = load_checks_config_v3()
    return config.get("checks", [])


def get_checks_for_page_type(page_type: str) -> List[Dict[str, Any]]:
    """Get checks that apply to a specific page type."""
    checks = get_checks_v3()
    return [
        check for check in checks
        if page_type in check.get("applies_to", [])
    ]


def get_checks_by_execution_mode(mode: str) -> List[Dict[str, Any]]:
    """Get checks filtered by execution mode ('per_page' or 'batched')."""
    checks = get_checks_v3()
    return [
        check for check in checks
        if check.get("execution_mode") == mode
    ]


def get_checks_for_page_type_by_category(page_type: str) -> Dict[str, List[Dict[str, Any]]]:
    """Get checks for a page type, grouped by category (completeness/compliance)."""
    checks = get_checks_for_page_type(page_type)
    return {
        "completeness": [c for c in checks if c.get("category") == "completeness"],
        "compliance": [c for c in checks if c.get("category") == "compliance"]
    }

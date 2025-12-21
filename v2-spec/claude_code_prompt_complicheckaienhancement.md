# Claude Code Prompt: CompliCheckAI Document Classification & Checks Enhancement

## Overview

Enhance CompliCheckAI to support document-type-based compliance checks with project templates, batch processing, check history, and PDF report export.

**Reference Files:**
- `compliance_checks_v2.json` - New checks config organized by document type
- `complicheckai_impl_spec_v3.md` - Detailed implementation spec
- `complicheckai_architecture.md` - Architecture diagrams

## Implementation Phases

Complete each phase fully before moving to the next. Test each phase works before proceeding.

---

## PHASE 1: Database Schema Updates

### 1.1 Update `backend/models/database_models.py`

Add these new models and update existing ones:

```python
# Add to imports
from sqlalchemy import Boolean

# NEW: Project Settings Model
class ProjectSettings(Base):
    """Project-level settings including work type template and model preferences."""
    __tablename__ = "project_settings"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Work type template
    work_type = Column(String(50), default="custom")
    
    # Model settings
    vision_parser = Column(String(50), default="landing_ai")
    vision_model = Column(String(100), nullable=True)
    chat_model = Column(String(100), default="bedrock-claude-sonnet-3.5")
    compliance_model = Column(String(100), default="bedrock-claude-sonnet-3.5")
    
    # Checks configuration (user customizations)
    checks_config = Column(JSON, nullable=True)
    
    # Usage tracking
    total_parse_credits = Column(Integer, default=0)
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="settings")


# NEW: Check Result Model (replaces/enhances ComplianceResult)
class CheckResult(Base):
    """Individual check result for a document (supports history)."""
    __tablename__ = "check_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    parse_result_id = Column(String(36), ForeignKey("parse_results.id", ondelete="SET NULL"), nullable=True)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Run context
    batch_run_id = Column(String(36), ForeignKey("batch_check_runs.id", ondelete="SET NULL"), nullable=True)
    run_number = Column(Integer, default=1)
    
    # Classification
    document_type = Column(String(50), nullable=True)
    
    # Results
    completeness_results = Column(JSON, nullable=True)
    compliance_results = Column(JSON, nullable=True)
    summary = Column(JSON, nullable=True)
    
    # Config snapshot
    checks_config_snapshot = Column(JSON, nullable=True)
    
    # Usage
    model = Column(String(100), nullable=True)
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    
    # Status
    status = Column(String(20), default="completed")
    error_message = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    processing_time_ms = Column(Integer, nullable=True)

    document = relationship("Document", back_populates="check_results")
    batch_run = relationship("BatchCheckRun", back_populates="results")

    __table_args__ = (
        Index("ix_check_results_document_id", "document_id"),
        Index("ix_check_results_project_id", "project_id"),
        Index("ix_check_results_batch_run_id", "batch_run_id"),
        Index("ix_check_results_created_at", "created_at"),
    )


# NEW: Batch Check Run Model
class BatchCheckRun(Base):
    """Batch check run across multiple documents in a project."""
    __tablename__ = "batch_check_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Progress
    status = Column(String(20), default="pending")  # pending, processing, completed, failed, cancelled
    total_documents = Column(Integer, default=0)
    completed_documents = Column(Integer, default=0)
    failed_documents = Column(Integer, default=0)
    skipped_documents = Column(Integer, default=0)
    
    # Configuration
    model = Column(String(100), nullable=True)
    force_rerun = Column(Boolean, default=False)
    
    # Aggregated results
    total_passed = Column(Integer, default=0)
    total_failed = Column(Integer, default=0)
    total_needs_review = Column(Integer, default=0)
    
    # Usage
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    
    # Error
    error_message = Column(Text, nullable=True)
    
    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    results = relationship("CheckResult", back_populates="batch_run")

    __table_args__ = (
        Index("ix_batch_check_runs_project_id", "project_id"),
        Index("ix_batch_check_runs_status", "status"),
    )


# UPDATE: Add to Document model these new columns:
# document_type = Column(String(50), nullable=True)
# classification_confidence = Column(Integer, nullable=True)
# classification_signals = Column(JSON, nullable=True)
# classification_override = Column(Boolean, default=False)
# classification_model = Column(String(100), nullable=True)
# check_results = relationship("CheckResult", back_populates="document", cascade="all, delete-orphan")

# UPDATE: Add to Project model:
# settings = relationship("ProjectSettings", back_populates="project", uselist=False, cascade="all, delete-orphan")
```

### 1.2 Create database migration

After updating models, the tables need to be created. If using Alembic:
```bash
alembic revision --autogenerate -m "Add project settings, check results, batch runs"
alembic upgrade head
```

Or if manually creating tables, add the SQL to create the new tables.

---

## PHASE 2: Configuration Files

### 2.1 Copy `compliance_checks_v2.json` to `backend/config/`

This file contains:
- 12 document types with their specific checks
- 6 work type templates with required/optional documents
- Upload slot mappings

### 2.2 Create config loader utility

Create `backend/services/config_service.py`:

```python
import json
import os
from functools import lru_cache
from typing import Dict, Any, Optional

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

def list_document_types() -> list:
    """List all available document types."""
    config = load_default_checks_config()
    return [
        {"id": dt_id, "name": dt.get("name"), "description": dt.get("description")}
        for dt_id, dt in config.get("document_types", {}).items()
    ]

def list_work_types() -> list:
    """List all available work type templates."""
    config = load_default_checks_config()
    return [
        {
            "id": wt_id,
            "name": wt.get("name"),
            "description": wt.get("description"),
            "required_documents": wt.get("required_documents", []),
            "optional_documents": wt.get("optional_documents", [])
        }
        for wt_id, wt in config.get("work_types", {}).items()
    ]
```

---

## PHASE 3: Backend API - Project Settings

### 3.1 Update `backend/routers/projects.py`

Add these endpoints:

```python
from pydantic import BaseModel
from typing import Optional, List
from services.config_service import load_default_checks_config, list_work_types, get_work_type_config

class ProjectSettingsUpdate(BaseModel):
    work_type: Optional[str] = None
    vision_parser: Optional[str] = None
    vision_model: Optional[str] = None
    chat_model: Optional[str] = None
    compliance_model: Optional[str] = None


@router.get("/templates")
async def get_work_type_templates():
    """List available work type templates."""
    return {"templates": list_work_types()}


@router.get("/{project_id}/settings")
async def get_project_settings(project_id: str, db: Session = Depends(get_db)):
    """Get project settings including work type template info."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    
    work_type = settings.work_type if settings else "custom"
    work_type_info = get_work_type_config(work_type)
    
    return {
        "work_type": work_type,
        "vision_parser": settings.vision_parser if settings else "landing_ai",
        "vision_model": settings.vision_model if settings else None,
        "chat_model": settings.chat_model if settings else "bedrock-claude-sonnet-3.5",
        "compliance_model": settings.compliance_model if settings else "bedrock-claude-sonnet-3.5",
        "checks_config": settings.checks_config if settings else None,
        "usage": {
            "total_parse_credits": settings.total_parse_credits if settings else 0,
            "total_input_tokens": settings.total_input_tokens if settings else 0,
            "total_output_tokens": settings.total_output_tokens if settings else 0
        },
        "required_documents": work_type_info.get("required_documents", []),
        "optional_documents": work_type_info.get("optional_documents", [])
    }


@router.put("/{project_id}/settings")
async def update_project_settings(project_id: str, body: ProjectSettingsUpdate, db: Session = Depends(get_db)):
    """Update project settings."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    if not settings:
        settings = ProjectSettings(project_id=project_id)
        db.add(settings)
    
    # If work type changing, apply template defaults
    if body.work_type and body.work_type != settings.work_type:
        work_type_info = get_work_type_config(body.work_type)
        defaults = work_type_info.get("default_settings", {})
        settings.work_type = body.work_type
        settings.vision_parser = defaults.get("vision_parser", "landing_ai")
        settings.chat_model = defaults.get("chat_model", "bedrock-claude-sonnet-3.5")
        settings.compliance_model = defaults.get("compliance_model", "bedrock-claude-sonnet-3.5")
    
    # Apply explicit overrides
    if body.vision_parser is not None:
        settings.vision_parser = body.vision_parser
    if body.vision_model is not None:
        settings.vision_model = body.vision_model
    if body.chat_model is not None:
        settings.chat_model = body.chat_model
    if body.compliance_model is not None:
        settings.compliance_model = body.compliance_model
    
    db.commit()
    db.refresh(settings)
    return {"status": "updated", "settings": settings}


@router.get("/{project_id}/checks-config")
async def get_project_checks_config(project_id: str, db: Session = Depends(get_db)):
    """Get checks configuration (custom or default)."""
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    if settings and settings.checks_config:
        return settings.checks_config
    return load_default_checks_config()


@router.put("/{project_id}/checks-config")
async def update_project_checks_config(project_id: str, config: dict, db: Session = Depends(get_db)):
    """Update custom checks configuration."""
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    if not settings:
        settings = ProjectSettings(project_id=project_id)
        db.add(settings)
    
    settings.checks_config = config
    db.commit()
    return {"status": "updated"}
```

---

## PHASE 4: Backend API - Document Classification

### 4.1 Update `backend/routers/documents.py`

Add classification endpoints:

```python
from services.config_service import load_default_checks_config, list_document_types

class ClassificationOverride(BaseModel):
    document_type: str


@router.get("/document-types")
async def get_document_types():
    """List available document types for classification."""
    return {"document_types": list_document_types()}


@router.post("/{document_id}/classify")
async def classify_document(document_id: str, db: Session = Depends(get_db)):
    """Auto-classify a document using AI."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(404, "Document not found")
    
    # Get latest parse result
    parse_result = db.query(ParseResult).filter(
        ParseResult.document_id == document_id
    ).order_by(ParseResult.created_at.desc()).first()
    
    if not parse_result:
        raise HTTPException(400, "Document must be parsed first")
    
    # Get project settings
    settings = db.query(ProjectSettings).filter(
        ProjectSettings.project_id == document.project_id
    ).first()
    
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
    checks_config = settings.checks_config if settings else load_default_checks_config()
    
    # Build classification prompt
    doc_types_desc = "\n".join([
        f"- {dt_id}: {dt.get('name')} - {dt.get('description')}"
        for dt_id, dt in checks_config.get("document_types", {}).items()
    ])
    
    prompt = f"""Classify this document into one of these types:

{doc_types_desc}

Document content (first 5000 chars):
{parse_result.markdown[:5000] if parse_result.markdown else "No content"}

Respond with JSON only:
{{
    "document_type": "type_id",
    "confidence": 0-100,
    "signals_found": ["list", "of", "signals"]
}}"""

    # Call AI (use existing Bedrock client pattern from compliance.py)
    client = get_bedrock_client()
    model_id = resolve_model_id(model)
    
    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}]
    }
    
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
        result = json.loads(response_text.strip())
    except:
        result = {"document_type": "unknown", "confidence": 0, "signals_found": []}
    
    # Update document
    document.document_type = result.get("document_type", "unknown")
    document.classification_confidence = result.get("confidence", 0)
    document.classification_signals = result.get("signals_found", [])
    document.classification_model = model
    document.classification_override = False
    
    db.commit()
    
    return {
        "document_type": document.document_type,
        "confidence": document.classification_confidence,
        "signals_found": document.classification_signals
    }


@router.patch("/{document_id}/classification")
async def override_classification(document_id: str, body: ClassificationOverride, db: Session = Depends(get_db)):
    """Manually override document classification."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(404, "Document not found")
    
    document.document_type = body.document_type
    document.classification_override = True
    document.classification_confidence = 100
    
    db.commit()
    
    return {"status": "updated", "document_type": body.document_type}
```

---

## PHASE 5: Backend API - Checks Router

### 5.1 Create `backend/routers/checks.py`

This is a NEW router for running checks and managing results:

```python
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
import json

from database import get_db
from models.database_models import (
    Document, ParseResult, Chunk, Project, ProjectSettings,
    CheckResult, BatchCheckRun
)
from services.config_service import load_default_checks_config, get_document_type_config

router = APIRouter()


class RunChecksRequest(BaseModel):
    force_reclassify: bool = False


class BatchCheckRequest(BaseModel):
    force_rerun: bool = False
    skip_unparsed: bool = True


# ============ SINGLE DOCUMENT CHECKS ============

@router.post("/documents/{document_id}/run")
async def run_document_checks(
    document_id: str,
    body: RunChecksRequest = RunChecksRequest(),
    db: Session = Depends(get_db)
):
    """Run checks on a single document."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(404, "Document not found")
    
    # Get parse result
    parse_result = db.query(ParseResult).filter(
        ParseResult.document_id == document_id
    ).order_by(ParseResult.created_at.desc()).first()
    
    if not parse_result:
        raise HTTPException(400, "Document must be parsed first")
    
    # Auto-classify if needed
    if not document.document_type or body.force_reclassify:
        # Call classification (import the function or inline)
        pass  # This will trigger classification
    
    # Get project settings
    settings = db.query(ProjectSettings).filter(
        ProjectSettings.project_id == document.project_id
    ).first()
    
    checks_config = settings.checks_config if settings else load_default_checks_config()
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
    
    # Get checks for this document type
    doc_type_config = get_document_type_config(
        document.document_type or "unknown",
        checks_config
    )
    completeness_checks = doc_type_config.get("completeness_checks", [])
    compliance_checks = doc_type_config.get("compliance_checks", [])
    
    # Get chunks
    chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
    chunk_data = [
        {"id": c.chunk_id, "type": c.chunk_type, "content_preview": (c.markdown or "")[:300]}
        for c in chunks
    ]
    
    # Get run number
    run_count = db.query(CheckResult).filter(CheckResult.document_id == document_id).count()
    
    start_time = datetime.utcnow()
    
    # Run checks via AI (similar to existing compliance.py logic)
    result = await run_checks_ai(
        markdown=parse_result.markdown,
        chunks=chunk_data,
        completeness_checks=completeness_checks,
        compliance_checks=compliance_checks,
        document_type=document.document_type,
        model=model
    )
    
    processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
    
    # Save result
    check_result = CheckResult(
        document_id=document_id,
        parse_result_id=parse_result.id,
        project_id=document.project_id,
        run_number=run_count + 1,
        document_type=document.document_type,
        completeness_results=result["completeness_results"],
        compliance_results=result["compliance_results"],
        summary=result["summary"],
        checks_config_snapshot={
            "document_type": document.document_type,
            "completeness_checks": completeness_checks,
            "compliance_checks": compliance_checks
        },
        model=model,
        input_tokens=result.get("usage", {}).get("input_tokens"),
        output_tokens=result.get("usage", {}).get("output_tokens"),
        status="completed",
        processing_time_ms=processing_time
    )
    db.add(check_result)
    
    # Update project usage
    if settings:
        settings.total_input_tokens = (settings.total_input_tokens or 0) + (result.get("usage", {}).get("input_tokens") or 0)
        settings.total_output_tokens = (settings.total_output_tokens or 0) + (result.get("usage", {}).get("output_tokens") or 0)
    
    db.commit()
    
    return {
        "id": check_result.id,
        "run_number": check_result.run_number,
        "document_type": document.document_type,
        "completeness_results": result["completeness_results"],
        "compliance_results": result["compliance_results"],
        "summary": result["summary"],
        "checked_at": check_result.created_at.isoformat(),
        "usage": result.get("usage")
    }


# ============ CHECK HISTORY ============

@router.get("/documents/{document_id}/history")
async def get_document_check_history(
    document_id: str,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get check run history for a document."""
    results = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).limit(limit).all()
    
    total = db.query(CheckResult).filter(CheckResult.document_id == document_id).count()
    
    return {
        "document_id": document_id,
        "total_runs": total,
        "history": [
            {
                "id": r.id,
                "run_number": r.run_number,
                "document_type": r.document_type,
                "summary": r.summary,
                "model": r.model,
                "batch_run_id": r.batch_run_id,
                "created_at": r.created_at.isoformat(),
                "processing_time_ms": r.processing_time_ms
            }
            for r in results
        ]
    }


@router.get("/documents/{document_id}/results/latest")
async def get_latest_check_results(document_id: str, db: Session = Depends(get_db)):
    """Get most recent check results for a document."""
    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()
    
    if not result:
        return {"has_results": False}
    
    return {
        "has_results": True,
        "id": result.id,
        "run_number": result.run_number,
        "document_type": result.document_type,
        "completeness_results": result.completeness_results,
        "compliance_results": result.compliance_results,
        "summary": result.summary,
        "checked_at": result.created_at.isoformat(),
        "checks_config": result.checks_config_snapshot,
        "usage": {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "model": result.model
        }
    }


@router.get("/results/{result_id}")
async def get_check_result_by_id(result_id: str, db: Session = Depends(get_db)):
    """Get a specific check result by ID."""
    result = db.query(CheckResult).filter(CheckResult.id == result_id).first()
    if not result:
        raise HTTPException(404, "Check result not found")
    
    return {
        "id": result.id,
        "document_id": result.document_id,
        "run_number": result.run_number,
        "document_type": result.document_type,
        "completeness_results": result.completeness_results,
        "compliance_results": result.compliance_results,
        "summary": result.summary,
        "checks_config": result.checks_config_snapshot,
        "usage": {
            "model": result.model,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens
        },
        "created_at": result.created_at.isoformat(),
        "processing_time_ms": result.processing_time_ms
    }


# ============ BATCH OPERATIONS ============

@router.post("/projects/{project_id}/run-all")
async def run_checks_all_documents(
    project_id: str,
    body: BatchCheckRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Run checks on all documents in a project (batch)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    if not documents:
        raise HTTPException(400, "No documents in project")
    
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
    
    # Create batch run record
    batch_run = BatchCheckRun(
        project_id=project_id,
        status="pending",
        total_documents=len(documents),
        model=model,
        force_rerun=body.force_rerun
    )
    db.add(batch_run)
    db.commit()
    db.refresh(batch_run)
    
    # Queue background processing
    background_tasks.add_task(
        process_batch_checks,
        batch_run_id=batch_run.id,
        project_id=project_id,
        force_rerun=body.force_rerun,
        skip_unparsed=body.skip_unparsed
    )
    
    return {
        "batch_run_id": batch_run.id,
        "status": "pending",
        "total_documents": len(documents),
        "message": "Batch check run started"
    }


@router.get("/projects/{project_id}/batch-runs")
async def list_batch_runs(project_id: str, db: Session = Depends(get_db)):
    """List all batch check runs for a project."""
    runs = db.query(BatchCheckRun).filter(
        BatchCheckRun.project_id == project_id
    ).order_by(BatchCheckRun.created_at.desc()).all()
    
    return {
        "runs": [
            {
                "id": r.id,
                "status": r.status,
                "total_documents": r.total_documents,
                "completed_documents": r.completed_documents,
                "failed_documents": r.failed_documents,
                "skipped_documents": r.skipped_documents,
                "total_passed": r.total_passed,
                "total_failed": r.total_failed,
                "total_needs_review": r.total_needs_review,
                "created_at": r.created_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None
            }
            for r in runs
        ]
    }


@router.get("/batch-runs/{batch_run_id}")
async def get_batch_run_status(batch_run_id: str, db: Session = Depends(get_db)):
    """Get status and results of a batch check run."""
    batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
    if not batch_run:
        raise HTTPException(404, "Batch run not found")
    
    results = db.query(CheckResult).filter(CheckResult.batch_run_id == batch_run_id).all()
    
    return {
        "id": batch_run.id,
        "status": batch_run.status,
        "progress": {
            "total": batch_run.total_documents,
            "completed": batch_run.completed_documents,
            "failed": batch_run.failed_documents,
            "skipped": batch_run.skipped_documents,
            "percent": int((batch_run.completed_documents / batch_run.total_documents) * 100) if batch_run.total_documents > 0 else 0
        },
        "summary": {
            "total_passed": batch_run.total_passed,
            "total_failed": batch_run.total_failed,
            "total_needs_review": batch_run.total_needs_review
        },
        "usage": {
            "input_tokens": batch_run.total_input_tokens,
            "output_tokens": batch_run.total_output_tokens
        },
        "results": [
            {
                "document_id": r.document_id,
                "document_type": r.document_type,
                "status": r.status,
                "summary": r.summary
            }
            for r in results
        ],
        "created_at": batch_run.created_at.isoformat(),
        "started_at": batch_run.started_at.isoformat() if batch_run.started_at else None,
        "completed_at": batch_run.completed_at.isoformat() if batch_run.completed_at else None
    }


# ============ HELPER FUNCTIONS ============

async def run_checks_ai(markdown, chunks, completeness_checks, compliance_checks, document_type, model):
    """Run checks using AI - adapt from existing compliance.py logic."""
    # This should use the same pattern as the existing compliance router
    # but with the document-type-specific checks
    pass  # Implement based on existing compliance.py


def process_batch_checks(batch_run_id: str, project_id: str, force_rerun: bool, skip_unparsed: bool):
    """Background task to process batch checks."""
    # This runs in background - implement the batch processing logic
    # Loop through documents, run checks, update batch_run progress
    pass  # Implement batch processing
```

### 5.2 Update `backend/main.py`

Add the new router:

```python
from routers import checks

app.include_router(checks.router, prefix="/api/checks", tags=["checks"])
```

---

## PHASE 6: Backend API - PDF Reports

### 6.1 Install ReportLab

Add to `requirements.txt`:
```
reportlab>=4.0.0
```

### 6.2 Create `backend/routers/reports.py`

```python
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER

from database import get_db
from models.database_models import Document, Project, CheckResult, BatchCheckRun

router = APIRouter()


class ReportRequest(BaseModel):
    title: Optional[str] = None
    include_details: bool = True
    generated_by: Optional[str] = None


@router.post("/documents/{document_id}/report")
async def generate_document_report(
    document_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for a document's check results."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(404, "Document not found")
    
    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()
    
    if not result:
        raise HTTPException(400, "No check results for document")
    
    pdf_buffer = generate_document_pdf(
        title=body.title or f"Check Report - {document.original_filename}",
        document=document,
        result=result,
        generated_by=body.generated_by
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=check_report_{document_id[:8]}.pdf"}
    )


@router.post("/projects/{project_id}/report")
async def generate_project_report(
    project_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for all documents in a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    
    results = []
    for doc in documents:
        result = db.query(CheckResult).filter(
            CheckResult.document_id == doc.id
        ).order_by(CheckResult.created_at.desc()).first()
        if result:
            results.append((doc, result))
    
    pdf_buffer = generate_project_pdf(
        title=body.title or f"Compliance Report - {project.name}",
        project=project,
        documents_results=results,
        generated_by=body.generated_by
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=project_report_{project_id[:8]}.pdf"}
    )


@router.post("/batch-runs/{batch_run_id}/report")
async def generate_batch_report(
    batch_run_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for a batch check run."""
    batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
    if not batch_run:
        raise HTTPException(404, "Batch run not found")
    
    results = db.query(CheckResult).filter(CheckResult.batch_run_id == batch_run_id).all()
    
    pdf_buffer = generate_batch_pdf(
        title=body.title or "Batch Check Report",
        batch_run=batch_run,
        results=results,
        generated_by=body.generated_by
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=batch_report_{batch_run_id[:8]}.pdf"}
    )


def generate_document_pdf(title: str, document, result, generated_by: str = None) -> bytes:
    """Generate PDF for single document."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm)
    heading_style = styles['Heading2']
    normal_style = styles['Normal']
    
    story = []
    
    # Title
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 5*mm))
    
    # Info
    story.append(Paragraph(f"<b>Document:</b> {document.original_filename}", normal_style))
    story.append(Paragraph(f"<b>Type:</b> {document.document_type or 'Not classified'}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    if generated_by:
        story.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal_style))
    story.append(Spacer(1, 10*mm))
    
    # Summary table
    summary = result.summary or {}
    story.append(Paragraph("Summary", heading_style))
    summary_data = [
        ["Status", "Count"],
        ["Passed", str(summary.get("passed", 0))],
        ["Failed", str(summary.get("failed", 0))],
        ["Needs Review", str(summary.get("needs_review", 0))],
    ]
    t = Table(summary_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))
    
    # Completeness checks
    if result.completeness_results:
        story.append(Paragraph("Completeness Checks", heading_style))
        for check in result.completeness_results:
            icon = {"pass": "✓", "fail": "✗", "needs_review": "⚠", "na": "—"}.get(check.get("status"), "?")
            story.append(Paragraph(f"{icon} <b>{check.get('check_name')}</b>: {check.get('notes', '')}", normal_style))
        story.append(Spacer(1, 5*mm))
    
    # Compliance checks
    if result.compliance_results:
        story.append(Paragraph("Compliance Checks", heading_style))
        for check in result.compliance_results:
            icon = {"pass": "✓", "fail": "✗", "needs_review": "⚠", "na": "—"}.get(check.get("status"), "?")
            story.append(Paragraph(f"{icon} <b>{check.get('check_name')}</b>: {check.get('notes', '')}", normal_style))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_project_pdf(title: str, project, documents_results: list, generated_by: str = None) -> bytes:
    """Generate PDF for entire project."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm)
    heading_style = styles['Heading2']
    normal_style = styles['Normal']
    
    story = []
    
    # Title
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(f"<b>Project:</b> {project.name}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Paragraph(f"<b>Documents:</b> {len(documents_results)}", normal_style))
    story.append(Spacer(1, 10*mm))
    
    # Overall summary
    total_passed = sum(r.summary.get("passed", 0) for _, r in documents_results if r.summary)
    total_failed = sum(r.summary.get("failed", 0) for _, r in documents_results if r.summary)
    total_review = sum(r.summary.get("needs_review", 0) for _, r in documents_results if r.summary)
    
    story.append(Paragraph("Overall Summary", heading_style))
    summary_data = [
        ["Status", "Count"],
        ["Passed", str(total_passed)],
        ["Failed", str(total_failed)],
        ["Needs Review", str(total_review)],
    ]
    t = Table(summary_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))
    
    # Per-document summaries
    for doc, result in documents_results:
        story.append(Paragraph(f"<b>{doc.original_filename}</b> ({doc.document_type or 'unclassified'})", heading_style))
        summary = result.summary or {}
        story.append(Paragraph(
            f"✓ {summary.get('passed', 0)} passed | "
            f"✗ {summary.get('failed', 0)} failed | "
            f"⚠ {summary.get('needs_review', 0)} review",
            normal_style
        ))
        story.append(Spacer(1, 3*mm))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_batch_pdf(title: str, batch_run, results: list, generated_by: str = None) -> bytes:
    """Generate PDF for batch run."""
    # Similar to project PDF but organized by batch run
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER)
    normal_style = styles['Normal']
    
    story = []
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(f"<b>Status:</b> {batch_run.status}", normal_style))
    story.append(Paragraph(f"<b>Documents:</b> {batch_run.total_documents}", normal_style))
    story.append(Paragraph(
        f"<b>Results:</b> ✓{batch_run.total_passed} | ✗{batch_run.total_failed} | ⚠{batch_run.total_needs_review}",
        normal_style
    ))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
```

### 6.3 Update `backend/main.py`

```python
from routers import reports

app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
```

---

## PHASE 7: Frontend - Types

### 7.1 Update `frontend/src/types/project.ts`

Add these types:

```typescript
export interface ProjectSettings {
  work_type: string;
  vision_parser: string;
  vision_model: string | null;
  chat_model: string;
  compliance_model: string;
  checks_config: any | null;
  usage: {
    total_parse_credits: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  required_documents: string[];
  optional_documents: string[];
}

export interface WorkTypeTemplate {
  id: string;
  name: string;
  description: string;
  required_documents: string[];
  optional_documents: string[];
}

export interface BatchCheckRun {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_documents: number;
  completed_documents: number;
  failed_documents: number;
  skipped_documents: number;
  total_passed: number;
  total_failed: number;
  total_needs_review: number;
  created_at: string;
  completed_at: string | null;
}

export interface CheckHistoryItem {
  id: string;
  run_number: number;
  document_type: string;
  summary: {
    passed: number;
    failed: number;
    needs_review: number;
  };
  model: string;
  batch_run_id: string | null;
  created_at: string;
  processing_time_ms: number;
}
```

### 7.2 Update `frontend/src/types/compliance.ts`

Add:

```typescript
export interface DocumentType {
  id: string;
  name: string;
  description: string;
}
```

---

## PHASE 8: Frontend - New Components

### 8.1 Create `frontend/src/components/BatchCheckProgress.tsx`

Component to show batch run progress with polling.

### 8.2 Create `frontend/src/components/CheckHistoryPanel.tsx`

Component to show check run history for a document.

### 8.3 Create `frontend/src/components/DocumentTypeSelector.tsx`

Dropdown to view/override document classification.

### 8.4 Create `frontend/src/components/ExportReportButton.tsx`

Button to trigger PDF export with scope selection.

### 8.5 Create `frontend/src/components/ProjectTemplateSelector.tsx`

Work type template selection on project creation/settings.

---

## PHASE 9: Frontend - Integration

### 9.1 Update `frontend/src/components/SettingsPanel.tsx`

- Add work type template selector
- Move model settings to project level
- Show project usage

### 9.2 Update `frontend/src/components/ReviewTab.tsx`

- Load saved check results instead of running checks
- Add check history panel
- Add export PDF button
- Remove "Run Checks" button

### 9.3 Update `frontend/src/App.tsx`

- Add document classification display
- Add "Run Checks" action button (separate from Process)
- Add "Run All Checks" button for batch
- Integrate new components

---

## PHASE 10: Testing & Cleanup

### 10.1 Test each endpoint with sample data

### 10.2 Test batch processing with multiple documents

### 10.3 Test PDF export for all three scopes

### 10.4 Remove deprecated code from old compliance router

---

## Summary Checklist

- [ ] Phase 1: Database models updated
- [ ] Phase 2: Config files in place
- [ ] Phase 3: Project settings API working
- [ ] Phase 4: Document classification API working
- [ ] Phase 5: Checks router with batch support
- [ ] Phase 6: PDF report generation
- [ ] Phase 7: Frontend types updated
- [ ] Phase 8: New React components created
- [ ] Phase 9: Components integrated into app
- [ ] Phase 10: Testing complete

---

**Important Notes for CC:**

1. The existing `compliance.py` router has the AI call pattern - reuse that logic
2. Use the existing `get_bedrock_client()` and `resolve_model_id()` functions
3. Keep backward compatibility - don't break existing functionality
4. Add proper error handling and logging
5. Use background tasks for batch processing to avoid timeouts

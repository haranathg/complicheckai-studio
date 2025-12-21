# CompliCheckAI Enhancement - Complete Implementation Spec v3

## Features Summary

1. ✅ **User-editable checks** - Question text editable per project
2. ✅ **Manual classification override** - Fix auto-classification errors  
3. ✅ **Separate actions** - "Process" vs "Run Checks" as distinct operations
4. ✅ **Persist check results** - Save ALL runs to database (history)
5. ✅ **Review tab shows results** - Read-only view with history
6. ✅ **Project-level settings** - Vision model, chat model, usage at project level
7. ✅ **Batch run checks** - Run checks on all documents in project
8. ✅ **Check run history** - Keep all check runs, not just latest
9. ✅ **Project templates** - Pre-configured defaults based on work type
10. ✅ **PDF report export** - Export check results as PDF report

---

## Database Schema

### Complete SQL Migration

```sql
-- =====================================================
-- 1. PROJECT SETTINGS TABLE
-- =====================================================
CREATE TABLE project_settings (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Work type template
    work_type VARCHAR(50) DEFAULT 'custom',  -- solid_fuel_heater, new_dwelling, etc.
    
    -- Model settings
    vision_parser VARCHAR(50) DEFAULT 'landing_ai',
    vision_model VARCHAR(100),
    chat_model VARCHAR(100) DEFAULT 'bedrock-claude-sonnet-3.5',
    compliance_model VARCHAR(100) DEFAULT 'bedrock-claude-sonnet-3.5',
    
    -- Custom checks configuration (overrides defaults)
    checks_config JSON,
    
    -- Usage tracking (aggregated)
    total_parse_credits INTEGER DEFAULT 0,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_project_settings_project_id ON project_settings(project_id);
CREATE INDEX ix_project_settings_work_type ON project_settings(work_type);

-- =====================================================
-- 2. DOCUMENT CLASSIFICATION COLUMNS
-- =====================================================
ALTER TABLE documents ADD COLUMN document_type VARCHAR(50);
ALTER TABLE documents ADD COLUMN classification_confidence INTEGER;
ALTER TABLE documents ADD COLUMN classification_signals JSON;
ALTER TABLE documents ADD COLUMN classification_override BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN classification_model VARCHAR(100);

CREATE INDEX ix_documents_document_type ON documents(document_type);

-- =====================================================
-- 3. CHECK RESULTS TABLE (with history support)
-- =====================================================
CREATE TABLE check_results (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    parse_result_id VARCHAR(36) REFERENCES parse_results(id) ON DELETE SET NULL,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Run context
    batch_run_id VARCHAR(36),  -- Links results from same batch run
    run_number INTEGER DEFAULT 1,  -- Sequential run number for this document
    
    -- Classification at time of check
    document_type VARCHAR(50),
    
    -- Results storage
    completeness_results JSON,
    compliance_results JSON,
    summary JSON,
    
    -- Config snapshot (what checks were run)
    checks_config_snapshot JSON,
    
    -- Usage
    model VARCHAR(100),
    input_tokens INTEGER,
    output_tokens INTEGER,
    
    -- Status
    status VARCHAR(20) DEFAULT 'completed',
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INTEGER
);

CREATE INDEX ix_check_results_document_id ON check_results(document_id);
CREATE INDEX ix_check_results_project_id ON check_results(project_id);
CREATE INDEX ix_check_results_batch_run_id ON check_results(batch_run_id);
CREATE INDEX ix_check_results_created_at ON check_results(created_at);

-- =====================================================
-- 4. BATCH CHECK RUNS TABLE
-- =====================================================
CREATE TABLE batch_check_runs (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Progress tracking
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed, cancelled
    total_documents INTEGER DEFAULT 0,
    completed_documents INTEGER DEFAULT 0,
    failed_documents INTEGER DEFAULT 0,
    skipped_documents INTEGER DEFAULT 0,  -- Already had recent results or not parsed
    
    -- Configuration used
    model VARCHAR(100),
    force_rerun BOOLEAN DEFAULT FALSE,  -- Re-run even if recent results exist
    
    -- Aggregated results
    total_passed INTEGER DEFAULT 0,
    total_failed INTEGER DEFAULT 0,
    total_needs_review INTEGER DEFAULT 0,
    
    -- Usage
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    
    -- Error tracking
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX ix_batch_check_runs_project_id ON batch_check_runs(project_id);
CREATE INDEX ix_batch_check_runs_status ON batch_check_runs(status);

-- =====================================================
-- 5. CHECK REPORTS TABLE (for PDF exports)
-- =====================================================
CREATE TABLE check_reports (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- Scope
    scope VARCHAR(20) NOT NULL,  -- 'document', 'project', 'batch'
    document_id VARCHAR(36) REFERENCES documents(id) ON DELETE SET NULL,
    batch_run_id VARCHAR(36) REFERENCES batch_check_runs(id) ON DELETE SET NULL,
    
    -- Report content
    title VARCHAR(255),
    generated_by VARCHAR(255),
    
    -- Storage
    s3_key VARCHAR(500),  -- Path to PDF in S3
    file_size INTEGER,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_check_reports_project_id ON check_reports(project_id);
CREATE INDEX ix_check_reports_document_id ON check_reports(document_id);
```

### SQLAlchemy Models

```python
# backend/models/database_models.py - additions

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
    
    # Checks configuration
    checks_config = Column(JSON, nullable=True)
    
    # Usage tracking
    total_parse_credits = Column(Integer, default=0)
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project = relationship("Project", back_populates="settings")

    __table_args__ = (
        Index("ix_project_settings_work_type", "work_type"),
    )


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

    # Relationships
    document = relationship("Document", back_populates="check_results")
    batch_run = relationship("BatchCheckRun", back_populates="results")

    __table_args__ = (
        Index("ix_check_results_document_id", "document_id"),
        Index("ix_check_results_project_id", "project_id"),
        Index("ix_check_results_batch_run_id", "batch_run_id"),
        Index("ix_check_results_created_at", "created_at"),
    )


class BatchCheckRun(Base):
    """Batch check run across multiple documents in a project."""
    __tablename__ = "batch_check_runs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Progress
    status = Column(String(20), default="pending")
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

    # Relationships
    results = relationship("CheckResult", back_populates="batch_run")

    __table_args__ = (
        Index("ix_batch_check_runs_project_id", "project_id"),
        Index("ix_batch_check_runs_status", "status"),
    )


class CheckReport(Base):
    """Generated PDF reports for check results."""
    __tablename__ = "check_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # Scope
    scope = Column(String(20), nullable=False)  # document, project, batch
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    batch_run_id = Column(String(36), ForeignKey("batch_check_runs.id", ondelete="SET NULL"), nullable=True)
    
    # Report content
    title = Column(String(255), nullable=True)
    generated_by = Column(String(255), nullable=True)
    
    # Storage
    s3_key = Column(String(500), nullable=True)
    file_size = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_check_reports_project_id", "project_id"),
        Index("ix_check_reports_document_id", "document_id"),
    )


# Update Document model
class Document(Base):
    # ... existing fields ...
    
    # Classification
    document_type = Column(String(50), nullable=True)
    classification_confidence = Column(Integer, nullable=True)
    classification_signals = Column(JSON, nullable=True)
    classification_override = Column(Boolean, default=False)
    classification_model = Column(String(100), nullable=True)
    
    # Relationships
    check_results = relationship("CheckResult", back_populates="document", cascade="all, delete-orphan")


# Update Project model
class Project(Base):
    # ... existing fields ...
    settings = relationship("ProjectSettings", back_populates="project", uselist=False, cascade="all, delete-orphan")
```

---

## API Endpoints

### Project Settings & Templates

```python
# backend/routers/projects.py - additions

from typing import Optional, List
from pydantic import BaseModel

class ProjectSettingsResponse(BaseModel):
    work_type: str
    vision_parser: str
    vision_model: Optional[str]
    chat_model: str
    compliance_model: str
    checks_config: Optional[dict]
    usage: dict
    required_documents: List[str]
    optional_documents: List[str]


class ProjectSettingsUpdate(BaseModel):
    work_type: Optional[str] = None
    vision_parser: Optional[str] = None
    vision_model: Optional[str] = None
    chat_model: Optional[str] = None
    compliance_model: Optional[str] = None


@router.get("/{project_id}/settings", response_model=ProjectSettingsResponse)
async def get_project_settings(project_id: str, db: Session = Depends(get_db)):
    """Get project settings including work type template info."""
    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    
    # Load default config to get work type info
    config = load_default_checks_config()
    work_type = settings.work_type if settings else "custom"
    work_type_info = config.get("work_types", {}).get(work_type, {})
    
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
    """Update project settings. If work_type changes, applies template defaults."""
    existing = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    if not existing:
        existing = ProjectSettings(project_id=project_id)
        db.add(existing)
    
    # If work type is changing, apply template defaults
    if body.work_type and body.work_type != existing.work_type:
        config = load_default_checks_config()
        work_type_info = config.get("work_types", {}).get(body.work_type, {})
        defaults = work_type_info.get("default_settings", {})
        
        existing.work_type = body.work_type
        existing.vision_parser = defaults.get("vision_parser", "landing_ai")
        existing.chat_model = defaults.get("chat_model", "bedrock-claude-sonnet-3.5")
        existing.compliance_model = defaults.get("compliance_model", "bedrock-claude-sonnet-3.5")
    
    # Apply any explicit overrides
    if body.vision_parser is not None:
        existing.vision_parser = body.vision_parser
    if body.vision_model is not None:
        existing.vision_model = body.vision_model
    if body.chat_model is not None:
        existing.chat_model = body.chat_model
    if body.compliance_model is not None:
        existing.compliance_model = body.compliance_model
    
    db.commit()
    db.refresh(existing)
    return existing


@router.get("/templates")
async def list_work_type_templates():
    """List available work type templates."""
    config = load_default_checks_config()
    work_types = config.get("work_types", {})
    
    return {
        "templates": [
            {
                "id": wt_id,
                "name": wt.get("name"),
                "description": wt.get("description"),
                "required_documents": wt.get("required_documents", []),
                "optional_documents": wt.get("optional_documents", [])
            }
            for wt_id, wt in work_types.items()
        ]
    }
```

### Batch Check Runs

```python
# backend/routers/checks.py - batch operations

class BatchCheckRequest(BaseModel):
    force_rerun: bool = False  # Re-run even if recent results exist
    skip_unparsed: bool = True  # Skip documents that haven't been parsed


@router.post("/projects/{project_id}/run-all")
async def run_checks_all_documents(
    project_id: str,
    body: BatchCheckRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Run checks on all documents in a project (batch operation)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Get all documents
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    
    if not documents:
        raise HTTPException(400, "No documents in project")
    
    # Get settings
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
    
    # Queue background task
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
    
    # Get individual results
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


# Background task processor
async def process_batch_checks(batch_run_id: str, project_id: str, force_rerun: bool, skip_unparsed: bool):
    """Process batch check run in background."""
    db = SessionLocal()
    try:
        batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
        batch_run.status = "processing"
        batch_run.started_at = datetime.utcnow()
        db.commit()
        
        documents = db.query(Document).filter(Document.project_id == project_id).all()
        settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
        checks_config = settings.checks_config if settings else load_default_checks_config()
        model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
        
        for doc in documents:
            try:
                # Check if document has parse results
                parse_result = db.query(ParseResult).filter(
                    ParseResult.document_id == doc.id
                ).order_by(ParseResult.created_at.desc()).first()
                
                if not parse_result:
                    if skip_unparsed:
                        batch_run.skipped_documents += 1
                        continue
                    else:
                        batch_run.failed_documents += 1
                        continue
                
                # Check if recent results exist (within last hour)
                if not force_rerun:
                    recent = db.query(CheckResult).filter(
                        CheckResult.document_id == doc.id,
                        CheckResult.created_at > datetime.utcnow() - timedelta(hours=1)
                    ).first()
                    if recent:
                        batch_run.skipped_documents += 1
                        batch_run.total_passed += recent.summary.get("passed", 0) if recent.summary else 0
                        batch_run.total_failed += recent.summary.get("failed", 0) if recent.summary else 0
                        batch_run.total_needs_review += recent.summary.get("needs_review", 0) if recent.summary else 0
                        continue
                
                # Auto-classify if needed
                if not doc.document_type:
                    # Run classification
                    pass  # Simplified - call classification function
                
                # Get checks for document type
                doc_type_config = checks_config.get("document_types", {}).get(doc.document_type or "unknown", {})
                completeness_checks = doc_type_config.get("completeness_checks", [])
                compliance_checks = doc_type_config.get("compliance_checks", [])
                
                # Get run number
                run_count = db.query(CheckResult).filter(CheckResult.document_id == doc.id).count()
                
                # Run checks
                result = await run_checks_ai(
                    markdown=parse_result.markdown,
                    chunks=[],  # Load from DB
                    completeness_checks=completeness_checks,
                    compliance_checks=compliance_checks,
                    document_type=doc.document_type,
                    model=model
                )
                
                # Save result
                check_result = CheckResult(
                    document_id=doc.id,
                    parse_result_id=parse_result.id,
                    project_id=project_id,
                    batch_run_id=batch_run_id,
                    run_number=run_count + 1,
                    document_type=doc.document_type,
                    completeness_results=result["completeness_results"],
                    compliance_results=result["compliance_results"],
                    summary=result["summary"],
                    checks_config_snapshot={
                        "document_type": doc.document_type,
                        "completeness_checks": completeness_checks,
                        "compliance_checks": compliance_checks
                    },
                    model=model,
                    input_tokens=result.get("usage", {}).get("input_tokens"),
                    output_tokens=result.get("usage", {}).get("output_tokens"),
                    status="completed"
                )
                db.add(check_result)
                
                # Update batch totals
                batch_run.completed_documents += 1
                batch_run.total_passed += result["summary"].get("passed", 0)
                batch_run.total_failed += result["summary"].get("failed", 0)
                batch_run.total_needs_review += result["summary"].get("needs_review", 0)
                batch_run.total_input_tokens += result.get("usage", {}).get("input_tokens", 0)
                batch_run.total_output_tokens += result.get("usage", {}).get("output_tokens", 0)
                
                db.commit()
                
            except Exception as e:
                batch_run.failed_documents += 1
                db.commit()
                print(f"Error processing document {doc.id}: {e}")
        
        # Mark complete
        batch_run.status = "completed"
        batch_run.completed_at = datetime.utcnow()
        
        # Update project usage
        if settings:
            settings.total_input_tokens += batch_run.total_input_tokens
            settings.total_output_tokens += batch_run.total_output_tokens
        
        db.commit()
        
    except Exception as e:
        batch_run.status = "failed"
        batch_run.error_message = str(e)
        db.commit()
    finally:
        db.close()
```

### Check History

```python
# backend/routers/checks.py - history endpoints

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
    
    return {
        "document_id": document_id,
        "total_runs": db.query(CheckResult).filter(CheckResult.document_id == document_id).count(),
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


@router.get("/documents/{document_id}/results/{result_id}")
async def get_check_result_detail(document_id: str, result_id: str, db: Session = Depends(get_db)):
    """Get detailed check result from history."""
    result = db.query(CheckResult).filter(
        CheckResult.id == result_id,
        CheckResult.document_id == document_id
    ).first()
    
    if not result:
        raise HTTPException(404, "Check result not found")
    
    return {
        "id": result.id,
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
```

### PDF Report Generation

```python
# backend/routers/reports.py - NEW FILE

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.enums import TA_CENTER, TA_LEFT

router = APIRouter()


class ReportRequest(BaseModel):
    title: Optional[str] = None
    include_details: bool = True
    generated_by: Optional[str] = None


@router.post("/documents/{document_id}/report")
async def generate_document_report(
    document_id: str,
    body: ReportRequest,
    db: Session = Depends(get_db)
):
    """Generate PDF report for a single document's check results."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(404, "Document not found")
    
    # Get latest check result
    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()
    
    if not result:
        raise HTTPException(400, "No check results for document")
    
    # Generate PDF
    pdf_buffer = generate_check_report_pdf(
        title=body.title or f"Check Report - {document.original_filename}",
        document=document,
        results=[result],
        generated_by=body.generated_by
    )
    
    # Save to S3 and database (optional)
    # ...
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=check_report_{document_id[:8]}.pdf"
        }
    )


@router.post("/projects/{project_id}/report")
async def generate_project_report(
    project_id: str,
    body: ReportRequest,
    db: Session = Depends(get_db)
):
    """Generate PDF report for all documents in a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Get all documents with their latest results
    documents = db.query(Document).filter(Document.project_id == project_id).all()
    
    results_by_doc = {}
    for doc in documents:
        result = db.query(CheckResult).filter(
            CheckResult.document_id == doc.id
        ).order_by(CheckResult.created_at.desc()).first()
        if result:
            results_by_doc[doc.id] = (doc, result)
    
    # Generate PDF
    pdf_buffer = generate_project_report_pdf(
        title=body.title or f"Compliance Report - {project.name}",
        project=project,
        documents_results=results_by_doc,
        generated_by=body.generated_by
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=project_report_{project_id[:8]}.pdf"
        }
    )


@router.post("/batch-runs/{batch_run_id}/report")
async def generate_batch_run_report(
    batch_run_id: str,
    body: ReportRequest,
    db: Session = Depends(get_db)
):
    """Generate PDF report for a batch check run."""
    batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
    if not batch_run:
        raise HTTPException(404, "Batch run not found")
    
    # Get all results from this batch
    results = db.query(CheckResult).filter(
        CheckResult.batch_run_id == batch_run_id
    ).all()
    
    # Generate PDF
    pdf_buffer = generate_batch_report_pdf(
        title=body.title or f"Batch Check Report",
        batch_run=batch_run,
        results=results,
        generated_by=body.generated_by
    )
    
    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=batch_report_{batch_run_id[:8]}.pdf"
        }
    )


def generate_check_report_pdf(title: str, document, results: list, generated_by: str = None) -> bytes:
    """Generate PDF report using ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm)
    
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], spaceBefore=5*mm, spaceAfter=3*mm)
    normal_style = styles['Normal']
    
    story = []
    
    # Title
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 5*mm))
    
    # Document info
    story.append(Paragraph(f"<b>Document:</b> {document.original_filename}", normal_style))
    story.append(Paragraph(f"<b>Type:</b> {document.document_type or 'Not classified'}", normal_style))
    if generated_by:
        story.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Spacer(1, 10*mm))
    
    for result in results:
        # Summary
        summary = result.summary or {}
        story.append(Paragraph("Summary", heading_style))
        
        summary_data = [
            ["Status", "Count"],
            ["Passed", str(summary.get("passed", 0))],
            ["Failed", str(summary.get("failed", 0))],
            ["Needs Review", str(summary.get("needs_review", 0))],
            ["N/A", str(summary.get("na", 0))],
        ]
        
        summary_table = Table(summary_data, colWidths=[80*mm, 40*mm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f1f5f9')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 10*mm))
        
        # Completeness Results
        if result.completeness_results:
            story.append(Paragraph("Completeness Checks", heading_style))
            for check in result.completeness_results:
                status_color = {
                    'pass': '#22c55e',
                    'fail': '#ef4444',
                    'needs_review': '#eab308',
                    'na': '#9ca3af'
                }.get(check.get('status'), '#9ca3af')
                
                status_icon = {
                    'pass': '✓',
                    'fail': '✗',
                    'needs_review': '⚠',
                    'na': '—'
                }.get(check.get('status'), '?')
                
                story.append(Paragraph(
                    f"<font color='{status_color}'><b>{status_icon}</b></font> "
                    f"<b>{check.get('check_name')}</b>: {check.get('notes', '')}",
                    normal_style
                ))
                if check.get('found_value'):
                    story.append(Paragraph(f"    Found: {check.get('found_value')}", normal_style))
            story.append(Spacer(1, 5*mm))
        
        # Compliance Results
        if result.compliance_results:
            story.append(Paragraph("Compliance Checks", heading_style))
            for check in result.compliance_results:
                status_color = {
                    'pass': '#22c55e',
                    'fail': '#ef4444',
                    'needs_review': '#eab308',
                    'na': '#9ca3af'
                }.get(check.get('status'), '#9ca3af')
                
                status_icon = {
                    'pass': '✓',
                    'fail': '✗',
                    'needs_review': '⚠',
                    'na': '—'
                }.get(check.get('status'), '?')
                
                story.append(Paragraph(
                    f"<font color='{status_color}'><b>{status_icon}</b></font> "
                    f"<b>{check.get('check_name')}</b>: {check.get('notes', '')}",
                    normal_style
                ))
                if check.get('found_value'):
                    story.append(Paragraph(f"    Found: {check.get('found_value')}", normal_style))
                if check.get('expected'):
                    story.append(Paragraph(f"    Expected: {check.get('expected')}", normal_style))
    
    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_project_report_pdf(title: str, project, documents_results: dict, generated_by: str = None) -> bytes:
    """Generate comprehensive project report PDF."""
    # Similar to above but with all documents
    # ... implementation
    pass


def generate_batch_report_pdf(title: str, batch_run, results: list, generated_by: str = None) -> bytes:
    """Generate batch run report PDF."""
    # ... implementation
    pass
```

---

## Frontend Components

### Project Template Selector

```typescript
// frontend/src/components/ProjectTemplateSelector.tsx

interface ProjectTemplateSelectorProps {
  currentWorkType: string;
  onSelect: (workType: string) => void;
}

export default function ProjectTemplateSelector({
  currentWorkType,
  onSelect
}: ProjectTemplateSelectorProps) {
  const [templates, setTemplates] = useState<WorkTypeTemplate[]>([]);
  
  useEffect(() => {
    fetch(`${API_URL}/api/projects/templates`)
      .then(res => res.json())
      .then(data => setTemplates(data.templates));
  }, []);
  
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Project Type</label>
      <div className="grid grid-cols-2 gap-2">
        {templates.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`p-3 text-left border rounded-lg transition ${
              currentWorkType === t.id
                ? 'border-sky-500 bg-sky-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="font-medium text-sm">{t.name}</div>
            <div className="text-xs text-gray-500 mt-1">{t.description}</div>
            <div className="text-xs text-gray-400 mt-2">
              {t.required_documents.length} required docs
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Batch Check Progress

```typescript
// frontend/src/components/BatchCheckProgress.tsx

interface BatchCheckProgressProps {
  batchRunId: string;
  onComplete: () => void;
}

export default function BatchCheckProgress({ batchRunId, onComplete }: BatchCheckProgressProps) {
  const [status, setStatus] = useState<BatchRunStatus | null>(null);
  
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`${API_URL}/api/checks/batch-runs/${batchRunId}`);
      const data = await res.json();
      setStatus(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(interval);
        onComplete();
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [batchRunId]);
  
  if (!status) return <div>Loading...</div>;
  
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-medium">Running Checks on All Documents</h4>
        <span className={`text-sm px-2 py-1 rounded ${
          status.status === 'completed' ? 'bg-green-100 text-green-700' :
          status.status === 'failed' ? 'bg-red-100 text-red-700' :
          'bg-sky-100 text-sky-700'
        }`}>
          {status.status}
        </span>
      </div>
      
      {/* Progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
        <div
          className="bg-sky-500 h-2 rounded-full transition-all"
          style={{ width: `${status.progress.percent}%` }}
        />
      </div>
      
      <div className="grid grid-cols-4 gap-2 text-sm text-center">
        <div>
          <div className="font-medium">{status.progress.completed}</div>
          <div className="text-gray-500 text-xs">Completed</div>
        </div>
        <div>
          <div className="font-medium">{status.progress.failed}</div>
          <div className="text-gray-500 text-xs">Failed</div>
        </div>
        <div>
          <div className="font-medium">{status.progress.skipped}</div>
          <div className="text-gray-500 text-xs">Skipped</div>
        </div>
        <div>
          <div className="font-medium">{status.progress.total}</div>
          <div className="text-gray-500 text-xs">Total</div>
        </div>
      </div>
      
      {status.status === 'completed' && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <div className="text-sm font-medium mb-2">Results Summary</div>
          <div className="flex gap-4 text-sm">
            <span className="text-green-600">✓ {status.summary.total_passed} passed</span>
            <span className="text-red-600">✗ {status.summary.total_failed} failed</span>
            <span className="text-yellow-600">⚠ {status.summary.total_needs_review} review</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Check History Panel

```typescript
// frontend/src/components/CheckHistoryPanel.tsx

interface CheckHistoryPanelProps {
  documentId: string;
  onSelectResult: (resultId: string) => void;
}

export default function CheckHistoryPanel({ documentId, onSelectResult }: CheckHistoryPanelProps) {
  const [history, setHistory] = useState<CheckHistoryItem[]>([]);
  
  useEffect(() => {
    fetch(`${API_URL}/api/checks/documents/${documentId}/history`)
      .then(res => res.json())
      .then(data => setHistory(data.history));
  }, [documentId]);
  
  return (
    <div className="border rounded-lg">
      <div className="p-3 border-b bg-gray-50">
        <h4 className="text-sm font-medium">Check History</h4>
        <p className="text-xs text-gray-500">{history.length} runs</p>
      </div>
      
      <div className="max-h-64 overflow-auto">
        {history.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => onSelectResult(item.id)}
            className="w-full p-3 text-left border-b hover:bg-gray-50 transition"
          >
            <div className="flex justify-between items-start">
              <div>
                <span className="text-sm font-medium">Run #{item.run_number}</span>
                {item.batch_run_id && (
                  <span className="ml-2 text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                    batch
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-400">
                {new Date(item.created_at).toLocaleDateString()}
              </span>
            </div>
            
            {item.summary && (
              <div className="flex gap-2 mt-1 text-xs">
                <span className="text-green-600">✓{item.summary.passed}</span>
                <span className="text-red-600">✗{item.summary.failed}</span>
                <span className="text-yellow-600">⚠{item.summary.needs_review}</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

### Export Report Button

```typescript
// frontend/src/components/ExportReportButton.tsx

interface ExportReportButtonProps {
  scope: 'document' | 'project' | 'batch';
  documentId?: string;
  projectId?: string;
  batchRunId?: string;
}

export default function ExportReportButton({
  scope,
  documentId,
  projectId,
  batchRunId
}: ExportReportButtonProps) {
  const [exporting, setExporting] = useState(false);
  
  const handleExport = async () => {
    setExporting(true);
    
    let url = '';
    if (scope === 'document' && documentId) {
      url = `${API_URL}/api/reports/documents/${documentId}/report`;
    } else if (scope === 'project' && projectId) {
      url = `${API_URL}/api/reports/projects/${projectId}/report`;
    } else if (scope === 'batch' && batchRunId) {
      url = `${API_URL}/api/reports/batch-runs/${batchRunId}/report`;
    }
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_details: true })
      });
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `check_report_${Date.now()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } finally {
      setExporting(false);
    }
  };
  
  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {exporting ? 'Exporting...' : 'Export PDF'}
    </button>
  );
}
```

---

## Updated UI Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ Project: Solid Fuel Heater Installation          [Template ▼] [⚙️] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [Run Checks on All Documents]                    [Export Report]   │
│                                                                     │
│  Documents                          │  Document Viewer              │
│  ───────────────────────────────    │  ──────────────────────────   │
│  📄 Record of Title.pdf             │                               │
│     Type: record_of_title (98%)     │  [PDF Preview]                │
│     ✓5/7 complete | ✓1/1 comply     │                               │
│     [3 check runs]                  │                               │
│                                     │                               │
│  📄 Site Plan.pdf                   │  ──────────────────────────   │
│     Type: site_plan (95%)           │                               │
│     ⚠8/11 complete | ✓3/5 comply    │  Document Actions:            │
│     [2 check runs]                  │  [Process] [Run Checks]       │
│                                     │  [Classify ▼] [Export PDF]    │
│  📄 Heater Manual.pdf               │                               │
│     Type: product_specification     │  Check History:               │
│     ✓4/5 complete | ⚠1/2 comply     │  ┌─────────────────────────┐  │
│     [1 check run]                   │  │ Run #3 - Today 2:30pm   │  │
│                                     │  │ ✓5 ✗1 ⚠1               │  │
│  [+ Add Document]                   │  │ Run #2 - Yesterday      │  │
│                                     │  │ ✓4 ✗2 ⚠1               │  │
│  Required: ✓4/5 documents           │  │ Run #1 - Dec 19         │  │
│  Optional: 1/3 documents            │  │ ✓3 ✗3 ⚠1               │  │
│                                     │  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `backend/models/database_models.py` | Modify | Add all new tables/columns |
| `backend/routers/projects.py` | Modify | Add settings + templates endpoints |
| `backend/routers/checks.py` | Create | Single doc + batch check endpoints |
| `backend/routers/reports.py` | Create | PDF report generation |
| `backend/services/pdf_service.py` | Create | ReportLab PDF generation |
| `backend/main.py` | Modify | Add new routers |
| `frontend/src/components/ProjectTemplateSelector.tsx` | Create | Work type selection |
| `frontend/src/components/BatchCheckProgress.tsx` | Create | Batch run UI |
| `frontend/src/components/CheckHistoryPanel.tsx` | Create | History view |
| `frontend/src/components/ExportReportButton.tsx` | Create | PDF export button |
| `frontend/src/components/ProjectSettingsPanel.tsx` | Modify | Add template selector |
| `frontend/src/components/DocumentActions.tsx` | Modify | Add export button |

---

## Requirements Checklist

- [x] User-editable checks (per project checks_config)
- [x] Manual classification override (PATCH endpoint)
- [x] Separate Process vs Run Checks actions
- [x] Persist all check results (CheckResult table)
- [x] Review tab shows saved results
- [x] Project-level settings (ProjectSettings table)
- [x] Batch run checks on all documents (BatchCheckRun)
- [x] Keep check run history (run_number, no delete)
- [x] Project templates (work_types with default_settings)
- [x] PDF report export (ReportLab generation)

---

*Implementation Spec v3.0 - Complete*

"""SQLAlchemy ORM models for project-based document management."""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, String, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, JSON, Index
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.dialects.postgresql import UUID
import uuid

Base = declarative_base()


def generate_uuid():
    return str(uuid.uuid4())


class Project(Base):
    """Projects organize documents into logical groups."""
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(255), nullable=True)  # For future auth integration
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    settings = relationship("ProjectSettings", back_populates="project", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_projects_name", "name"),
        Index("ix_projects_created_at", "created_at"),
    )


class Document(Base):
    """Uploaded documents within a project."""
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=True)
    file_size = Column(Integer, nullable=True)  # bytes
    file_hash = Column(String(64), nullable=True)  # SHA-256 hash for deduplication
    s3_key = Column(String(500), nullable=False)  # S3 path to original file
    page_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by = Column(String(255), nullable=True)

    # Document classification
    document_type = Column(String(50), nullable=True)
    classification_confidence = Column(Integer, nullable=True)
    classification_signals = Column(JSON, nullable=True)
    classification_override = Column(Boolean, default=False)
    classification_model = Column(String(100), nullable=True)

    # Relationships
    project = relationship("Project", back_populates="documents")
    parse_results = relationship("ParseResult", back_populates="document", cascade="all, delete-orphan")
    check_results = relationship("CheckResult", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_project_id", "project_id"),
        Index("ix_documents_file_hash", "file_hash"),
        Index("ix_documents_created_at", "created_at"),
        Index("ix_documents_document_type", "document_type"),
    )


class ParseResult(Base):
    """Cached parse results for a document with a specific parser."""
    __tablename__ = "parse_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    parser = Column(String(50), nullable=False)  # landing_ai, claude_vision, bedrock_claude, etc.
    model = Column(String(100), nullable=True)  # Specific model used

    # Result storage
    s3_result_key = Column(String(500), nullable=True)  # S3 path to full JSON result
    markdown = Column(Text, nullable=True)  # Cached markdown for quick access

    # Metadata
    chunk_count = Column(Integer, nullable=True)
    page_count = Column(Integer, nullable=True)
    credit_usage = Column(Integer, nullable=True)  # Landing AI credits
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)

    # Status
    status = Column(String(20), default="completed")  # pending, processing, completed, failed
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    processing_time_ms = Column(Integer, nullable=True)

    # Relationships
    document = relationship("Document", back_populates="parse_results")
    chunks = relationship("Chunk", back_populates="parse_result", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_parse_results_document_id", "document_id"),
        Index("ix_parse_results_parser", "parser"),
        Index("ix_parse_results_document_parser", "document_id", "parser"),
    )


class Chunk(Base):
    """Individual chunks extracted from a document parse."""
    __tablename__ = "chunks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    parse_result_id = Column(String(36), ForeignKey("parse_results.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)  # Order in document
    chunk_id = Column(String(100), nullable=False)  # Original chunk ID from parser

    # Content
    markdown = Column(Text, nullable=True)
    chunk_type = Column(String(50), nullable=True)  # text, table, figure, heading, etc.

    # Grounding/location
    page_number = Column(Integer, nullable=True)
    bbox_left = Column(Float, nullable=True)
    bbox_top = Column(Float, nullable=True)
    bbox_right = Column(Float, nullable=True)
    bbox_bottom = Column(Float, nullable=True)

    # Relationships
    parse_result = relationship("ParseResult", back_populates="chunks")

    __table_args__ = (
        Index("ix_chunks_parse_result_id", "parse_result_id"),
        Index("ix_chunks_page_number", "page_number"),
    )


class ComplianceResult(Base):
    """Cached compliance check results for a document."""
    __tablename__ = "compliance_results"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    parse_result_id = Column(String(36), ForeignKey("parse_results.id", ondelete="SET NULL"), nullable=True)

    # Check configuration used
    checks_config = Column(JSON, nullable=True)  # The checks that were run

    # Results
    s3_result_key = Column(String(500), nullable=True)  # S3 path to full result
    summary = Column(JSON, nullable=True)  # Quick summary: pass/fail counts

    # Usage
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    model = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_compliance_results_document_id", "document_id"),
    )


class ChatSession(Base):
    """Chat sessions for document Q&A."""
    __tablename__ = "chat_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Usage totals
    total_input_tokens = Column(Integer, default=0)
    total_output_tokens = Column(Integer, default=0)

    # Relationships
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_chat_sessions_document_id", "document_id"),
    )


class ChatMessage(Base):
    """Individual messages in a chat session."""
    __tablename__ = "chat_messages"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    chunk_ids = Column(JSON, nullable=True)  # Referenced chunks

    # Usage for this message
    input_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    session = relationship("ChatSession", back_populates="messages")

    __table_args__ = (
        Index("ix_chat_messages_session_id", "session_id"),
    )


class DocumentAnnotation(Base):
    """Sticky note annotations on documents for review workflow."""
    __tablename__ = "document_annotations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    chunk_id = Column(String(100), nullable=True)  # Optional: attach to specific chunk

    # Annotation scope level
    level = Column(String(20), nullable=False)  # page, document, project

    # Location (for page-level annotations)
    page_number = Column(Integer, nullable=True)
    bbox_left = Column(Float, nullable=True)
    bbox_top = Column(Float, nullable=True)
    bbox_right = Column(Float, nullable=True)
    bbox_bottom = Column(Float, nullable=True)

    # Content
    text = Column(Text, nullable=False)
    title = Column(String(255), nullable=True)
    color = Column(String(50), default="yellow")  # yellow, blue, green based on level

    # Classification
    annotation_type = Column(String(50), default="comment")  # comment, question, issue, suggestion
    status = Column(String(20), default="open")  # open, resolved, archived
    priority = Column(String(20), default="normal")  # low, normal, high, critical

    # Metadata
    author = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_annotations_project_id", "project_id"),
        Index("ix_annotations_document_id", "document_id"),
        Index("ix_annotations_level", "level"),
        Index("ix_annotations_status", "status"),
    )


class BatchJob(Base):
    """Batch processing job for multiple documents."""
    __tablename__ = "batch_jobs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    # Configuration
    parser = Column(String(50), nullable=False)  # landing_ai, claude_vision, etc.
    model = Column(String(100), nullable=True)

    # Progress tracking
    status = Column(String(30), default="pending")  # pending, processing, completed, completed_with_errors, failed, cancelled
    total_documents = Column(Integer, default=0)
    completed_documents = Column(Integer, default=0)
    failed_documents = Column(Integer, default=0)

    # Error tracking
    error_message = Column(Text, nullable=True)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    tasks = relationship("BatchTask", back_populates="batch_job", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_batch_jobs_project_id", "project_id"),
        Index("ix_batch_jobs_status", "status"),
    )


class BatchTask(Base):
    """Individual document task within a batch job."""
    __tablename__ = "batch_tasks"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    batch_job_id = Column(String(36), ForeignKey("batch_jobs.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)

    # Status
    status = Column(String(20), default="pending")  # pending, processing, completed, failed, skipped
    progress = Column(Integer, default=0)  # 0-100 percentage

    # Result reference
    parse_result_id = Column(String(36), ForeignKey("parse_results.id", ondelete="SET NULL"), nullable=True)

    # Error tracking
    error_message = Column(Text, nullable=True)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    batch_job = relationship("BatchJob", back_populates="tasks")

    __table_args__ = (
        Index("ix_batch_tasks_batch_job_id", "batch_job_id"),
        Index("ix_batch_tasks_document_id", "document_id"),
        Index("ix_batch_tasks_status", "status"),
    )


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

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

    # Relationships
    project = relationship("Project", back_populates="documents")
    parse_results = relationship("ParseResult", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_documents_project_id", "project_id"),
        Index("ix_documents_file_hash", "file_hash"),
        Index("ix_documents_created_at", "created_at"),
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

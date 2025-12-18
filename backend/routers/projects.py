"""API endpoints for project management."""
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.database_models import Project, Document, ParseResult
from services import s3_service

router = APIRouter()


# Pydantic models for API
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    created_at: datetime
    created_by: Optional[str]
    document_count: int = 0

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int


class UsageByParser(BaseModel):
    parser: str
    parse_count: int
    input_tokens: int
    output_tokens: int
    credit_usage: int
    estimated_cost: float


class ProjectUsageResponse(BaseModel):
    project_id: str
    project_name: str
    document_count: int
    total_parses: int
    total_input_tokens: int
    total_output_tokens: int
    total_credit_usage: int
    estimated_total_cost: float
    usage_by_parser: List[UsageByParser]


# Cost estimates per 1M tokens (approximate)
COST_PER_MILLION_TOKENS = {
    "landing_ai": {"input": 0.0, "output": 0.0, "credit_cost": 0.01},  # Per credit
    "claude_vision": {"input": 3.0, "output": 15.0},
    "bedrock_claude": {"input": 3.0, "output": 15.0},
    "gemini_vision": {"input": 0.075, "output": 0.30},
}


def calculate_cost(parser: str, input_tokens: int, output_tokens: int, credits: int) -> float:
    """Calculate estimated cost based on parser and usage."""
    costs = COST_PER_MILLION_TOKENS.get(parser, {"input": 3.0, "output": 15.0})

    if parser == "landing_ai":
        return credits * costs.get("credit_cost", 0.01)

    input_cost = (input_tokens / 1_000_000) * costs.get("input", 0)
    output_cost = (output_tokens / 1_000_000) * costs.get("output", 0)
    return round(input_cost + output_cost, 4)


# Endpoints
@router.get("", response_model=ProjectListResponse)
async def list_projects(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all projects."""
    projects = db.query(Project).order_by(Project.created_at.desc()).offset(skip).limit(limit).all()
    total = db.query(Project).count()

    # Add document counts
    project_responses = []
    for project in projects:
        doc_count = db.query(Document).filter(Document.project_id == project.id).count()
        project_responses.append(ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            created_at=project.created_at,
            created_by=project.created_by,
            document_count=doc_count
        ))

    return ProjectListResponse(projects=project_responses, total=total)


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project: ProjectCreate,
    db: Session = Depends(get_db)
):
    """Create a new project."""
    db_project = Project(
        name=project.name,
        description=project.description,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    return ProjectResponse(
        id=db_project.id,
        name=db_project.name,
        description=db_project.description,
        created_at=db_project.created_at,
        created_by=db_project.created_by,
        document_count=0
    )


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific project by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    doc_count = db.query(Document).filter(Document.project_id == project.id).count()

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        created_by=project.created_by,
        document_count=doc_count
    )


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_update: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """Update a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project_update.name is not None:
        project.name = project_update.name
    if project_update.description is not None:
        project.description = project_update.description

    db.commit()
    db.refresh(project)

    doc_count = db.query(Document).filter(Document.project_id == project.id).count()

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        created_by=project.created_by,
        document_count=doc_count
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Delete a project and all its documents."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Delete S3 files
    try:
        s3_service.delete_project_folder(project_id)
    except Exception as e:
        # Log but don't fail if S3 cleanup fails
        print(f"Warning: Failed to delete S3 files for project {project_id}: {e}")

    # Delete from database (cascades to documents, parse_results, chunks)
    db.delete(project)
    db.commit()

    return None


@router.get("/{project_id}/usage", response_model=ProjectUsageResponse)
async def get_project_usage(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get usage statistics for a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    doc_count = db.query(Document).filter(Document.project_id == project.id).count()

    # Get all document IDs for this project
    doc_ids = db.query(Document.id).filter(Document.project_id == project_id).subquery()

    # Aggregate usage by parser
    usage_query = db.query(
        ParseResult.parser,
        func.count(ParseResult.id).label("parse_count"),
        func.coalesce(func.sum(ParseResult.input_tokens), 0).label("input_tokens"),
        func.coalesce(func.sum(ParseResult.output_tokens), 0).label("output_tokens"),
        func.coalesce(func.sum(ParseResult.credit_usage), 0).label("credit_usage"),
    ).filter(
        ParseResult.document_id.in_(doc_ids)
    ).group_by(ParseResult.parser).all()

    usage_by_parser = []
    total_input = 0
    total_output = 0
    total_credits = 0
    total_parses = 0
    total_cost = 0.0

    for row in usage_query:
        parser = row.parser or "unknown"
        input_tokens = int(row.input_tokens or 0)
        output_tokens = int(row.output_tokens or 0)
        credits = int(row.credit_usage or 0)
        parse_count = int(row.parse_count or 0)

        cost = calculate_cost(parser, input_tokens, output_tokens, credits)

        usage_by_parser.append(UsageByParser(
            parser=parser,
            parse_count=parse_count,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            credit_usage=credits,
            estimated_cost=cost,
        ))

        total_input += input_tokens
        total_output += output_tokens
        total_credits += credits
        total_parses += parse_count
        total_cost += cost

    return ProjectUsageResponse(
        project_id=project.id,
        project_name=project.name,
        document_count=doc_count,
        total_parses=total_parses,
        total_input_tokens=total_input,
        total_output_tokens=total_output,
        total_credit_usage=total_credits,
        estimated_total_cost=round(total_cost, 4),
        usage_by_parser=usage_by_parser,
    )

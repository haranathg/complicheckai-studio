"""API endpoints for project management."""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.database_models import Project, Document
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

"""API endpoints for document annotations (sticky notes for review workflow)."""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.database_models import Project, Document, DocumentAnnotation
from auth import CognitoUser, get_current_user, get_optional_user

router = APIRouter()


# Pydantic models for API
class BoundingBox(BaseModel):
    left: float
    top: float
    right: float
    bottom: float


class AnnotationCreate(BaseModel):
    document_id: Optional[str] = None
    chunk_id: Optional[str] = None
    level: str  # page, document, project
    page_number: Optional[int] = None
    bbox: Optional[BoundingBox] = None
    text: str
    title: Optional[str] = None
    color: Optional[str] = None
    annotation_type: Optional[str] = "comment"
    priority: Optional[str] = "normal"
    author: Optional[str] = None


class AnnotationUpdate(BaseModel):
    text: Optional[str] = None
    title: Optional[str] = None
    color: Optional[str] = None
    annotation_type: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None


class AnnotationResponse(BaseModel):
    id: str
    project_id: str
    document_id: Optional[str]
    chunk_id: Optional[str]
    level: str
    page_number: Optional[int]
    bbox: Optional[BoundingBox]
    text: str
    title: Optional[str]
    color: str
    annotation_type: str
    status: str
    priority: str
    author: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AnnotationListResponse(BaseModel):
    annotations: List[AnnotationResponse]
    total: int


# Helper function
def annotation_to_response(annotation: DocumentAnnotation) -> AnnotationResponse:
    """Convert database model to response."""
    bbox = None
    if annotation.bbox_left is not None:
        bbox = BoundingBox(
            left=annotation.bbox_left,
            top=annotation.bbox_top,
            right=annotation.bbox_right,
            bottom=annotation.bbox_bottom
        )

    return AnnotationResponse(
        id=annotation.id,
        project_id=annotation.project_id,
        document_id=annotation.document_id,
        chunk_id=annotation.chunk_id,
        level=annotation.level,
        page_number=annotation.page_number,
        bbox=bbox,
        text=annotation.text,
        title=annotation.title,
        color=annotation.color or "yellow",
        annotation_type=annotation.annotation_type or "comment",
        status=annotation.status or "open",
        priority=annotation.priority or "normal",
        author=annotation.author,
        created_at=annotation.created_at,
        updated_at=annotation.updated_at
    )


# Endpoints
@router.post("/{project_id}/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
async def create_annotation(
    project_id: str,
    annotation: AnnotationCreate,
    db: Session = Depends(get_db),
    user: CognitoUser = Depends(get_current_user)
):
    """Create a new annotation in a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify document exists if provided
    if annotation.document_id:
        document = db.query(Document).filter(
            Document.id == annotation.document_id,
            Document.project_id == project_id
        ).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found in project")

    # Validate level
    if annotation.level not in ["page", "document", "project"]:
        raise HTTPException(status_code=400, detail="Level must be 'page', 'document', or 'project'")

    # Set default color based on level
    # Colors should match frontend: page=yellow, document=green, project=blue
    color = annotation.color
    if not color:
        color_map = {"page": "yellow", "document": "green", "project": "blue"}
        color = color_map.get(annotation.level, "yellow")

    # Auto-populate author from authenticated user
    author = user.display_name if user else annotation.author

    # Create annotation
    db_annotation = DocumentAnnotation(
        project_id=project_id,
        document_id=annotation.document_id,
        chunk_id=annotation.chunk_id,
        level=annotation.level,
        page_number=annotation.page_number,
        bbox_left=annotation.bbox.left if annotation.bbox else None,
        bbox_top=annotation.bbox.top if annotation.bbox else None,
        bbox_right=annotation.bbox.right if annotation.bbox else None,
        bbox_bottom=annotation.bbox.bottom if annotation.bbox else None,
        text=annotation.text,
        title=annotation.title,
        color=color,
        annotation_type=annotation.annotation_type or "comment",
        priority=annotation.priority or "normal",
        author=author
    )
    db.add(db_annotation)
    db.commit()
    db.refresh(db_annotation)

    return annotation_to_response(db_annotation)


@router.get("/{project_id}/annotations", response_model=AnnotationListResponse)
async def list_project_annotations(
    project_id: str,
    level: Optional[str] = None,
    status: Optional[str] = None,
    document_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List annotations in a project with optional filters."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(DocumentAnnotation).filter(DocumentAnnotation.project_id == project_id)

    if level:
        query = query.filter(DocumentAnnotation.level == level)
    if status:
        query = query.filter(DocumentAnnotation.status == status)
    if document_id:
        query = query.filter(DocumentAnnotation.document_id == document_id)

    total = query.count()
    annotations = query.order_by(DocumentAnnotation.created_at.desc()).offset(skip).limit(limit).all()

    return AnnotationListResponse(
        annotations=[annotation_to_response(a) for a in annotations],
        total=total
    )


@router.get("/{project_id}/documents/{document_id}/annotations", response_model=AnnotationListResponse)
async def list_document_annotations(
    project_id: str,
    document_id: str,
    level: Optional[str] = None,
    status: Optional[str] = None,
    page_number: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """List annotations for a specific document."""
    # Verify document exists in project
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found in project")

    query = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.project_id == project_id,
        DocumentAnnotation.document_id == document_id
    )

    if level:
        query = query.filter(DocumentAnnotation.level == level)
    if status:
        query = query.filter(DocumentAnnotation.status == status)
    if page_number is not None:
        query = query.filter(DocumentAnnotation.page_number == page_number)

    annotations = query.order_by(DocumentAnnotation.created_at.desc()).all()

    # Also include document-level and project-level annotations
    # These don't have a page_number but should still be visible
    doc_level_annotations = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.project_id == project_id,
        DocumentAnnotation.document_id == document_id,
        DocumentAnnotation.level == "document"
    ).all()

    project_annotations = db.query(DocumentAnnotation).filter(
        DocumentAnnotation.project_id == project_id,
        DocumentAnnotation.level == "project"
    ).all()

    # Combine all annotations, avoiding duplicates
    all_annotations = list(annotations)
    for a in doc_level_annotations:
        if a not in all_annotations:
            all_annotations.append(a)
    for a in project_annotations:
        if a not in all_annotations:
            all_annotations.append(a)

    return AnnotationListResponse(
        annotations=[annotation_to_response(a) for a in all_annotations],
        total=len(all_annotations)
    )


@router.get("/annotations/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific annotation."""
    annotation = db.query(DocumentAnnotation).filter(DocumentAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    return annotation_to_response(annotation)


@router.patch("/annotations/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: str,
    update: AnnotationUpdate,
    db: Session = Depends(get_db)
):
    """Update an annotation."""
    annotation = db.query(DocumentAnnotation).filter(DocumentAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    # Update fields if provided
    if update.text is not None:
        annotation.text = update.text
    if update.title is not None:
        annotation.title = update.title
    if update.color is not None:
        annotation.color = update.color
    if update.annotation_type is not None:
        annotation.annotation_type = update.annotation_type
    if update.status is not None:
        annotation.status = update.status
    if update.priority is not None:
        annotation.priority = update.priority

    db.commit()
    db.refresh(annotation)

    return annotation_to_response(annotation)


@router.delete("/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annotation(
    annotation_id: str,
    db: Session = Depends(get_db)
):
    """Delete an annotation."""
    annotation = db.query(DocumentAnnotation).filter(DocumentAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    db.delete(annotation)
    db.commit()
    return None


@router.post("/annotations/{annotation_id}/resolve", response_model=AnnotationResponse)
async def resolve_annotation(
    annotation_id: str,
    db: Session = Depends(get_db)
):
    """Mark an annotation as resolved."""
    annotation = db.query(DocumentAnnotation).filter(DocumentAnnotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    annotation.status = "resolved"
    db.commit()
    db.refresh(annotation)

    return annotation_to_response(annotation)

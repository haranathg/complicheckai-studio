"""API endpoints for document management within projects."""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.database_models import Project, Document, ParseResult, Chunk
from services import s3_service

router = APIRouter()


# Pydantic models for API
class ParseResultSummary(BaseModel):
    id: str
    parser: str
    model: Optional[str]
    status: str
    chunk_count: Optional[int]
    page_count: Optional[int]
    credit_usage: Optional[int]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    original_filename: str
    content_type: Optional[str]
    file_size: Optional[int]
    page_count: Optional[int]
    created_at: datetime
    uploaded_by: Optional[str]
    parse_results: List[ParseResultSummary] = []
    has_cached_result: bool = False
    latest_parser: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class ChunkResponse(BaseModel):
    id: str
    chunk_index: int
    chunk_id: str
    markdown: Optional[str]
    chunk_type: Optional[str]
    page_number: Optional[int]
    bbox_left: Optional[float]
    bbox_top: Optional[float]
    bbox_right: Optional[float]
    bbox_bottom: Optional[float]

    class Config:
        from_attributes = True


class FullParseResultResponse(BaseModel):
    id: str
    document_id: str
    parser: str
    model: Optional[str]
    status: str
    markdown: Optional[str]
    chunk_count: Optional[int]
    page_count: Optional[int]
    credit_usage: Optional[int]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    created_at: datetime
    chunks: List[ChunkResponse] = []

    class Config:
        from_attributes = True


# Helper functions
def get_document_response(document: Document, db: Session) -> DocumentResponse:
    """Convert Document model to response with parse result summaries."""
    parse_results = db.query(ParseResult).filter(
        ParseResult.document_id == document.id,
        ParseResult.status == "completed"
    ).order_by(ParseResult.created_at.desc()).all()

    parse_summaries = [
        ParseResultSummary(
            id=pr.id,
            parser=pr.parser,
            model=pr.model,
            status=pr.status,
            chunk_count=pr.chunk_count,
            page_count=pr.page_count,
            credit_usage=pr.credit_usage,
            input_tokens=pr.input_tokens,
            output_tokens=pr.output_tokens,
            created_at=pr.created_at
        )
        for pr in parse_results
    ]

    return DocumentResponse(
        id=document.id,
        project_id=document.project_id,
        filename=document.filename,
        original_filename=document.original_filename,
        content_type=document.content_type,
        file_size=document.file_size,
        page_count=document.page_count,
        created_at=document.created_at,
        uploaded_by=document.uploaded_by,
        parse_results=parse_summaries,
        has_cached_result=len(parse_results) > 0,
        latest_parser=parse_results[0].parser if parse_results else None
    )


# Endpoints
@router.get("/{project_id}/documents", response_model=DocumentListResponse)
async def list_documents(
    project_id: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all documents in a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = db.query(Document).filter(
        Document.project_id == project_id
    ).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

    total = db.query(Document).filter(Document.project_id == project_id).count()

    doc_responses = [get_document_response(doc, db) for doc in documents]

    return DocumentListResponse(documents=doc_responses, total=total)


@router.post("/{project_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload a new document to a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)

    # Compute hash for deduplication
    file_hash = s3_service.compute_file_hash(file_content)

    # Check if this exact file already exists in the project
    existing_doc = db.query(Document).filter(
        Document.project_id == project_id,
        Document.file_hash == file_hash
    ).first()

    if existing_doc:
        # Return existing document instead of creating duplicate
        return get_document_response(existing_doc, db)

    # Create document record first to get ID
    document = Document(
        project_id=project_id,
        filename=file.filename or "document",
        original_filename=file.filename or "document",
        content_type=file.content_type,
        file_size=file_size,
        file_hash=file_hash,
        s3_key="",  # Will update after upload
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Upload to S3
    try:
        s3_key = s3_service.upload_document(
            project_id=project_id,
            document_id=document.id,
            filename=file.filename or "document",
            file_content=file_content,
            content_type=file.content_type or "application/octet-stream"
        )
        document.s3_key = s3_key
        db.commit()
    except Exception as e:
        # Cleanup on failure
        db.delete(document)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

    return get_document_response(document, db)


@router.get("/{project_id}/documents/{document_id}", response_model=DocumentResponse)
async def get_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific document."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return get_document_response(document, db)


@router.get("/{project_id}/documents/{document_id}/download")
async def download_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get a presigned URL to download the document."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        url = s3_service.get_presigned_url(document.s3_key)
        return {"url": url, "filename": document.original_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")


@router.get("/{project_id}/documents/{document_id}/file")
async def get_document_file(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Download the actual document file content."""
    from fastapi.responses import Response

    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        content = s3_service.download_document(document.s3_key)
        return Response(
            content=content,
            media_type=document.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{document.original_filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {str(e)}")


@router.delete("/{project_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Delete a document and all its parse results."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete S3 files
    try:
        s3_service.delete_document_folder(project_id, document_id)
    except Exception as e:
        print(f"Warning: Failed to delete S3 files for document {document_id}: {e}")

    # Delete from database
    db.delete(document)
    db.commit()

    return None


@router.get("/{project_id}/documents/{document_id}/parse-results", response_model=List[ParseResultSummary])
async def list_parse_results(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """List all parse results for a document."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    parse_results = db.query(ParseResult).filter(
        ParseResult.document_id == document_id
    ).order_by(ParseResult.created_at.desc()).all()

    return [
        ParseResultSummary(
            id=pr.id,
            parser=pr.parser,
            model=pr.model,
            status=pr.status,
            chunk_count=pr.chunk_count,
            page_count=pr.page_count,
            credit_usage=pr.credit_usage,
            input_tokens=pr.input_tokens,
            output_tokens=pr.output_tokens,
            created_at=pr.created_at
        )
        for pr in parse_results
    ]


@router.get("/{project_id}/documents/{document_id}/parse-results/{result_id}", response_model=FullParseResultResponse)
async def get_parse_result(
    project_id: str,
    document_id: str,
    result_id: str,
    db: Session = Depends(get_db)
):
    """Get a specific parse result with all chunks."""
    parse_result = db.query(ParseResult).filter(
        ParseResult.id == result_id,
        ParseResult.document_id == document_id
    ).first()

    if not parse_result:
        raise HTTPException(status_code=404, detail="Parse result not found")

    # Verify document belongs to project
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found in project")

    chunks = db.query(Chunk).filter(
        Chunk.parse_result_id == result_id
    ).order_by(Chunk.chunk_index).all()

    return FullParseResultResponse(
        id=parse_result.id,
        document_id=parse_result.document_id,
        parser=parse_result.parser,
        model=parse_result.model,
        status=parse_result.status,
        markdown=parse_result.markdown,
        chunk_count=parse_result.chunk_count,
        page_count=parse_result.page_count,
        credit_usage=parse_result.credit_usage,
        input_tokens=parse_result.input_tokens,
        output_tokens=parse_result.output_tokens,
        created_at=parse_result.created_at,
        chunks=[
            ChunkResponse(
                id=c.id,
                chunk_index=c.chunk_index,
                chunk_id=c.chunk_id,
                markdown=c.markdown,
                chunk_type=c.chunk_type,
                page_number=c.page_number,
                bbox_left=c.bbox_left,
                bbox_top=c.bbox_top,
                bbox_right=c.bbox_right,
                bbox_bottom=c.bbox_bottom
            )
            for c in chunks
        ]
    )


@router.get("/{project_id}/documents/{document_id}/latest-parse")
async def get_latest_parse_result(
    project_id: str,
    document_id: str,
    parser: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get the latest parse result for a document, optionally filtered by parser."""
    # Verify document belongs to project
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    query = db.query(ParseResult).filter(
        ParseResult.document_id == document_id,
        ParseResult.status == "completed"
    )

    if parser:
        query = query.filter(ParseResult.parser == parser)

    parse_result = query.order_by(ParseResult.created_at.desc()).first()

    if not parse_result:
        return {"cached": False, "result": None}

    chunks = db.query(Chunk).filter(
        Chunk.parse_result_id == parse_result.id
    ).order_by(Chunk.chunk_index).all()

    # Return in the same format as the parse endpoint
    return {
        "cached": True,
        "result": {
            "markdown": parse_result.markdown,
            "chunks": [
                {
                    "id": c.chunk_id,
                    "markdown": c.markdown,
                    "type": c.chunk_type,
                    "grounding": {
                        "box": {
                            "left": c.bbox_left,
                            "top": c.bbox_top,
                            "right": c.bbox_right,
                            "bottom": c.bbox_bottom
                        },
                        "page": c.page_number - 1 if c.page_number else 0  # Convert to 0-indexed
                    } if c.page_number is not None else None
                }
                for c in chunks
            ],
            "metadata": {
                "page_count": parse_result.page_count,
                "credit_usage": parse_result.credit_usage,
                "parser": parse_result.parser,
                "model": parse_result.model,
                "usage": {
                    "input_tokens": parse_result.input_tokens or 0,
                    "output_tokens": parse_result.output_tokens or 0,
                    "model": parse_result.model
                } if parse_result.input_tokens else None
            },
            "parse_result_id": parse_result.id
        }
    }

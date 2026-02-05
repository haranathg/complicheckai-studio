"""API endpoints for document management within projects."""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models.database_models import Project, Document, ParseResult, Chunk, DocumentAnnotation, ProjectSettings, CheckResult, PageClassification
from services import s3_service
from services.config_service import load_default_checks_config, list_document_types
from services.classification_service import classify_document as classify_document_service
from routers.compliance import get_bedrock_client, resolve_model_id
from auth import CognitoUser, get_current_user, get_optional_user
import json

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


# Document Status Summary models and endpoint
# NOTE: This must be defined before routes with {document_id} to avoid route conflict
class AnnotationSummary(BaseModel):
    total: int
    open: int
    resolved: int
    last_updated_at: Optional[datetime] = None
    last_comment_preview: Optional[str] = None


class CheckSummary(BaseModel):
    """Summary of check results for a document."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    needs_review: int = 0
    checked_at: Optional[datetime] = None


class DocumentStatusSummary(BaseModel):
    id: str
    project_id: str
    original_filename: str
    content_type: Optional[str]
    file_size: Optional[int]
    page_count: Optional[int]
    created_at: datetime
    processed_at: Optional[datetime] = None
    parser: Optional[str] = None
    parser_model: Optional[str] = None
    uploaded_by: Optional[str] = None
    annotations: AnnotationSummary
    # V2 Classification fields (document-level)
    document_type: Optional[str] = None
    classification_confidence: Optional[int] = None
    classification_override: bool = False
    # V3 Page-level types (list of unique page types in this document)
    page_types: List[str] = []
    # V2 Check results summary
    check_summary: Optional[CheckSummary] = None

    class Config:
        from_attributes = True


class DocumentStatusListResponse(BaseModel):
    documents: List[DocumentStatusSummary]
    total: int


@router.get("/{project_id}/documents/status", response_model=DocumentStatusListResponse)
async def get_documents_status(
    project_id: str,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get status summary for all documents in a project including annotation counts."""
    print(f"[get_documents_status] Called for project_id={project_id}")
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get all documents for the project
    documents = db.query(Document).filter(
        Document.project_id == project_id
    ).order_by(Document.created_at.desc()).offset(skip).limit(limit).all()

    total = db.query(Document).filter(Document.project_id == project_id).count()

    result = []
    for doc in documents:
        # Get latest parse result
        latest_parse = db.query(ParseResult).filter(
            ParseResult.document_id == doc.id,
            ParseResult.status == "completed"
        ).order_by(ParseResult.created_at.desc()).first()

        # Get annotation counts for this document
        doc_annotations = db.query(DocumentAnnotation).filter(
            DocumentAnnotation.document_id == doc.id
        ).all()

        total_annotations = len(doc_annotations)
        open_count = sum(1 for a in doc_annotations if a.status == "open")
        resolved_count = sum(1 for a in doc_annotations if a.status == "resolved")

        # Get most recent annotation
        last_annotation = max(doc_annotations, key=lambda a: a.updated_at) if doc_annotations else None

        # Get latest check result for this document
        latest_check = db.query(CheckResult).filter(
            CheckResult.document_id == doc.id,
            CheckResult.status == "completed"
        ).order_by(CheckResult.created_at.desc()).first()

        check_summary = None
        if latest_check and latest_check.summary:
            summary = latest_check.summary
            check_summary = CheckSummary(
                total=summary.get("total_checks", 0),
                passed=summary.get("passed", 0),
                failed=summary.get("failed", 0),
                needs_review=summary.get("needs_review", 0),
                checked_at=latest_check.created_at
            )

        # Get V3 page-level types from latest parse result
        page_types = []
        if latest_parse:
            page_classifications = db.query(PageClassification).filter(
                PageClassification.parse_result_id == latest_parse.id
            ).all()
            # Get unique page types, preserving order of first occurrence
            seen = set()
            for pc in page_classifications:
                if pc.page_type not in seen:
                    page_types.append(pc.page_type)
                    seen.add(pc.page_type)

        result.append(DocumentStatusSummary(
            id=doc.id,
            project_id=doc.project_id,
            original_filename=doc.original_filename,
            content_type=doc.content_type,
            file_size=doc.file_size,
            page_count=latest_parse.page_count if latest_parse else doc.page_count,
            created_at=doc.created_at,
            processed_at=latest_parse.created_at if latest_parse else None,
            parser=latest_parse.parser if latest_parse else None,
            parser_model=latest_parse.model if latest_parse else None,
            uploaded_by=doc.uploaded_by,
            annotations=AnnotationSummary(
                total=total_annotations,
                open=open_count,
                resolved=resolved_count,
                last_updated_at=last_annotation.updated_at if last_annotation else None,
                last_comment_preview=last_annotation.text[:100] if last_annotation else None
            ),
            # V2 fields
            document_type=doc.document_type,
            classification_confidence=doc.classification_confidence,
            classification_override=doc.classification_override or False,
            # V3 page types
            page_types=page_types,
            check_summary=check_summary
        ))

    print(f"[get_documents_status] Returning {len(result)} documents, total={total}")
    return DocumentStatusListResponse(documents=result, total=total)


class DuplicateDocumentResponse(BaseModel):
    """Response when a duplicate document is detected."""
    is_duplicate: bool
    existing_document: Optional[DocumentResponse] = None
    duplicate_type: Optional[str] = None  # 'exact' (same hash) or 'filename' (same name)
    message: Optional[str] = None


@router.post("/{project_id}/documents/check-duplicate")
async def check_duplicate_document(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Check if a document would be a duplicate before uploading."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read file content
    file_content = await file.read()
    file_hash = s3_service.compute_file_hash(file_content)

    # Check for exact duplicate (same content)
    exact_match = db.query(Document).filter(
        Document.project_id == project_id,
        Document.file_hash == file_hash
    ).first()

    if exact_match:
        return DuplicateDocumentResponse(
            is_duplicate=True,
            existing_document=get_document_response(exact_match, db),
            duplicate_type="exact",
            message=f"A file with identical content already exists: '{exact_match.original_filename}' (uploaded {exact_match.created_at.strftime('%Y-%m-%d %H:%M')})"
        )

    # Check for filename duplicate
    filename_match = db.query(Document).filter(
        Document.project_id == project_id,
        Document.original_filename == file.filename
    ).first()

    if filename_match:
        return DuplicateDocumentResponse(
            is_duplicate=True,
            existing_document=get_document_response(filename_match, db),
            duplicate_type="filename",
            message=f"A file named '{file.filename}' already exists (uploaded {filename_match.created_at.strftime('%Y-%m-%d %H:%M')}). Do you want to replace it?"
        )

    return DuplicateDocumentResponse(is_duplicate=False)


@router.post("/{project_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    replace_existing: bool = False,
    db: Session = Depends(get_db),
    user: CognitoUser = Depends(get_current_user)
):
    """Upload a new document to a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Read file content
    file_content = await file.read()
    file_size = len(file_content)

    print(f"Upload: file={file.filename}, size={file_size}, replace={replace_existing}")

    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file received. Please try uploading again.")

    # Compute hash for deduplication
    file_hash = s3_service.compute_file_hash(file_content)

    # Check if this exact file already exists in the project
    existing_doc = db.query(Document).filter(
        Document.project_id == project_id,
        Document.file_hash == file_hash
    ).first()

    if existing_doc:
        # Return existing document instead of creating duplicate
        print(f"Exact duplicate found: {existing_doc.id}")
        return get_document_response(existing_doc, db)

    # Check for filename duplicate
    filename_match = db.query(Document).filter(
        Document.project_id == project_id,
        Document.original_filename == file.filename
    ).first()

    if filename_match:
        if replace_existing:
            # Delete the old document first
            print(f"Replacing existing document: {filename_match.id}")
            try:
                s3_service.delete_document_folder(project_id, filename_match.id)
            except Exception as e:
                print(f"Warning: Failed to delete S3 files for document {filename_match.id}: {e}")
            db.delete(filename_match)
            db.commit()
        else:
            print(f"Filename conflict: {file.filename}")
            raise HTTPException(
                status_code=409,
                detail={
                    "message": f"A file named '{file.filename}' already exists",
                    "existing_document_id": filename_match.id,
                    "uploaded_at": filename_match.created_at.isoformat()
                }
            )

    # Create document record first to get ID
    document = Document(
        project_id=project_id,
        filename=file.filename or "document",
        original_filename=file.filename or "document",
        content_type=file.content_type,
        file_size=file_size,
        file_hash=file_hash,
        s3_key="",  # Will update after upload
        uploaded_by=user.display_name if user else None,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    # Upload to S3
    try:
        print(f"Uploading to S3: {document.id}")
        s3_key = s3_service.upload_document(
            project_id=project_id,
            document_id=document.id,
            filename=file.filename or "document",
            file_content=file_content,
            content_type=file.content_type or "application/octet-stream"
        )
        document.s3_key = s3_key
        db.commit()
        print(f"Upload successful: {s3_key}")
    except Exception as e:
        # Cleanup on failure
        print(f"S3 upload failed: {e}")
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
        print(f"[get_document_file] Downloading document {document_id} from S3 key: {document.s3_key}")
        content = s3_service.download_document(document.s3_key)
        print(f"[get_document_file] Successfully downloaded {len(content)} bytes for document {document_id}")
        return Response(
            content=content,
            media_type=document.content_type or "application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{document.original_filename}"'
            }
        )
    except Exception as e:
        error_str = str(e)
        error_type = type(e).__name__
        print(f"[get_document_file] ERROR downloading document {document_id}: {error_type}: {error_str}")
        # Provide more helpful error messages
        if "NoSuchKey" in error_str:
            raise HTTPException(status_code=404, detail="Document file not found in storage. It may have been deleted.")
        elif "ExpiredToken" in error_str or "InvalidAccessKeyId" in error_str:
            raise HTTPException(status_code=503, detail="Storage authentication error. Please try again.")
        elif "ConnectionError" in error_str or "ConnectTimeout" in error_str:
            raise HTTPException(status_code=503, detail="Storage service temporarily unavailable. Please try again.")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to download file: {error_str}")


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
                "parsed_at": parse_result.created_at.isoformat() if parse_result.created_at else None,
                "parsed_by": document.uploaded_by,
                "usage": {
                    "input_tokens": parse_result.input_tokens or 0,
                    "output_tokens": parse_result.output_tokens or 0,
                    "model": parse_result.model
                } if parse_result.input_tokens else None
            },
            "parse_result_id": parse_result.id
        }
    }


# ============ DOCUMENT CLASSIFICATION ENDPOINTS ============

class ClassificationOverride(BaseModel):
    document_type: str


class ClassificationResult(BaseModel):
    document_type: str
    confidence: int
    signals_found: List[str]


@router.get("/document-types")
async def get_document_types():
    """List available document types for classification."""
    return {"document_types": list_document_types()}


@router.post("/{project_id}/documents/{document_id}/classify", response_model=ClassificationResult)
async def classify_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Auto-classify a document using AI."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get latest parse result
    parse_result = db.query(ParseResult).filter(
        ParseResult.document_id == document_id,
        ParseResult.status == "completed"
    ).order_by(ParseResult.created_at.desc()).first()

    if not parse_result:
        raise HTTPException(status_code=400, detail="Document must be parsed first")

    try:
        # Use classification service
        result = await classify_document_service(document, parse_result, db)

        return ClassificationResult(
            document_type=document.document_type,
            confidence=document.classification_confidence,
            signals_found=document.classification_signals or []
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@router.patch("/{project_id}/documents/{document_id}/classification")
async def override_classification(
    project_id: str,
    document_id: str,
    body: ClassificationOverride,
    db: Session = Depends(get_db)
):
    """Manually override document classification."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.document_type = body.document_type
    document.classification_override = True
    document.classification_confidence = 100

    db.commit()

    return {"status": "updated", "document_type": body.document_type}


@router.get("/{project_id}/documents/{document_id}/classification")
async def get_document_classification(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get current document classification."""
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.project_id == project_id
    ).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    return {
        "document_type": document.document_type,
        "confidence": document.classification_confidence,
        "signals_found": document.classification_signals,
        "is_override": document.classification_override,
        "model": document.classification_model
    }

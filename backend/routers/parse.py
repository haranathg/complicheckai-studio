from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from typing import Optional
from sqlalchemy.orm import Session
from services.ade_service import ade_service
from services.claude_vision_service import get_claude_vision_service
from services.gemini_vision_service import get_gemini_vision_service
from services.bedrock_vision_service import get_bedrock_vision_service
from services import s3_service
import tempfile
import os
import time
from pathlib import Path

router = APIRouter()

# Store uploaded files temporarily for PDF viewing
uploaded_files: dict = {}


def get_db_optional():
    """Get database session if available, otherwise return None."""
    try:
        from database import get_db, SessionLocal
        if SessionLocal is None:
            return None
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
    except Exception:
        yield None


def save_parse_result_to_db(
    db: Session,
    document_id: str,
    project_id: str,
    parser: str,
    model: Optional[str],
    result: dict,
    processing_time_ms: int,
    classify_pages: bool = True
):
    """Save parse result to database and S3."""
    from models.database_models import ParseResult, Chunk, Document

    # Upload full result to S3
    s3_result_key = None
    try:
        s3_result_key = s3_service.upload_parse_result(
            project_id=project_id,
            document_id=document_id,
            parser=parser,
            result_data=result
        )
    except Exception as e:
        print(f"Warning: Failed to upload parse result to S3: {e}")

    # Create ParseResult record
    parse_result = ParseResult(
        document_id=document_id,
        parser=parser,
        model=model,
        s3_result_key=s3_result_key,
        markdown=result.get("markdown"),
        chunk_count=len(result.get("chunks", [])),
        page_count=result.get("metadata", {}).get("page_count"),
        credit_usage=result.get("metadata", {}).get("credit_usage"),
        input_tokens=result.get("metadata", {}).get("usage", {}).get("input_tokens") if result.get("metadata", {}).get("usage") else None,
        output_tokens=result.get("metadata", {}).get("usage", {}).get("output_tokens") if result.get("metadata", {}).get("usage") else None,
        status="completed",
        processing_time_ms=processing_time_ms
    )
    db.add(parse_result)
    db.flush()  # Get the ID

    # Update document page count if not set
    document = db.query(Document).filter(Document.id == document_id).first()
    if document and not document.page_count:
        document.page_count = result.get("metadata", {}).get("page_count")

    # Save chunks
    chunk_data_list = []
    for idx, chunk_data in enumerate(result.get("chunks", [])):
        grounding = chunk_data.get("grounding")
        page_num = grounding.get("page", 0) + 1 if grounding else None  # Convert to 1-indexed
        chunk = Chunk(
            parse_result_id=parse_result.id,
            chunk_index=idx,
            chunk_id=chunk_data.get("id", f"chunk_{idx}"),
            markdown=chunk_data.get("markdown"),
            chunk_type=chunk_data.get("type"),
            page_number=page_num,
            bbox_left=grounding.get("box", {}).get("left") if grounding else None,
            bbox_top=grounding.get("box", {}).get("top") if grounding else None,
            bbox_right=grounding.get("box", {}).get("right") if grounding else None,
            bbox_bottom=grounding.get("box", {}).get("bottom") if grounding else None,
        )
        db.add(chunk)
        # Store chunk data for page classification
        chunk_data_list.append({
            "chunk_id": chunk_data.get("id", f"chunk_{idx}"),
            "page_number": page_num,
            "chunk_type": chunk_data.get("type"),
            "markdown": chunk_data.get("markdown")
        })

    db.commit()

    # Return data for page classification
    return {
        "parse_result_id": parse_result.id,
        "page_count": result.get("metadata", {}).get("page_count") or 1,
        "chunks": chunk_data_list
    }


@router.post("")
async def parse_document(
    file: UploadFile = File(...),
    parser: Optional[str] = Form("landing_ai"),
    model: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    document_id: Optional[str] = Form(None),
    classify_pages: Optional[bool] = Form(True),
    db: Optional[Session] = Depends(get_db_optional)
):
    """Parse an uploaded document.

    Args:
        file: The document to parse
        parser: Parser to use - "landing_ai", "claude_vision", "gemini_vision", or "bedrock_claude"
        model: For vision parsers, the model to use
        project_id: Optional project ID to save result to
        document_id: Optional document ID (if already uploaded to a project)
        classify_pages: Whether to classify individual pages after parsing (default: True)
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Validate file type
    allowed_types = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"]
    suffix = "." + file.filename.split(".")[-1].lower()
    if suffix not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"File type not supported. Allowed: {allowed_types}"
        )

    content = await file.read()

    # Store the file content for later retrieval
    file_id = str(hash(content))

    # Save to a temp file for PDF viewing
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, f"ade_{file_id}{suffix}")
    with open(temp_path, "wb") as f:
        f.write(content)
    uploaded_files[file_id] = temp_path

    start_time = time.time()

    try:
        if parser == "claude_vision":
            claude_service = get_claude_vision_service()
            vision_model = model or "claude-sonnet-4-20250514"
            result = await claude_service.parse_document(
                content,
                file.filename,
                vision_model
            )
        elif parser == "gemini_vision":
            gemini_service = get_gemini_vision_service()
            vision_model = model or "gemini-2.0-flash"
            result = await gemini_service.parse_document(
                content,
                file.filename,
                vision_model
            )
        elif parser == "bedrock_claude":
            bedrock_service = get_bedrock_vision_service()
            vision_model = model or "anthropic.claude-3-5-sonnet-20241022-v2:0"
            result = await bedrock_service.parse_document(
                content,
                file.filename,
                vision_model
            )
        else:
            # Default to Landing AI
            result = await ade_service.parse_document(content, file.filename)
            vision_model = None

        processing_time_ms = int((time.time() - start_time) * 1000)

        result["file_id"] = file_id

        # Save to database if project_id and document_id provided and DB is available
        if db and project_id and document_id:
            try:
                parse_data = save_parse_result_to_db(
                    db=db,
                    document_id=document_id,
                    project_id=project_id,
                    parser=parser or "landing_ai",
                    model=vision_model,
                    result=result,
                    processing_time_ms=processing_time_ms
                )
                result["parse_result_id"] = parse_data["parse_result_id"]

                # Classify pages if requested
                if classify_pages and parse_data["page_count"] > 0:
                    try:
                        from services.page_classification_service import get_page_classification_service
                        classification_service = get_page_classification_service()
                        classifications = await classification_service.classify_pages(
                            chunks=parse_data["chunks"],
                            page_count=parse_data["page_count"],
                            model="bedrock-claude-sonnet-3.5"
                        )
                        classification_service.save_classifications(
                            db=db,
                            parse_result_id=parse_data["parse_result_id"],
                            classifications=classifications
                        )
                        # Add page classifications to result
                        result["page_classifications"] = classifications
                    except Exception as e:
                        print(f"Warning: Failed to classify pages: {e}")
                        result["page_classifications"] = []
            except Exception as e:
                print(f"Warning: Failed to save parse result to database: {e}")

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file/{file_id}")
async def get_uploaded_file(file_id: str):
    """Retrieve an uploaded file by ID."""
    if file_id not in uploaded_files:
        raise HTTPException(status_code=404, detail="File not found")

    file_path = uploaded_files[file_id]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename=f"document{Path(file_path).suffix}"
    )


@router.get("/{parse_result_id}/page-classifications")
async def get_page_classifications(
    parse_result_id: str,
    db: Session = Depends(get_db_optional)
):
    """Get page classifications for a parse result."""
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")

    from models.database_models import PageClassification

    classifications = db.query(PageClassification).filter(
        PageClassification.parse_result_id == parse_result_id
    ).order_by(PageClassification.page_number).all()

    return {
        "parse_result_id": parse_result_id,
        "classifications": [
            {
                "id": c.id,
                "page_number": c.page_number,
                "page_type": c.page_type,
                "confidence": c.confidence,
                "classification_signals": c.classification_signals,
                "classification_model": c.classification_model,
                "classified_at": c.classified_at.isoformat() if c.classified_at else None
            }
            for c in classifications
        ]
    }


@router.post("/{parse_result_id}/classify-pages")
async def classify_pages(
    parse_result_id: str,
    force_reclassify: bool = False,
    db: Session = Depends(get_db_optional)
):
    """Classify or re-classify pages for a parse result."""
    if not db:
        raise HTTPException(status_code=500, detail="Database not available")

    from models.database_models import ParseResult, Chunk, PageClassification
    from services.page_classification_service import get_page_classification_service

    # Get parse result
    parse_result = db.query(ParseResult).filter(ParseResult.id == parse_result_id).first()
    if not parse_result:
        raise HTTPException(status_code=404, detail="Parse result not found")

    # Check if already classified
    existing = db.query(PageClassification).filter(
        PageClassification.parse_result_id == parse_result_id
    ).first()

    if existing and not force_reclassify:
        raise HTTPException(
            status_code=400,
            detail="Pages already classified. Set force_reclassify=true to re-classify."
        )

    # Delete existing classifications if re-classifying
    if existing:
        db.query(PageClassification).filter(
            PageClassification.parse_result_id == parse_result_id
        ).delete()
        db.commit()

    # Get chunks
    chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result_id).all()
    chunk_data = [
        {
            "chunk_id": c.chunk_id,
            "page_number": c.page_number,
            "chunk_type": c.chunk_type,
            "markdown": c.markdown
        }
        for c in chunks
    ]

    # Classify pages
    classification_service = get_page_classification_service()
    classifications = await classification_service.classify_pages(
        chunks=chunk_data,
        page_count=parse_result.page_count or 1,
        model="bedrock-claude-sonnet-3.5"
    )

    # Save classifications
    classification_service.save_classifications(
        db=db,
        parse_result_id=parse_result_id,
        classifications=classifications
    )

    return {
        "parse_result_id": parse_result_id,
        "page_count": parse_result.page_count,
        "classifications": classifications
    }

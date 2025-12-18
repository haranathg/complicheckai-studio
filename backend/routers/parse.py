from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
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
    processing_time_ms: int
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
    for idx, chunk_data in enumerate(result.get("chunks", [])):
        grounding = chunk_data.get("grounding")
        chunk = Chunk(
            parse_result_id=parse_result.id,
            chunk_index=idx,
            chunk_id=chunk_data.get("id", f"chunk_{idx}"),
            markdown=chunk_data.get("markdown"),
            chunk_type=chunk_data.get("type"),
            page_number=grounding.get("page", 0) + 1 if grounding else None,  # Convert to 1-indexed
            bbox_left=grounding.get("box", {}).get("left") if grounding else None,
            bbox_top=grounding.get("box", {}).get("top") if grounding else None,
            bbox_right=grounding.get("box", {}).get("right") if grounding else None,
            bbox_bottom=grounding.get("box", {}).get("bottom") if grounding else None,
        )
        db.add(chunk)

    db.commit()
    return parse_result.id


@router.post("")
async def parse_document(
    file: UploadFile = File(...),
    parser: Optional[str] = Form("landing_ai"),
    model: Optional[str] = Form(None),
    project_id: Optional[str] = Form(None),
    document_id: Optional[str] = Form(None),
    db: Optional[Session] = Depends(get_db_optional)
):
    """Parse an uploaded document.

    Args:
        file: The document to parse
        parser: Parser to use - "landing_ai", "claude_vision", "gemini_vision", or "bedrock_claude"
        model: For vision parsers, the model to use
        project_id: Optional project ID to save result to
        document_id: Optional document ID (if already uploaded to a project)
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
                parse_result_id = save_parse_result_to_db(
                    db=db,
                    document_id=document_id,
                    project_id=project_id,
                    parser=parser or "landing_ai",
                    model=vision_model,
                    result=result,
                    processing_time_ms=processing_time_ms
                )
                result["parse_result_id"] = parse_result_id
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

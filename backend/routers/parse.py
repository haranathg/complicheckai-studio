from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from typing import Optional
from services.ade_service import ade_service
from services.claude_vision_service import claude_vision_service
from services.gemini_vision_service import gemini_vision_service
import tempfile
import os
from pathlib import Path

router = APIRouter()

# Store uploaded files temporarily for PDF viewing
uploaded_files: dict = {}


@router.post("")
async def parse_document(
    file: UploadFile = File(...),
    parser: Optional[str] = Form("landing_ai"),
    model: Optional[str] = Form(None)
):
    """Parse an uploaded document.

    Args:
        file: The document to parse
        parser: Parser to use - "landing_ai", "claude_vision", or "gemini_vision"
        model: For vision parsers, the model to use
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

    try:
        if parser == "claude_vision":
            vision_model = model or "claude-sonnet-4-20250514"
            result = await claude_vision_service.parse_document(
                content,
                file.filename,
                vision_model
            )
        elif parser == "gemini_vision":
            vision_model = model or "gemini-2.0-flash"
            result = await gemini_vision_service.parse_document(
                content,
                file.filename,
                vision_model
            )
        else:
            # Default to Landing AI
            result = await ade_service.parse_document(content, file.filename)

        result["file_id"] = file_id
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

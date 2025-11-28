from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from services.ade_service import ade_service

router = APIRouter()


class ExtractRequest(BaseModel):
    markdown: str
    schema_def: Dict[str, Any]  # JSON Schema


@router.post("")
async def extract_data(request: ExtractRequest):
    """Extract structured data from markdown using a schema."""
    try:
        result = await ade_service.extract_data(request.markdown, request.schema_def)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

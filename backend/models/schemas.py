from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class BoundingBox(BaseModel):
    left: float
    top: float
    right: float
    bottom: float


class Grounding(BaseModel):
    box: BoundingBox
    page: int


class Chunk(BaseModel):
    id: str
    markdown: str
    type: str
    grounding: Optional[Grounding] = None


class ParseMetadata(BaseModel):
    page_count: Optional[int] = None
    credit_usage: Optional[float] = None


class ParseResponse(BaseModel):
    markdown: str
    chunks: List[Chunk]
    metadata: ParseMetadata
    file_id: Optional[str] = None


class ExtractRequest(BaseModel):
    markdown: str
    schema_def: Dict[str, Any]


class ExtractResponse(BaseModel):
    extraction: Dict[str, Any]
    extraction_metadata: Dict[str, Any]


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    markdown: str
    chunks: List[Dict[str, Any]]
    history: Optional[List[ChatMessage]] = []


class ChatResponse(BaseModel):
    answer: str
    usage: Dict[str, int]

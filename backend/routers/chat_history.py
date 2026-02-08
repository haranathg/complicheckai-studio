"""API endpoints for chat history persistence."""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.database_models import ChatSession, ChatMessage

router = APIRouter()


# Pydantic models
class ChatMessageCreate(BaseModel):
    role: str
    content: str
    chunk_ids: Optional[List[str]] = None
    document_sources: Optional[List[dict]] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    model: Optional[str] = None


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    chunk_ids: Optional[List[str]] = None
    document_sources: Optional[List[dict]] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    model: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionResponse(BaseModel):
    id: str
    document_id: str
    created_at: datetime
    updated_at: datetime
    total_input_tokens: int
    total_output_tokens: int
    messages: List[ChatMessageResponse]

    class Config:
        from_attributes = True


class AddMessagesRequest(BaseModel):
    messages: List[ChatMessageCreate]


# Helper
def session_to_response(session: ChatSession) -> ChatSessionResponse:
    messages = sorted(session.messages, key=lambda m: m.created_at)
    return ChatSessionResponse(
        id=session.id,
        document_id=session.document_id,
        created_at=session.created_at,
        updated_at=session.updated_at,
        total_input_tokens=session.total_input_tokens or 0,
        total_output_tokens=session.total_output_tokens or 0,
        messages=[
            ChatMessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                chunk_ids=m.chunk_ids,
                document_sources=m.document_sources,
                input_tokens=m.input_tokens,
                output_tokens=m.output_tokens,
                model=m.model,
                created_at=m.created_at,
            ) for m in messages
        ]
    )


# Endpoints
@router.get("/{document_id}", response_model=Optional[ChatSessionResponse])
async def get_chat_session(document_id: str, db: Session = Depends(get_db)):
    """Get the active chat session for a document."""
    session = db.query(ChatSession).filter(
        ChatSession.document_id == document_id
    ).first()

    if not session:
        return None

    return session_to_response(session)


@router.post("/{document_id}/messages", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def add_messages(
    document_id: str,
    request: AddMessagesRequest,
    db: Session = Depends(get_db)
):
    """Add messages to a chat session. Creates session if needed."""
    session = db.query(ChatSession).filter(
        ChatSession.document_id == document_id
    ).first()

    if not session:
        session = ChatSession(document_id=document_id)
        db.add(session)
        db.flush()

    for msg in request.messages:
        db_msg = ChatMessage(
            session_id=session.id,
            role=msg.role,
            content=msg.content,
            chunk_ids=msg.chunk_ids,
            document_sources=msg.document_sources,
            input_tokens=msg.input_tokens,
            output_tokens=msg.output_tokens,
            model=msg.model,
        )
        db.add(db_msg)

        if msg.input_tokens:
            session.total_input_tokens = (session.total_input_tokens or 0) + msg.input_tokens
        if msg.output_tokens:
            session.total_output_tokens = (session.total_output_tokens or 0) + msg.output_tokens

    db.commit()
    db.refresh(session)
    return session_to_response(session)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat_session(document_id: str, db: Session = Depends(get_db)):
    """Delete the chat session for a document (clear chat)."""
    session = db.query(ChatSession).filter(
        ChatSession.document_id == document_id
    ).first()

    if session:
        db.delete(session)
        db.commit()

    return None

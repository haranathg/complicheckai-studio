from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
from anthropic import Anthropic

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    question: str
    markdown: str
    chunks: List[dict]
    history: Optional[List[ChatMessage]] = []


@router.post("")
async def chat_with_document(request: ChatRequest):
    """Chat with the parsed document using Claude."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="ANTHROPIC_API_KEY not configured"
        )

    client = Anthropic(api_key=api_key)

    # Build context from markdown and chunks
    system_prompt = f"""You are a helpful assistant that answers questions about a document.

The document has been parsed into the following markdown:

{request.markdown}

When answering:
1. Be specific and cite relevant sections
2. If information isn't in the document, say so
3. Reference chunk types (tables, figures, etc.) when relevant
"""

    # Build message history
    messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
    messages.append({"role": "user", "content": request.question})

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=system_prompt,
            messages=messages
        )

        return {
            "answer": response.content[0].text,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

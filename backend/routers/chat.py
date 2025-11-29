from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import re
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

    # Build chunk reference for the prompt
    chunk_info = []
    for chunk in request.chunks:
        chunk_id = chunk.get('id', '')
        chunk_type = chunk.get('type', 'text')
        chunk_text = chunk.get('markdown', '')[:200]  # First 200 chars for context
        page = chunk.get('grounding', {}).get('page', 'unknown')
        chunk_info.append(f"- ID: {chunk_id}, Type: {chunk_type}, Page: {page}, Preview: {chunk_text}...")

    chunks_reference = "\n".join(chunk_info)

    # Build context from markdown and chunks
    system_prompt = f"""You are a helpful assistant that answers questions about a document.

The document has been parsed into the following markdown:

{request.markdown}

The document contains the following components (chunks) that you can reference:

{chunks_reference}

When answering:
1. Be specific and cite relevant sections
2. If information isn't in the document, say so
3. Reference chunk types (tables, figures, etc.) when relevant
4. IMPORTANT: At the end of your response, include a JSON block with the IDs of chunks that are relevant to your answer, in this format:
   ```sources
   ["chunk_id_1", "chunk_id_2"]
   ```
   Only include chunk IDs that directly support your answer. If no specific chunks are relevant, use an empty array [].
"""

    # Build message history
    messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
    messages.append({"role": "user", "content": request.question})

    model_name = "claude-sonnet-4-20250514"

    try:
        response = client.messages.create(
            model=model_name,
            max_tokens=1024,
            system=system_prompt,
            messages=messages
        )

        answer_text = response.content[0].text

        # Extract chunk IDs from the sources block
        chunk_ids = []
        sources_match = re.search(r'```sources\s*\n?\s*(\[.*?\])\s*\n?```', answer_text, re.DOTALL)
        if sources_match:
            try:
                chunk_ids = json.loads(sources_match.group(1))
                # Remove the sources block from the answer
                answer_text = re.sub(r'\s*```sources\s*\n?\s*\[.*?\]\s*\n?```\s*', '', answer_text, flags=re.DOTALL).strip()
            except json.JSONDecodeError:
                pass

        return {
            "answer": answer_text,
            "chunk_ids": chunk_ids,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "model": model_name
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

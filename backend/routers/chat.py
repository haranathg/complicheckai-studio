from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import re
import boto3

router = APIRouter()

# Bedrock model registry - maps friendly names to Bedrock model IDs
BEDROCK_MODELS = {
    "bedrock-claude-sonnet-3.5": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "bedrock-claude-opus-3": "anthropic.claude-3-opus-20240229-v1:0",
    "bedrock-nova-pro": "amazon.nova-pro-v1:0",
}

DEFAULT_MODEL_ID = "anthropic.claude-3-5-sonnet-20241022-v2:0"

# Bedrock client - lazy init
_bedrock_client = None

def get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is None:
        region = os.getenv("AWS_REGION", "ap-southeast-2")
        _bedrock_client = boto3.client("bedrock-runtime", region_name=region)
    return _bedrock_client

def resolve_model_id(model: str) -> str:
    """Convert friendly model name to Bedrock model ID."""
    return BEDROCK_MODELS.get(model, model if model else DEFAULT_MODEL_ID)


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class DocumentContext(BaseModel):
    """Context for a single document in multi-document chat."""
    document_id: str
    document_name: str
    markdown: str
    chunks: List[dict]


class ChatRequest(BaseModel):
    question: str
    # Single document mode (legacy)
    markdown: Optional[str] = None
    chunks: Optional[List[dict]] = None
    # Multi-document mode
    document_contexts: Optional[List[DocumentContext]] = None
    history: Optional[List[ChatMessage]] = []
    model: Optional[str] = "anthropic.claude-3-5-sonnet-20241022-v2:0"


def build_single_doc_prompt(markdown: str, chunks: List[dict]) -> str:
    """Build system prompt for single document mode."""
    chunk_info = []
    for i, chunk in enumerate(chunks):
        chunk_id = chunk.get('id', '')
        chunk_type = chunk.get('type', 'text')
        chunk_text = chunk.get('markdown', '')[:200]  # First 200 chars for context
        page = chunk.get('grounding', {}).get('page', 'unknown')
        page_display = f"Page {page + 1}" if isinstance(page, int) else "Unknown page"
        chunk_info.append(f"- [{i+1}] {chunk_type.title()} on {page_display} (ref:{chunk_id}): {chunk_text}...")

    chunks_reference = "\n".join(chunk_info)

    return f"""You are a helpful assistant that answers questions about a document.

The document has been parsed into the following markdown:

{markdown}

The document contains these components:

{chunks_reference}

When answering:
1. Be specific and cite WHERE information is found (e.g., "on page 3", "in the table", "in the floor plan")
2. If information isn't in the document, say so
3. NEVER mention chunk IDs, reference codes, or technical identifiers in your response - use human-friendly descriptions only
4. At the end of your response, include the technical reference codes in this hidden format (the user won't see these):
   ```sources
   ["ref_code_1", "ref_code_2"]
   ```
   Only include refs that directly support your answer. If none are relevant, use [].
"""


def build_multi_doc_prompt(document_contexts: List[DocumentContext]) -> str:
    """Build system prompt for multi-document mode."""
    doc_sections = []

    for doc in document_contexts:
        chunk_info = []
        for i, chunk in enumerate(doc.chunks):
            chunk_id = chunk.get('id', '')
            chunk_type = chunk.get('type', 'text')
            chunk_text = chunk.get('markdown', '')[:200]
            page = chunk.get('grounding', {}).get('page', 'unknown')
            page_display = f"Page {page + 1}" if isinstance(page, int) else "Unknown page"
            chunk_info.append(f"  - [{i+1}] {chunk_type.title()} on {page_display} (ref:{chunk_id}): {chunk_text}...")

        chunks_reference = "\n".join(chunk_info) if chunk_info else "  (No content extracted)"

        doc_sections.append(f"""
=== DOCUMENT: {doc.document_name} ===

Content:
{doc.markdown}

Components:
{chunks_reference}
""")

    all_docs = "\n".join(doc_sections)

    return f"""You are a helpful assistant that answers questions about multiple documents in a project.

The following documents are available:

{all_docs}

When answering:
1. Be specific and cite WHERE information is found (e.g., "on page 3 of the Plans document", "in the table in the Specifications")
2. Always mention which document the information comes from by name
3. If information isn't in any document, say so
4. NEVER mention reference codes, chunk IDs, or technical identifiers in your response - use human-friendly descriptions only
5. At the end of your response, include technical references in this hidden format (the user won't see these):
   ```sources
   {{"document_sources": [{{"document_id": "doc_id_1", "document_name": "filename1.pdf", "chunk_ids": ["ref_1", "ref_2"]}}, {{"document_id": "doc_id_2", "document_name": "filename2.pdf", "chunk_ids": ["ref_3"]}}]}}
   ```
   Only include documents and refs that directly support your answer. If none are relevant, use an empty array for document_sources.
"""


def enrich_document_sources(document_sources: List[dict], document_contexts: List[DocumentContext]) -> List[dict]:
    """Enrich document sources with chunk details (page, bbox) for stable cross-document navigation."""
    # Build a lookup of document_id -> {chunk_id -> chunk_details}
    doc_chunks_lookup = {}
    for doc in document_contexts:
        chunk_lookup = {}
        for chunk in doc.chunks:
            chunk_id = chunk.get('id', '')
            grounding = chunk.get('grounding', {})
            chunk_lookup[chunk_id] = {
                'id': chunk_id,
                'page': grounding.get('page') if grounding else None,
                'bbox': grounding.get('box') if grounding else None,
                'type': chunk.get('type', 'text')
            }
        doc_chunks_lookup[doc.document_id] = chunk_lookup

    # Enrich each document source with chunk details
    enriched_sources = []
    for doc_src in document_sources:
        doc_id = doc_src.get('document_id', '')
        chunk_ids = doc_src.get('chunk_ids', [])
        chunk_lookup = doc_chunks_lookup.get(doc_id, {})

        # Build detailed chunks array
        chunks_with_details = []
        for chunk_id in chunk_ids:
            if chunk_id in chunk_lookup:
                chunks_with_details.append(chunk_lookup[chunk_id])
            else:
                # Chunk ID not found, include with just the ID
                chunks_with_details.append({'id': chunk_id})

        enriched_sources.append({
            'document_id': doc_id,
            'document_name': doc_src.get('document_name', ''),
            'chunk_ids': chunk_ids,  # Keep for backwards compatibility
            'chunks': chunks_with_details  # New: detailed chunk info
        })

    return enriched_sources


@router.post("")
async def chat_with_document(request: ChatRequest):
    """Chat with the parsed document(s) using Bedrock Claude."""
    client = get_bedrock_client()

    # Determine if this is single-doc or multi-doc mode
    is_multi_doc = request.document_contexts is not None and len(request.document_contexts) > 0

    if is_multi_doc:
        system_prompt = build_multi_doc_prompt(request.document_contexts)
    else:
        # Fallback to single document mode
        markdown = request.markdown or ""
        chunks = request.chunks or []
        system_prompt = build_single_doc_prompt(markdown, chunks)

    # Build message history
    messages = [{"role": msg.role, "content": msg.content} for msg in request.history]
    messages.append({"role": "user", "content": request.question})

    model_id = resolve_model_id(request.model)

    try:
        # Bedrock Claude API format
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1024,
            "system": system_prompt,
            "messages": messages
        }

        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body)
        )

        response_body = json.loads(response["body"].read())
        answer_text = response_body["content"][0]["text"]

        # Extract sources from the sources block
        chunk_ids = []
        document_sources = []

        sources_match = re.search(r'```sources\s*\n?\s*(\{.*?\}|\[.*?\])\s*\n?```', answer_text, re.DOTALL)
        if sources_match:
            try:
                sources_data = json.loads(sources_match.group(1))

                # Check if it's multi-doc format (object with document_sources)
                if isinstance(sources_data, dict) and 'document_sources' in sources_data:
                    document_sources = sources_data['document_sources']
                    # Also flatten chunk_ids for backwards compatibility
                    for doc_src in document_sources:
                        chunk_ids.extend(doc_src.get('chunk_ids', []))
                elif isinstance(sources_data, list):
                    # Single doc format (just array of chunk IDs)
                    chunk_ids = sources_data

                # Remove the sources block from the answer
                answer_text = re.sub(r'\s*```sources\s*\n?\s*(\{.*?\}|\[.*?\])\s*\n?```\s*', '', answer_text, flags=re.DOTALL).strip()
            except json.JSONDecodeError:
                pass

        # Enrich document sources with chunk details for stable cross-document navigation
        if is_multi_doc and document_sources:
            document_sources = enrich_document_sources(document_sources, request.document_contexts)

        return {
            "answer": answer_text,
            "chunk_ids": chunk_ids,
            "document_sources": document_sources,
            "usage": {
                "input_tokens": response_body.get("usage", {}).get("input_tokens", 0),
                "output_tokens": response_body.get("usage", {}).get("output_tokens", 0),
                "model": model_id
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

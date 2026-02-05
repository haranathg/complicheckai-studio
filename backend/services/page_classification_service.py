"""Service for classifying individual pages based on their content."""
import json
from typing import Dict, Any, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session

from services.config_service import load_checks_config_v3
from routers.compliance import get_bedrock_client, resolve_model_id


class PageClassificationService:
    """Service to classify individual pages of a document."""

    def __init__(self):
        self.config = load_checks_config_v3()
        self.page_types = self.config.get("page_types", {})

    def get_page_types_description(self) -> str:
        """Build description of page types for the LLM prompt."""
        lines = []
        for type_id, type_info in self.page_types.items():
            if type_id == "unknown":
                continue
            signals = ", ".join(type_info.get("classification_signals", [])[:5])
            lines.append(f"- {type_id}: {type_info['name']} - {type_info['description']} (signals: {signals})")
        return "\n".join(lines)

    async def classify_pages(
        self,
        chunks: List[Dict],
        page_count: int,
        model: str = "bedrock-claude-sonnet-3.5"
    ) -> List[Dict[str, Any]]:
        """
        Classify each page based on its chunks.

        Args:
            chunks: List of chunk dictionaries with page_number, markdown, chunk_type
            page_count: Total number of pages in the document
            model: LLM model to use for classification

        Returns:
            List of page classification results
        """
        # Group chunks by page
        pages_content = {}
        for chunk in chunks:
            page_num = chunk.get("page_number", 1)
            if page_num not in pages_content:
                pages_content[page_num] = []
            pages_content[page_num].append({
                "type": chunk.get("chunk_type", "text"),
                "content": (chunk.get("markdown") or "")[:500]  # Limit content length
            })

        # Build prompt
        page_types_desc = self.get_page_types_description()

        prompt = f"""Classify each page of this document into one of these page types:

{page_types_desc}
- unknown: Unknown - Page type could not be determined

The document has {page_count} pages. Here is the content from each page:

"""
        for page_num in range(1, page_count + 1):
            page_chunks = pages_content.get(page_num, [])
            if page_chunks:
                chunk_summary = "\n".join([
                    f"  [{c['type']}] {c['content'][:200]}..."
                    for c in page_chunks[:5]
                ])
            else:
                chunk_summary = "  (No extracted content)"
            prompt += f"\nPAGE {page_num}:\n{chunk_summary}\n"

        prompt += """

For each page, determine the most likely page type based on the content.
Look for visual cues, keywords, and structural elements that indicate the page type.

Respond with ONLY valid JSON in this exact format:
{
  "classifications": [
    {"page": 1, "page_type": "cover_sheet", "confidence": 90, "signals": ["DRAWING LIST", "project information"]},
    {"page": 2, "page_type": "site_plan", "confidence": 85, "signals": ["boundary lines", "SITE PLAN"]},
    ...
  ]
}

Include an entry for EVERY page from 1 to """ + str(page_count) + "."

        # Call LLM
        client = get_bedrock_client()
        model_id = resolve_model_id(model)

        try:
            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 2048,
                "messages": [{"role": "user", "content": prompt}]
            }

            response = client.invoke_model(
                modelId=model_id,
                contentType="application/json",
                accept="application/json",
                body=json.dumps(body)
            )

            response_body = json.loads(response["body"].read())
            response_text = response_body["content"][0]["text"]

            # Parse JSON response
            try:
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0]
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0]

                result = json.loads(response_text.strip())
                classifications = result.get("classifications", [])
            except (json.JSONDecodeError, KeyError):
                # If parsing fails, return unknown for all pages
                classifications = [
                    {"page": i, "page_type": "unknown", "confidence": 0, "signals": []}
                    for i in range(1, page_count + 1)
                ]

            # Ensure all pages are covered
            classified_pages = {c["page"] for c in classifications}
            for page_num in range(1, page_count + 1):
                if page_num not in classified_pages:
                    classifications.append({
                        "page": page_num,
                        "page_type": "unknown",
                        "confidence": 0,
                        "signals": []
                    })

            # Sort by page number
            classifications.sort(key=lambda x: x["page"])

            # Add metadata
            for c in classifications:
                c["classification_model"] = model
                c["classified_at"] = datetime.utcnow().isoformat()

            return classifications

        except Exception as e:
            print(f"Page classification error: {e}")
            # Return unknown for all pages on error
            return [
                {
                    "page": i,
                    "page_type": "unknown",
                    "confidence": 0,
                    "signals": [],
                    "classification_model": model,
                    "classified_at": datetime.utcnow().isoformat(),
                    "error": str(e)
                }
                for i in range(1, page_count + 1)
            ]

    def save_classifications(
        self,
        db: Session,
        parse_result_id: str,
        classifications: List[Dict[str, Any]]
    ) -> List[str]:
        """
        Save page classifications to the database.

        Returns list of created PageClassification IDs.
        """
        from models.database_models import PageClassification

        created_ids = []
        for c in classifications:
            page_class = PageClassification(
                parse_result_id=parse_result_id,
                page_number=c["page"],
                page_type=c["page_type"],
                confidence=c.get("confidence"),
                classification_signals=c.get("signals", []),
                classification_model=c.get("classification_model")
            )
            db.add(page_class)
            db.flush()
            created_ids.append(page_class.id)

        db.commit()
        return created_ids


# Singleton instance
_page_classification_service: Optional[PageClassificationService] = None


def get_page_classification_service() -> PageClassificationService:
    """Get or create the page classification service singleton."""
    global _page_classification_service
    if _page_classification_service is None:
        _page_classification_service = PageClassificationService()
    return _page_classification_service

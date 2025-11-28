import os
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv

# Load .env before importing LandingAIADE
load_dotenv()

from landingai_ade import LandingAIADE
import tempfile


class ADEService:
    def __init__(self):
        api_key = os.getenv("VISION_AGENT_API_KEY")
        if not api_key:
            raise ValueError("VISION_AGENT_API_KEY environment variable is not set")
        self.client = LandingAIADE(apikey=api_key)

    async def parse_document(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """Parse a document and return structured data."""
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
            tmp.write(file_content)
            tmp_path = Path(tmp.name)

        try:
            response = self.client.parse(
                document=tmp_path,
                model="dpt-2-latest",
                split="page"
            )

            # Convert to serializable dict
            chunks = []
            for chunk in response.chunks:
                chunk_data = {
                    "id": str(chunk.id),
                    "markdown": chunk.markdown,
                    "type": chunk.type,
                    "grounding": None
                }

                if chunk.grounding:
                    chunk_data["grounding"] = {
                        "box": {
                            "left": chunk.grounding.box.left,
                            "top": chunk.grounding.box.top,
                            "right": chunk.grounding.box.right,
                            "bottom": chunk.grounding.box.bottom,
                        },
                        "page": chunk.grounding.page
                    }

                chunks.append(chunk_data)

            return {
                "markdown": response.markdown,
                "chunks": chunks,
                "metadata": {
                    "page_count": getattr(response.metadata, 'page_count', None),
                    "credit_usage": getattr(response.metadata, 'credit_usage', None),
                }
            }
        finally:
            tmp_path.unlink()  # Clean up temp file

    async def extract_data(self, markdown: str, schema: Dict[str, Any]) -> Dict[str, Any]:
        """Extract structured data from markdown using a schema."""
        response = self.client.extract(
            markdown=markdown,
            schema=schema
        )

        return {
            "extraction": response.extraction,
            "extraction_metadata": getattr(response, 'extraction_metadata', {}),
        }


ade_service = ADEService()

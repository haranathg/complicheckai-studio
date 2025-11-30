import os
import base64
import uuid
import re
import json
from pathlib import Path
from typing import Dict, Any, List
from anthropic import Anthropic
import fitz  # PyMuPDF for PDF handling


class ClaudeVisionService:
    def __init__(self):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable is not set")
        self.client = Anthropic(api_key=api_key)

    def _pdf_to_images(self, pdf_bytes: bytes, dpi: int = 150) -> List[tuple]:
        """Convert PDF pages to images. Returns list of (page_num, base64_image, media_type)."""
        images = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page to image
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            b64_image = base64.standard_b64encode(img_bytes).decode("utf-8")
            images.append((page_num, b64_image, "image/png"))

        doc.close()
        return images

    def _image_to_base64(self, image_bytes: bytes, filename: str) -> tuple:
        """Convert image bytes to base64. Returns (base64_image, media_type)."""
        ext = Path(filename).suffix.lower()
        media_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/png",  # Convert BMP to PNG
            ".tiff": "image/png",  # Convert TIFF to PNG
            ".tif": "image/png",
        }
        media_type = media_types.get(ext, "image/png")

        # For BMP/TIFF, convert to PNG using fitz
        if ext in [".bmp", ".tiff", ".tif"]:
            doc = fitz.open(stream=image_bytes, filetype=ext[1:])
            page = doc[0]
            pix = page.get_pixmap()
            image_bytes = pix.tobytes("png")
            doc.close()
            media_type = "image/png"

        b64_image = base64.standard_b64encode(image_bytes).decode("utf-8")
        return b64_image, media_type

    async def parse_document(
        self,
        file_content: bytes,
        filename: str,
        model: str = "claude-sonnet-4-20250514"
    ) -> Dict[str, Any]:
        """Parse a document using Claude's vision capabilities."""

        suffix = Path(filename).suffix.lower()

        # Prepare images for Claude
        if suffix == ".pdf":
            images = self._pdf_to_images(file_content)
        else:
            b64_image, media_type = self._image_to_base64(file_content, filename)
            images = [(0, b64_image, media_type)]

        page_count = len(images)
        all_chunks = []
        full_markdown_parts = []

        # Track total usage across all pages
        total_input_tokens = 0
        total_output_tokens = 0

        # Process each page
        for page_num, b64_image, media_type in images:
            page_result = await self._process_page(
                b64_image,
                media_type,
                page_num,
                model
            )
            all_chunks.extend(page_result["chunks"])
            full_markdown_parts.append(f"## Page {page_num + 1}\n\n{page_result['markdown']}")

            # Accumulate usage
            total_input_tokens += page_result["usage"]["input_tokens"]
            total_output_tokens += page_result["usage"]["output_tokens"]

        full_markdown = "\n\n".join(full_markdown_parts)

        return {
            "markdown": full_markdown,
            "chunks": all_chunks,
            "metadata": {
                "page_count": page_count,
                "credit_usage": None,  # Not applicable for Claude (Landing AI specific)
                "model": model,
                "parser": "claude_vision",
                "usage": {
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "model": model
                }
            }
        }

    async def _process_page(
        self,
        b64_image: str,
        media_type: str,
        page_num: int,
        model: str
    ) -> Dict[str, Any]:
        """Process a single page with Claude vision."""

        system_prompt = """You are a precise document parser. Your task is to extract content AND accurately locate each element on the page.

COORDINATE SYSTEM - READ CAREFULLY:
- Coordinates are NORMALIZED values from 0.0 to 1.0
- (0.0, 0.0) is the TOP-LEFT corner of the page
- (1.0, 1.0) is the BOTTOM-RIGHT corner of the page
- left=0.0 means the left edge of the page
- left=0.5 means the horizontal center of the page
- left=1.0 means the right edge of the page
- top=0.0 means the top edge of the page
- top=0.5 means the vertical center of the page
- top=1.0 means the bottom edge of the page

VISUAL ESTIMATION TECHNIQUE:
1. Mentally divide the page into a 10x10 grid (each cell is 0.1 x 0.1)
2. For each text element, identify which grid cell(s) it occupies
3. Estimate coordinates based on grid position

COMMON PAGE LAYOUTS:
- Standard document: Text spans left=0.05 to right=0.95 with margins
- Two-column: Left column (0.05-0.48), Right column (0.52-0.95)
- Site plans/drawings with title block: Drawing area (0.0-0.75), Title block (0.75-1.0)
- Title blocks are usually on the RIGHT side of the page

FOR ARCHITECTURAL/ENGINEERING DRAWINGS:
- The main drawing/map typically occupies the LEFT 70-80% of the page
- The title block with text information is on the RIGHT 20-30% of the page
- Title block elements have left coordinates around 0.75-0.80 and right around 0.98-1.0
- Do NOT place text overlays on the drawing area unless there is actual text there

OUTPUT FORMAT:
1. First, extract all readable text content as markdown
2. Then provide a ```components``` JSON block with bounding boxes

```components
[
  {"type": "figure", "content": "Site plan drawing", "top": 0.0, "left": 0.0, "bottom": 1.0, "right": 0.75},
  {"type": "header", "content": "Company Name", "top": 0.0, "left": 0.75, "bottom": 0.08, "right": 1.0},
  {"type": "text", "content": "Site Address: 123 Main St", "top": 0.5, "left": 0.75, "bottom": 0.55, "right": 1.0}
]
```

CRITICAL RULES:
1. LOOK at where text ACTUALLY appears on the page before assigning coordinates
2. Text in title blocks (right side) should have left >= 0.70
3. Single lines of text are about 0.02-0.04 in height
4. Tables/forms with multiple rows need proportionally larger height
5. DO NOT guess - only include elements you can clearly see
6. If unsure about exact position, estimate conservatively

Types: heading, paragraph, table, figure, list, form_field, caption, footer, header, text, image, logo"""

        response = self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": b64_image,
                            },
                        },
                        {
                            "type": "text",
                            "text": """Analyze this document page and extract content with precise locations.

STEP 1: Identify the page layout
- Is this a standard text document OR an architectural/engineering drawing with a title block?
- If it has a title block, note that text content is typically on the RIGHT side (left >= 0.70)

STEP 2: For each text element you can see:
- What percentage from the LEFT edge does it start? (0.0 = left edge, 1.0 = right edge)
- What percentage from the TOP does it start? (0.0 = top, 1.0 = bottom)
- How wide and tall is it?

STEP 3: Extract all text as markdown

STEP 4: Create the ```components``` JSON with coordinates

Remember:
- Coordinates are 0.0 to 1.0 (normalized)
- Text on the right side of the page has left >= 0.5 or higher
- Be accurate - check each element's actual position visually"""
                        }
                    ],
                }
            ],
        )

        content = response.content[0].text

        # Track usage from this API call
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens
        }

        # Parse components from response
        chunks = []
        markdown = content

        # Extract components JSON if present
        components_match = re.search(
            r'```components\s*\n?\s*(\[[\s\S]*?\])\s*\n?```',
            content,
            re.DOTALL
        )

        if components_match:
            # Remove components block from markdown
            markdown = re.sub(
                r'\s*```components\s*\n?\s*\[[\s\S]*?\]\s*\n?```\s*',
                '',
                content,
                flags=re.DOTALL
            ).strip()

            try:
                components = json.loads(components_match.group(1))
                print(f"[Claude Vision] Page {page_num}: Found {len(components)} components")
                for idx, comp in enumerate(components):
                    chunk_id = f"claude_{page_num}_{idx}_{uuid.uuid4().hex[:8]}"

                    # Get component content - use the content field or a portion of markdown
                    chunk_content = comp.get("content", "")
                    chunk_type = comp.get("type", "text")

                    # Debug: print raw coordinates from Claude
                    print(f"  [{idx}] {chunk_type}: top={comp.get('top')}, left={comp.get('left')}, bottom={comp.get('bottom')}, right={comp.get('right')}")

                    # Ensure coordinates are valid floats between 0 and 1
                    left = max(0.0, min(1.0, float(comp.get("left", 0.0))))
                    top = max(0.0, min(1.0, float(comp.get("top", 0.0))))
                    right = max(0.0, min(1.0, float(comp.get("right", 1.0))))
                    bottom = max(0.0, min(1.0, float(comp.get("bottom", 1.0))))

                    chunks.append({
                        "id": chunk_id,
                        "markdown": chunk_content,
                        "type": chunk_type,
                        "grounding": {
                            "box": {
                                "left": left,
                                "top": top,
                                "right": right,
                                "bottom": bottom,
                            },
                            "page": page_num
                        }
                    })
            except (json.JSONDecodeError, ValueError, TypeError):
                # If JSON parsing fails, create a single chunk for the whole page
                pass

        # If no chunks parsed, create one for the entire page content
        if not chunks:
            chunks.append({
                "id": f"claude_{page_num}_full_{uuid.uuid4().hex[:8]}",
                "markdown": markdown,
                "type": "text",
                "grounding": {
                    "box": {
                        "left": 0.0,
                        "top": 0.0,
                        "right": 1.0,
                        "bottom": 1.0,
                    },
                    "page": page_num
                }
            })

        return {
            "markdown": markdown,
            "chunks": chunks,
            "usage": usage
        }


# Singleton instance
claude_vision_service = ClaudeVisionService()

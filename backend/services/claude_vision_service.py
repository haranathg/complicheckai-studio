import os
import base64
import uuid
import re
import json
from pathlib import Path
from typing import Dict, Any, List
from anthropic import Anthropic
import fitz  # PyMuPDF for PDF handling
from services.aws_secrets import get_api_key


# Load prompts from config file
PROMPTS_CONFIG_PATH = Path(__file__).parent.parent / "config" / "claude_vision_prompts.json"


def load_prompts_config() -> Dict[str, Any]:
    """Load prompts configuration from JSON file."""
    if PROMPTS_CONFIG_PATH.exists():
        with open(PROMPTS_CONFIG_PATH, "r") as f:
            return json.load(f)
    return {}


def build_system_prompt(config: Dict[str, Any]) -> str:
    """Build the system prompt from config."""
    if not config or "system_prompt" not in config:
        return ""

    sp = config["system_prompt"]
    parts = []

    # Intro
    parts.append(sp.get("intro", ""))
    parts.append("")

    # Task description
    td = sp.get("task_description", {})
    if td:
        parts.append(td.get("description", ""))
        for item in td.get("items", []):
            parts.append(f"- {item}")
        parts.append("")

    # Region strategy
    rs = sp.get("region_strategy", {})
    if rs:
        parts.append(rs.get("description", ""))
        for rule in rs.get("rules", []):
            parts.append(f"- {rule}")
        parts.append("")

    # Coordinate system
    cs = sp.get("coordinate_system", {})
    parts.append(cs.get("description", ""))
    for rule in cs.get("rules", []):
        parts.append(f"- {rule}")
    parts.append("")

    # Visual estimation
    ve = sp.get("visual_estimation", {})
    parts.append(ve.get("description", ""))
    for i, step in enumerate(ve.get("steps", []), 1):
        parts.append(f"{i}. {step}")
    parts.append("")

    # Common layouts
    cl = sp.get("common_layouts", {})
    parts.append(cl.get("description", ""))
    for layout in cl.get("layouts", []):
        parts.append(f"- {layout}")
    parts.append("")

    # Architectural drawings
    ad = sp.get("architectural_drawings", {})
    parts.append(ad.get("description", ""))
    for rule in ad.get("rules", []):
        parts.append(f"- {rule}")
    parts.append("")

    # Output format
    of = sp.get("output_format", {})
    parts.append(of.get("description", ""))
    for inst in of.get("instructions", []):
        parts.append(f"- {inst}")
    parts.append("")
    if of.get("json_structure"):
        parts.append(of.get("json_structure"))
        parts.append("")
    parts.append("```components")
    parts.append(json.dumps(of.get("example", []), indent=2))
    parts.append("```")
    parts.append("")

    # Critical rules
    cr = sp.get("critical_rules", {})
    parts.append(cr.get("description", ""))
    for i, rule in enumerate(cr.get("rules", []), 1):
        parts.append(f"{i}. {rule}")
    parts.append("")

    # Component types
    types = sp.get("component_types", [])
    if types:
        parts.append(f"Types: {', '.join(types)}")

    return "\n".join(parts)


def build_user_prompt(config: Dict[str, Any]) -> str:
    """Build the user prompt from config."""
    if not config or "user_prompt" not in config:
        return ""

    up = config["user_prompt"]
    parts = []

    # Intro
    parts.append(up.get("intro", ""))
    parts.append("")

    # Steps
    for step in up.get("steps", []):
        parts.append(f"STEP {step['step']}: {step['title']}")
        for inst in step.get("instructions", []):
            parts.append(f"- {inst}")
        parts.append("")

    # Reminders
    parts.append("Remember:")
    for reminder in up.get("reminders", []):
        parts.append(f"- {reminder}")

    return "\n".join(parts)


class ClaudeVisionService:
    def __init__(self):
        api_key = get_api_key("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY not found in environment or AWS Secrets Manager")
        self.client = Anthropic(api_key=api_key)

        # Load prompts from config
        self.prompts_config = load_prompts_config()
        self.system_prompt = build_system_prompt(self.prompts_config)
        self.user_prompt = build_user_prompt(self.prompts_config)

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

        response = self.client.messages.create(
            model=model,
            max_tokens=4096,
            system=self.system_prompt,
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
                            "text": self.user_prompt
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

                    # Check which coordinate format Claude returned
                    # New format: x, y, width, height (0-100 percentage scale)
                    # Old format: left, top, right, bottom (0-1 normalized scale)
                    if "x" in comp and "width" in comp:
                        # New format: x/y/width/height (0-100)
                        x = float(comp.get("x", 0))
                        y = float(comp.get("y", 0))
                        width = float(comp.get("width", 100))
                        height = float(comp.get("height", 100))

                        # Convert from 0-100 percentage to 0-1 normalized
                        left = max(0.0, min(1.0, x / 100.0))
                        top = max(0.0, min(1.0, y / 100.0))
                        right = max(0.0, min(1.0, (x + width) / 100.0))
                        bottom = max(0.0, min(1.0, (y + height) / 100.0))

                        print(f"  [{idx}] {chunk_type}: x={x}, y={y}, w={width}, h={height} -> left={left:.3f}, top={top:.3f}, right={right:.3f}, bottom={bottom:.3f}")
                    else:
                        # Old format: left/top/right/bottom (0-1)
                        left = max(0.0, min(1.0, float(comp.get("left", 0.0))))
                        top = max(0.0, min(1.0, float(comp.get("top", 0.0))))
                        right = max(0.0, min(1.0, float(comp.get("right", 1.0))))
                        bottom = max(0.0, min(1.0, float(comp.get("bottom", 1.0))))

                        print(f"  [{idx}] {chunk_type}: left={left:.3f}, top={top:.3f}, right={right:.3f}, bottom={bottom:.3f}")

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

import os
import base64
import uuid
import re
import json
from pathlib import Path
from typing import Dict, Any, List
import boto3
import fitz  # PyMuPDF for PDF handling


# Load prompts from config file (reuse the same prompts as Claude)
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
    if ve:
        parts.append(ve.get("description", ""))
        for i, step in enumerate(ve.get("steps", []), 1):
            parts.append(f"{i}. {step}")
        parts.append("")

    # Common layouts
    cl = sp.get("common_layouts", {})
    if cl:
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


# Bedrock model registry - maps friendly names to Bedrock model IDs
BEDROCK_MODELS = {
    # Claude models
    "bedrock-claude-sonnet-3.5": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "bedrock-claude-opus-3": "anthropic.claude-3-opus-20240229-v1:0",
    # Amazon Nova models
    "bedrock-nova-pro": "amazon.nova-pro-v1:0",
}

# Default Bedrock model
DEFAULT_BEDROCK_MODEL = "bedrock-claude-sonnet-3.5"


class BedrockVisionService:
    def __init__(self):
        # Get AWS region from environment or default to us-east-1
        self.region = os.getenv("AWS_REGION", "us-east-1")

        # Create Bedrock runtime client
        # Uses default credential chain: env vars, IAM role, ~/.aws/credentials
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=self.region
        )

        # Default model - Claude 3.5 Sonnet on Bedrock
        self.default_model = BEDROCK_MODELS[DEFAULT_BEDROCK_MODEL]

        # Load prompts from config
        self.prompts_config = load_prompts_config()
        self.system_prompt = build_system_prompt(self.prompts_config)
        self.user_prompt = build_user_prompt(self.prompts_config)

    def _pdf_to_images(self, pdf_bytes: bytes, dpi: int = 150) -> List[tuple]:
        """Convert PDF pages to images. Returns list of (page_num, image_bytes, media_type)."""
        images = []
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        for page_num in range(len(doc)):
            page = doc[page_num]
            # Render page to image
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            images.append((page_num, img_bytes, "image/png"))

        doc.close()
        return images

    def _image_to_bytes(self, image_bytes: bytes, filename: str) -> tuple:
        """Process image bytes. Returns (image_bytes, media_type)."""
        ext = Path(filename).suffix.lower()
        media_types = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".bmp": "image/png",
            ".tiff": "image/png",
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

        return image_bytes, media_type

    async def parse_document(
        self,
        file_content: bytes,
        filename: str,
        model: str = None
    ) -> Dict[str, Any]:
        """Parse a document using Bedrock Claude's vision capabilities."""

        suffix = Path(filename).suffix.lower()
        # Resolve model: check if it's a friendly name, otherwise use as-is or default
        if model and model in BEDROCK_MODELS:
            model_id = BEDROCK_MODELS[model]
        elif model:
            model_id = model  # Assume it's already a full model ID
        else:
            model_id = self.default_model

        # Prepare images
        if suffix == ".pdf":
            images = self._pdf_to_images(file_content)
        else:
            img_bytes, media_type = self._image_to_bytes(file_content, filename)
            images = [(0, img_bytes, media_type)]

        page_count = len(images)
        all_chunks = []
        full_markdown_parts = []

        # Track total usage across all pages
        total_input_tokens = 0
        total_output_tokens = 0

        # Process each page
        for page_num, img_bytes, media_type in images:
            page_result = await self._process_page(
                img_bytes,
                media_type,
                page_num,
                model_id
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
                "credit_usage": None,
                "model": model_id,
                "parser": "bedrock_claude",
                "usage": {
                    "input_tokens": total_input_tokens,
                    "output_tokens": total_output_tokens,
                    "model": model_id
                }
            }
        }

    async def _process_page(
        self,
        img_bytes: bytes,
        media_type: str,
        page_num: int,
        model_id: str
    ) -> Dict[str, Any]:
        """Process a single page with Bedrock Claude vision."""

        # Encode image to base64
        img_b64 = base64.b64encode(img_bytes).decode("utf-8")

        # Build the request body for Bedrock Claude
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "system": self.system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": img_b64
                            }
                        },
                        {
                            "type": "text",
                            "text": self.user_prompt
                        }
                    ]
                }
            ]
        }

        # Call Bedrock
        response = self.client.invoke_model(
            modelId=model_id,
            body=json.dumps(request_body),
            contentType="application/json",
            accept="application/json"
        )

        # Parse response
        response_body = json.loads(response["body"].read())

        content = ""
        for block in response_body.get("content", []):
            if block.get("type") == "text":
                content = block.get("text", "")
                break

        # Get usage
        usage = {
            "input_tokens": response_body.get("usage", {}).get("input_tokens", 0),
            "output_tokens": response_body.get("usage", {}).get("output_tokens", 0)
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
                print(f"[Bedrock Claude] Page {page_num}: Found {len(components)} components")
                for idx, comp in enumerate(components):
                    chunk_id = f"bedrock_{page_num}_{idx}_{uuid.uuid4().hex[:8]}"

                    # Get component content
                    chunk_content = comp.get("content", "")
                    chunk_type = comp.get("type", "text")

                    # Check which coordinate format was returned
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
            except (json.JSONDecodeError, ValueError, TypeError) as e:
                print(f"[Bedrock Claude] Page {page_num}: Failed to parse components: {e}")
                pass

        # If no chunks parsed, create one for the entire page content
        if not chunks:
            chunks.append({
                "id": f"bedrock_{page_num}_full_{uuid.uuid4().hex[:8]}",
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


# Singleton instance - lazy initialization
_bedrock_vision_service = None


def get_bedrock_vision_service():
    """Get or create the Bedrock vision service singleton."""
    global _bedrock_vision_service
    if _bedrock_vision_service is None:
        _bedrock_vision_service = BedrockVisionService()
    return _bedrock_vision_service

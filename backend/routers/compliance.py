from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
from datetime import datetime

router = APIRouter()

class ComplianceCheck(BaseModel):
    id: str
    name: str
    description: str
    category: str
    rule_reference: Optional[str] = None
    required: Optional[bool] = True
    threshold: Optional[Dict[str, Any]] = None
    search_terms: Optional[List[str]] = None

class ComplianceRequest(BaseModel):
    markdown: str
    chunks: List[dict]
    completeness_checks: List[ComplianceCheck]
    compliance_checks: List[ComplianceCheck]

@router.post("/check")
async def run_compliance_checks(request: ComplianceRequest):
    """Run completeness and compliance checks on the parsed document."""

    try:
        from anthropic import Anthropic
        client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize Anthropic client: {str(e)}")

    # Create chunk summaries for the AI
    chunk_summaries = []
    for chunk in request.chunks:
        chunk_summaries.append({
            "id": chunk.get("id"),
            "type": chunk.get("type"),
            "content_preview": chunk.get("markdown", "")[:300]
        })

    # Build the prompt
    completeness_list = "\n".join([
        f"- {c.id}: {c.name} - {c.description}"
        for c in request.completeness_checks
    ])

    compliance_list = "\n".join([
        f"- {c.id}: {c.name} - {c.description}" +
        (f" (max {c.threshold.get('max_percentage')}%)" if c.threshold and c.threshold.get('max_percentage') else "") +
        (f" (max {c.threshold.get('max_height_m')}m)" if c.threshold and c.threshold.get('max_height_m') else "")
        for c in request.compliance_checks
    ])

    prompt = f"""Analyze this building consent/site plan document and evaluate each check.

DOCUMENT CONTENT:
{request.markdown[:15000]}

AVAILABLE CHUNKS (use these IDs to reference where you found information):
{json.dumps(chunk_summaries, indent=2)[:4000]}

COMPLETENESS CHECKS TO EVALUATE:
{completeness_list}

COMPLIANCE CHECKS TO EVALUATE:
{compliance_list}

For each check, determine:
- status: "pass" (found and meets criteria), "fail" (not found or doesn't meet criteria), or "needs_review" (found but unclear/needs human verification)
- confidence: 0-100 (how confident you are in the assessment)
- found_value: the actual value/text found in the document (if any)
- notes: brief explanation of your finding
- chunk_ids: array of chunk IDs where you found this information (CRITICAL: include these for pass and needs_review items so users can verify)

IMPORTANT:
1. Be thorough - search the entire document content for each check
2. For pass/needs_review, ALWAYS include chunk_ids where the information was found
3. If you find partial information, mark as needs_review
4. Be conservative - if uncertain, use needs_review rather than pass

Respond ONLY with valid JSON in this exact format:
{{
  "completeness_results": [
    {{"check_id": "comp_001", "status": "pass", "confidence": 95, "found_value": "841 Makerua Road Tokomaru", "notes": "Address clearly stated in title block", "chunk_ids": ["chunk-0"]}}
  ],
  "compliance_results": [
    {{"check_id": "comply_001", "status": "pass", "confidence": 90, "found_value": "6.5%", "notes": "Site coverage well under 40% limit", "chunk_ids": ["chunk-2"]}}
  ]
}}"""

    try:
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text

        # Extract JSON from response
        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            results = json.loads(response_text.strip())
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Response was: {response_text[:1000]}")
            raise HTTPException(status_code=500, detail="Failed to parse compliance results from AI")

        # Build full results with check metadata
        completeness_results = []
        for check in request.completeness_checks:
            result = next(
                (r for r in results.get("completeness_results", []) if r.get("check_id") == check.id),
                {
                    "check_id": check.id,
                    "status": "fail",
                    "confidence": 0,
                    "found_value": None,
                    "notes": "Not found in document",
                    "chunk_ids": []
                }
            )
            completeness_results.append({
                "check_id": check.id,
                "check_name": check.name,
                "check_type": "completeness",
                "status": result.get("status", "fail"),
                "confidence": result.get("confidence", 0),
                "found_value": result.get("found_value"),
                "expected": None,
                "notes": result.get("notes", ""),
                "category": check.category,
                "chunk_ids": result.get("chunk_ids", []),
            })

        compliance_results = []
        for check in request.compliance_checks:
            result = next(
                (r for r in results.get("compliance_results", []) if r.get("check_id") == check.id),
                {
                    "check_id": check.id,
                    "status": "fail",
                    "confidence": 0,
                    "found_value": None,
                    "notes": "Could not verify",
                    "chunk_ids": []
                }
            )

            # Build expected value string from threshold
            expected = None
            if check.threshold:
                if check.threshold.get("max_percentage"):
                    expected = f"Max {check.threshold['max_percentage']}%"
                elif check.threshold.get("max_height_m"):
                    expected = f"Max {check.threshold['max_height_m']}m"
                elif check.threshold.get("min_separation_m"):
                    expected = f"Min {check.threshold['min_separation_m']}m"

            compliance_results.append({
                "check_id": check.id,
                "check_name": check.name,
                "check_type": "compliance",
                "status": result.get("status", "fail"),
                "confidence": result.get("confidence", 0),
                "found_value": result.get("found_value"),
                "expected": expected,
                "notes": result.get("notes", ""),
                "category": check.category,
                "chunk_ids": result.get("chunk_ids", []),
            })

        # Calculate summary
        all_results = completeness_results + compliance_results
        passed = sum(1 for r in all_results if r["status"] == "pass")
        failed = sum(1 for r in all_results if r["status"] == "fail")
        needs_review = sum(1 for r in all_results if r["status"] == "needs_review")

        completeness_passed = sum(1 for r in completeness_results if r["status"] in ["pass", "needs_review"])
        completeness_score = int((completeness_passed / len(completeness_results)) * 100) if completeness_results else 0

        return {
            "document_name": "Uploaded Document",
            "checked_at": datetime.now().isoformat(),
            "completeness_results": completeness_results,
            "compliance_results": compliance_results,
            "summary": {
                "completeness_score": completeness_score,
                "compliance_score": int((passed / len(all_results)) * 100) if all_results else 0,
                "total_checks": len(all_results),
                "passed": passed,
                "failed": failed,
                "needs_review": needs_review,
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error running compliance checks: {e}")
        raise HTTPException(status_code=500, detail=str(e))

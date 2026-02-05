"""API endpoints for running compliance checks on documents."""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import json
import threading

from database import get_db
from models.database_models import (
    Document, ParseResult, Chunk, Project, ProjectSettings,
    CheckResult, BatchCheckRun, PageClassification, PageCheckResult
)
from services.config_service import (
    load_default_checks_config,
    load_checks_config_v3, get_checks_for_page_type, get_checks_v3
)
from routers.compliance import get_bedrock_client, resolve_model_id

router = APIRouter()


class RunChecksRequest(BaseModel):
    force_reclassify: bool = False


class BatchCheckRequest(BaseModel):
    force_rerun: bool = False
    skip_unparsed: bool = True
    document_ids: Optional[List[str]] = None  # If provided, only run on these documents


class RunChecksV3Request(BaseModel):
    """Request body for V3 page-level checks."""
    force_reclassify: bool = False


# Maximum characters per batch for smart batching
MAX_BATCH_CHARS = 50000


def create_smart_batches(
    page_classifications: List,
    chunks_by_page: Dict[int, List[Dict]],
    max_chars: int = MAX_BATCH_CHARS
) -> List[Dict]:
    """
    Group pages by type and create batches that fit within the character limit.

    Returns a list of batches, each containing:
    - page_type: the shared page type
    - pages: list of page numbers in this batch
    - page_classifications: list of PageClassification objects
    - combined_content: merged markdown content from all pages
    - chunks: combined chunk data from all pages
    """
    # Group pages by type
    pages_by_type: Dict[str, List] = {}
    for pc in page_classifications:
        page_type = pc.page_type
        if page_type not in pages_by_type:
            pages_by_type[page_type] = []
        pages_by_type[page_type].append(pc)

    batches = []

    for page_type, classifications in pages_by_type.items():
        current_batch_pages = []
        current_batch_classifications = []
        current_batch_content = []
        current_batch_chunks = []
        current_chars = 0

        for pc in classifications:
            page_num = pc.page_number
            page_chunks = chunks_by_page.get(page_num, [])

            # Calculate content size for this page
            page_content = "\n\n".join([
                f"[{c.get('type', 'text')}]: {c.get('content', '')}"
                for c in page_chunks
            ])
            page_chars = len(page_content)

            # If adding this page would exceed limit, finalize current batch
            if current_chars > 0 and current_chars + page_chars > max_chars:
                batches.append({
                    "page_type": page_type,
                    "pages": current_batch_pages,
                    "page_classifications": current_batch_classifications,
                    "combined_content": "\n\n---PAGE BOUNDARY---\n\n".join(current_batch_content),
                    "chunks": current_batch_chunks
                })
                # Start new batch
                current_batch_pages = []
                current_batch_classifications = []
                current_batch_content = []
                current_batch_chunks = []
                current_chars = 0

            # Add page to current batch
            current_batch_pages.append(page_num)
            current_batch_classifications.append(pc)
            current_batch_content.append(f"=== PAGE {page_num} ===\n{page_content}")
            current_batch_chunks.extend([{**c, "page_number": page_num} for c in page_chunks])
            current_chars += page_chars

        # Don't forget the last batch
        if current_batch_pages:
            batches.append({
                "page_type": page_type,
                "pages": current_batch_pages,
                "page_classifications": current_batch_classifications,
                "combined_content": "\n\n---PAGE BOUNDARY---\n\n".join(current_batch_content),
                "chunks": current_batch_chunks
            })

    return batches


# ============ SINGLE DOCUMENT CHECKS ============
# Note: V2 endpoint redirects to V3 for backwards compatibility

@router.post("/documents/{document_id}/run")
async def run_document_checks(
    document_id: str,
    body: RunChecksRequest = RunChecksRequest(),
    db: Session = Depends(get_db)
):
    """Run checks on a single document. Redirects to V3 page-level checks."""
    # Convert V2 request to V3 and call V3 endpoint
    v3_body = RunChecksV3Request(force_reclassify=body.force_reclassify)
    return await run_document_checks_v3(document_id, v3_body, db)


# ============ CHECK HISTORY ============

@router.get("/documents/{document_id}/history")
async def get_document_check_history(
    document_id: str,
    limit: int = 10,
    db: Session = Depends(get_db)
):
    """Get check run history for a document."""
    results = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).limit(limit).all()

    total = db.query(CheckResult).filter(CheckResult.document_id == document_id).count()

    return {
        "document_id": document_id,
        "total_runs": total,
        "history": [
            {
                "id": r.id,
                "run_number": r.run_number,
                "document_type": r.document_type,
                "summary": r.summary,
                "model": r.model,
                "batch_run_id": r.batch_run_id,
                "created_at": r.created_at.isoformat(),
                "processing_time_ms": r.processing_time_ms
            }
            for r in results
        ]
    }


@router.get("/documents/{document_id}/results/latest")
async def get_latest_check_results(document_id: str, db: Session = Depends(get_db)):
    """Get most recent check results for a document."""
    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()

    if not result:
        return {"has_results": False}

    return {
        "has_results": True,
        "id": result.id,
        "run_number": result.run_number,
        "document_type": result.document_type,
        "completeness_results": result.completeness_results,
        "compliance_results": result.compliance_results,
        "summary": result.summary,
        "checked_at": result.created_at.isoformat(),
        "checks_config": result.checks_config_snapshot,
        "usage": {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "model": result.model
        }
    }


@router.get("/results/{result_id}")
async def get_check_result_by_id(result_id: str, db: Session = Depends(get_db)):
    """Get a specific check result by ID."""
    result = db.query(CheckResult).filter(CheckResult.id == result_id).first()
    if not result:
        raise HTTPException(status_code=404, detail="Check result not found")

    return {
        "id": result.id,
        "document_id": result.document_id,
        "run_number": result.run_number,
        "document_type": result.document_type,
        "completeness_results": result.completeness_results,
        "compliance_results": result.compliance_results,
        "summary": result.summary,
        "checks_config": result.checks_config_snapshot,
        "usage": {
            "model": result.model,
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens
        },
        "created_at": result.created_at.isoformat(),
        "processing_time_ms": result.processing_time_ms
    }


# ============ BATCH OPERATIONS ============

@router.post("/projects/{project_id}/run-all")
async def run_checks_all_documents(
    project_id: str,
    body: BatchCheckRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Run checks on all documents in a project (batch)."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Filter documents by document_ids if provided
    if body.document_ids:
        documents = db.query(Document).filter(
            Document.project_id == project_id,
            Document.id.in_(body.document_ids)
        ).all()
    else:
        documents = db.query(Document).filter(Document.project_id == project_id).all()

    if not documents:
        raise HTTPException(status_code=400, detail="No documents to process")

    settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"

    # Create batch run record
    batch_run = BatchCheckRun(
        project_id=project_id,
        status="pending",
        total_documents=len(documents),
        model=model,
        force_rerun=body.force_rerun
    )
    db.add(batch_run)
    db.commit()
    db.refresh(batch_run)

    # Queue background processing
    background_tasks.add_task(
        process_batch_checks,
        batch_run_id=batch_run.id,
        project_id=project_id,
        force_rerun=body.force_rerun,
        skip_unparsed=body.skip_unparsed,
        document_ids=body.document_ids
    )

    return {
        "batch_run_id": batch_run.id,
        "status": "pending",
        "total_documents": len(documents),
        "message": "Batch check run started"
    }


@router.get("/projects/{project_id}/batch-runs")
async def list_batch_runs(project_id: str, db: Session = Depends(get_db)):
    """List all batch check runs for a project."""
    runs = db.query(BatchCheckRun).filter(
        BatchCheckRun.project_id == project_id
    ).order_by(BatchCheckRun.created_at.desc()).all()

    return {
        "runs": [
            {
                "id": r.id,
                "status": r.status,
                "total_documents": r.total_documents,
                "completed_documents": r.completed_documents,
                "failed_documents": r.failed_documents,
                "skipped_documents": r.skipped_documents,
                "total_passed": r.total_passed,
                "total_failed": r.total_failed,
                "total_needs_review": r.total_needs_review,
                "created_at": r.created_at.isoformat(),
                "completed_at": r.completed_at.isoformat() if r.completed_at else None
            }
            for r in runs
        ]
    }


@router.get("/batch-runs/{batch_run_id}")
async def get_batch_run_status(batch_run_id: str, db: Session = Depends(get_db)):
    """Get status and results of a batch check run."""
    batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
    if not batch_run:
        raise HTTPException(status_code=404, detail="Batch run not found")

    results = db.query(CheckResult).filter(CheckResult.batch_run_id == batch_run_id).all()

    return {
        "id": batch_run.id,
        "status": batch_run.status,
        "progress": {
            "total": batch_run.total_documents,
            "completed": batch_run.completed_documents,
            "failed": batch_run.failed_documents,
            "skipped": batch_run.skipped_documents,
            "percent": int((batch_run.completed_documents / batch_run.total_documents) * 100) if batch_run.total_documents > 0 else 0
        },
        "summary": {
            "total_passed": batch_run.total_passed,
            "total_failed": batch_run.total_failed,
            "total_needs_review": batch_run.total_needs_review
        },
        "usage": {
            "input_tokens": batch_run.total_input_tokens,
            "output_tokens": batch_run.total_output_tokens
        },
        "results": [
            {
                "document_id": r.document_id,
                "document_type": r.document_type,
                "status": r.status,
                "summary": r.summary
            }
            for r in results
        ],
        "created_at": batch_run.created_at.isoformat(),
        "started_at": batch_run.started_at.isoformat() if batch_run.started_at else None,
        "completed_at": batch_run.completed_at.isoformat() if batch_run.completed_at else None
    }


# ============ V3 PAGE-LEVEL CHECKS ============

@router.post("/documents/{document_id}/run-v3")
async def run_document_checks_v3(
    document_id: str,
    body: RunChecksV3Request = RunChecksV3Request(),
    db: Session = Depends(get_db)
):
    """Run V3 page-level checks on a document using page classifications."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Get parse result
    parse_result = db.query(ParseResult).filter(
        ParseResult.document_id == document_id,
        ParseResult.status == "completed"
    ).order_by(ParseResult.created_at.desc()).first()

    if not parse_result:
        raise HTTPException(status_code=400, detail="Document must be parsed first")

    # Get or create page classifications
    page_classifications = db.query(PageClassification).filter(
        PageClassification.parse_result_id == parse_result.id
    ).order_by(PageClassification.page_number).all()

    if not page_classifications or body.force_reclassify:
        # Classify pages first
        from services.page_classification_service import get_page_classification_service
        classification_service = get_page_classification_service()

        # Get chunks for classification
        chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
        chunk_data = [
            {
                "chunk_id": c.chunk_id,
                "page_number": c.page_number,
                "chunk_type": c.chunk_type,
                "markdown": c.markdown
            }
            for c in chunks
        ]

        # Delete existing classifications if re-classifying
        if page_classifications:
            db.query(PageClassification).filter(
                PageClassification.parse_result_id == parse_result.id
            ).delete()
            db.commit()

        classifications = await classification_service.classify_pages(
            chunks=chunk_data,
            page_count=parse_result.page_count or 1,
            model="bedrock-claude-sonnet-3.5"
        )
        classification_service.save_classifications(
            db=db,
            parse_result_id=parse_result.id,
            classifications=classifications
        )

        # Re-fetch classifications
        page_classifications = db.query(PageClassification).filter(
            PageClassification.parse_result_id == parse_result.id
        ).order_by(PageClassification.page_number).all()

    # Get project settings
    settings = db.query(ProjectSettings).filter(
        ProjectSettings.project_id == document.project_id
    ).first()
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"

    # Get chunks grouped by page
    chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
    chunks_by_page = {}
    for c in chunks:
        page_num = c.page_number or 1
        if page_num not in chunks_by_page:
            chunks_by_page[page_num] = []
        chunks_by_page[page_num].append({
            "id": c.chunk_id,
            "type": c.chunk_type,
            "content": c.markdown[:500] if c.markdown else ""
        })

    # Get run number
    run_count = db.query(CheckResult).filter(CheckResult.document_id == document_id).count()

    start_time = datetime.utcnow()

    # Create smart batches - group pages by type with size limits
    batches = create_smart_batches(page_classifications, chunks_by_page)

    # Map page classifications by page number for later lookup
    pc_by_page = {pc.page_number: pc for pc in page_classifications}

    # Run checks for each batch
    all_page_results = []
    total_input_tokens = 0
    total_output_tokens = 0

    for batch in batches:
        page_type = batch["page_type"]

        # Get applicable checks for this page type
        applicable_checks = get_checks_for_page_type(page_type)

        if not applicable_checks:
            continue

        # Run batch checks
        batch_result = await run_batch_checks_ai(
            batch=batch,
            checks=applicable_checks,
            model=model
        )

        # Process results for each page in the batch
        for page_result in batch_result.get("page_results", []):
            page_num = page_result["page_number"]
            pc = pc_by_page.get(page_num)
            if pc:
                page_result["page_classification_id"] = pc.id
            all_page_results.append(page_result)

        total_input_tokens += batch_result.get("usage", {}).get("input_tokens", 0)
        total_output_tokens += batch_result.get("usage", {}).get("output_tokens", 0)

    processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)

    # Aggregate results
    all_check_results = []
    for page_result in all_page_results:
        for check_result in page_result.get("results", []):
            check_result["page_number"] = page_result["page_number"]
            check_result["page_type"] = page_result["page_type"]
            all_check_results.append(check_result)

    # Split into completeness and compliance
    completeness_results = [r for r in all_check_results if r.get("category") == "completeness"]
    compliance_results = [r for r in all_check_results if r.get("category") == "compliance"]

    # Calculate summary
    passed = sum(1 for r in all_check_results if r["status"] == "pass")
    failed = sum(1 for r in all_check_results if r["status"] == "fail")
    needs_review = sum(1 for r in all_check_results if r["status"] == "needs_review")
    na = sum(1 for r in all_check_results if r["status"] == "na")

    # Save main check result
    check_result = CheckResult(
        document_id=document_id,
        parse_result_id=parse_result.id,
        project_id=document.project_id,
        run_number=run_count + 1,
        document_type=document.document_type,
        completeness_results=completeness_results,
        compliance_results=compliance_results,
        summary={
            "total_checks": len(all_check_results),
            "passed": passed,
            "failed": failed,
            "needs_review": needs_review,
            "na": na,
        },
        checks_config_snapshot={
            "version": "3.0",
            "page_classifications": [
                {"page": pc.page_number, "type": pc.page_type}
                for pc in page_classifications
            ]
        },
        model=model,
        input_tokens=total_input_tokens,
        output_tokens=total_output_tokens,
        status="completed",
        processing_time_ms=processing_time
    )
    db.add(check_result)
    db.flush()

    # Save individual page check results
    for page_result in all_page_results:
        for check_res in page_result.get("results", []):
            page_check = PageCheckResult(
                page_classification_id=page_result["page_classification_id"],
                check_result_id=check_result.id,
                check_id=check_res["check_id"],
                check_name=check_res.get("check_name"),
                status=check_res["status"],
                confidence=check_res.get("confidence"),
                found_value=check_res.get("found_value"),
                notes=check_res.get("notes"),
                chunk_ids=check_res.get("chunk_ids", [])
            )
            db.add(page_check)

    # Update project usage
    if settings:
        settings.total_input_tokens = (settings.total_input_tokens or 0) + total_input_tokens
        settings.total_output_tokens = (settings.total_output_tokens or 0) + total_output_tokens

    db.commit()

    return {
        "id": check_result.id,
        "run_number": check_result.run_number,
        "version": "3.0",
        "page_classifications": [
            {"page": pc.page_number, "type": pc.page_type, "confidence": pc.confidence}
            for pc in page_classifications
        ],
        "completeness_results": completeness_results,
        "compliance_results": compliance_results,
        "summary": check_result.summary,
        "checked_at": check_result.created_at.isoformat(),
        "usage": {
            "input_tokens": total_input_tokens,
            "output_tokens": total_output_tokens,
            "model": model
        }
    }


@router.get("/documents/{document_id}/results/latest-v3")
async def get_latest_check_results_v3(document_id: str, db: Session = Depends(get_db)):
    """Get most recent V3 check results for a document, including page-level details."""
    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()

    if not result:
        return {"has_results": False}

    # Get page check results
    page_results = db.query(PageCheckResult).filter(
        PageCheckResult.check_result_id == result.id
    ).all()

    # Get page classifications
    parse_result = db.query(ParseResult).filter(
        ParseResult.document_id == document_id,
        ParseResult.status == "completed"
    ).order_by(ParseResult.created_at.desc()).first()

    page_classifications = []
    if parse_result:
        classifications = db.query(PageClassification).filter(
            PageClassification.parse_result_id == parse_result.id
        ).order_by(PageClassification.page_number).all()
        page_classifications = [
            {
                "id": pc.id,
                "page": pc.page_number,
                "type": pc.page_type,
                "confidence": pc.confidence,
                "signals": pc.classification_signals
            }
            for pc in classifications
        ]

    return {
        "has_results": True,
        "id": result.id,
        "run_number": result.run_number,
        "document_type": result.document_type,
        "page_classifications": page_classifications,
        "completeness_results": result.completeness_results,
        "compliance_results": result.compliance_results,
        "summary": result.summary,
        "page_results": [
            {
                "id": pr.id,
                "page_classification_id": pr.page_classification_id,
                "check_id": pr.check_id,
                "check_name": pr.check_name,
                "status": pr.status,
                "confidence": pr.confidence,
                "found_value": pr.found_value,
                "notes": pr.notes,
                "chunk_ids": pr.chunk_ids
            }
            for pr in page_results
        ],
        "checked_at": result.created_at.isoformat(),
        "checks_config": result.checks_config_snapshot,
        "usage": {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "model": result.model
        }
    }


async def run_batch_checks_ai(
    batch: Dict,
    checks: List[Dict],
    model: str
) -> Dict[str, Any]:
    """
    Run checks on a batch of pages of the same type using AI.

    This enables the LLM to see all pages of the same type together,
    which can improve accuracy for checks that benefit from cross-page context.
    """
    client = get_bedrock_client()
    model_id = resolve_model_id(model)

    page_type = batch["page_type"]
    pages = batch["pages"]
    combined_content = batch["combined_content"]
    chunks = batch["chunks"]

    # Build checks list
    checks_list = "\n".join([
        f"- {c['id']}: {c['name']} - {c['prompt']}" +
        (f" (Rule: {c.get('rule_reference')})" if c.get('rule_reference') else "")
        for c in checks
    ])

    pages_str = ", ".join(str(p) for p in pages)

    prompt = f"""Analyze these {len(pages)} pages (pages {pages_str}) which are all classified as "{page_type}" and evaluate each check FOR EACH PAGE.

COMBINED PAGE CONTENT:
{combined_content[:50000] if combined_content else "No content extracted"}

CHUNKS (with page numbers):
{json.dumps(chunks[:30], indent=2)[:4000]}

CHECKS TO EVALUATE FOR PAGE TYPE ({page_type}):
{checks_list}

For EACH PAGE, evaluate EACH check and determine:
- page_number: which page this result is for
- status: "pass" (found and meets criteria), "fail" (not found or doesn't meet criteria), "needs_review" (found but unclear), or "na" (not applicable)
- confidence: 0-100 (how confident you are)
- found_value: the actual value/text found (if any)
- notes: brief explanation
- chunk_ids: array of chunk IDs where found

Respond ONLY with valid JSON:
{{
  "results": [
    {{"page_number": 1, "check_id": "id", "status": "pass", "confidence": 90, "found_value": "value", "notes": "explanation", "chunk_ids": ["chunk-0"]}}
  ]
}}"""

    try:
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
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

        # Parse JSON
        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            ai_results = json.loads(response_text.strip())
        except:
            ai_results = {"results": []}

        # Organize results by page
        results_by_page = {p: [] for p in pages}

        # Process AI results
        for ai_result in ai_results.get("results", []):
            page_num = ai_result.get("page_number")
            if page_num in results_by_page:
                results_by_page[page_num].append(ai_result)

        # Build full results for each page
        page_results = []
        for page_num in pages:
            page_check_results = []
            for check in checks:
                ai_result = next(
                    (r for r in results_by_page[page_num] if r.get("check_id") == check["id"]),
                    {
                        "check_id": check["id"],
                        "status": "fail",
                        "confidence": 0,
                        "found_value": None,
                        "notes": "Not evaluated",
                        "chunk_ids": []
                    }
                )
                page_check_results.append({
                    "check_id": check["id"],
                    "check_name": check.get("name"),
                    "category": check.get("category", "completeness"),
                    "status": ai_result.get("status", "fail"),
                    "confidence": ai_result.get("confidence", 0),
                    "found_value": ai_result.get("found_value"),
                    "notes": ai_result.get("notes", ""),
                    "rule_reference": check.get("rule_reference"),
                    "chunk_ids": ai_result.get("chunk_ids", [])
                })

            page_results.append({
                "page_number": page_num,
                "page_type": page_type,
                "results": page_check_results
            })

        return {
            "batch_pages": pages,
            "page_type": page_type,
            "page_results": page_results,
            "usage": {
                "input_tokens": response_body.get("usage", {}).get("input_tokens", 0),
                "output_tokens": response_body.get("usage", {}).get("output_tokens", 0)
            }
        }

    except Exception as e:
        print(f"Error running batch checks: {e}")
        # Return error results for all pages
        page_results = []
        for page_num in pages:
            page_results.append({
                "page_number": page_num,
                "page_type": page_type,
                "results": [
                    {
                        "check_id": c["id"],
                        "check_name": c.get("name"),
                        "category": c.get("category", "completeness"),
                        "status": "fail",
                        "confidence": 0,
                        "notes": f"Error: {str(e)}",
                        "chunk_ids": []
                    }
                    for c in checks
                ]
            })
        return {
            "batch_pages": pages,
            "page_type": page_type,
            "page_results": page_results,
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "error": str(e)
        }


async def run_page_checks_ai(
    page_number: int,
    page_type: str,
    chunks: List[Dict],
    checks: List[Dict],
    model: str
) -> Dict[str, Any]:
    """Run checks on a single page using AI."""
    client = get_bedrock_client()
    model_id = resolve_model_id(model)

    # Build page content from chunks
    page_content = "\n\n".join([
        f"[{c.get('type', 'text')}]: {c.get('content', '')}"
        for c in chunks
    ])

    # Build checks list
    checks_list = "\n".join([
        f"- {c['id']}: {c['name']} - {c['prompt']}" +
        (f" (Rule: {c.get('rule_reference')})" if c.get('rule_reference') else "")
        for c in checks
    ])

    prompt = f"""Analyze this PAGE {page_number} which is classified as a "{page_type}" and evaluate each check.

PAGE CONTENT:
{page_content[:8000] if page_content else "No content extracted from this page"}

CHUNKS ON THIS PAGE (use these IDs to reference where you found information):
{json.dumps(chunks[:10], indent=2)[:2000]}

CHECKS TO EVALUATE FOR THIS PAGE TYPE ({page_type}):
{checks_list}

For each check, determine:
- status: "pass" (found and meets criteria), "fail" (not found or doesn't meet criteria), "needs_review" (found but unclear), or "na" (not applicable)
- confidence: 0-100 (how confident you are)
- found_value: the actual value/text found (if any)
- notes: brief explanation
- chunk_ids: array of chunk IDs where found

Respond ONLY with valid JSON:
{{
  "results": [
    {{"check_id": "id", "status": "pass", "confidence": 90, "found_value": "value", "notes": "explanation", "chunk_ids": ["chunk-0"]}}
  ]
}}"""

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

        # Parse JSON
        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            ai_results = json.loads(response_text.strip())
        except:
            ai_results = {"results": []}

        # Build full results with check metadata
        results = []
        for check in checks:
            ai_result = next(
                (r for r in ai_results.get("results", []) if r.get("check_id") == check["id"]),
                {
                    "check_id": check["id"],
                    "status": "fail",
                    "confidence": 0,
                    "found_value": None,
                    "notes": "Not evaluated",
                    "chunk_ids": []
                }
            )
            results.append({
                "check_id": check["id"],
                "check_name": check.get("name"),
                "category": check.get("category", "completeness"),
                "status": ai_result.get("status", "fail"),
                "confidence": ai_result.get("confidence", 0),
                "found_value": ai_result.get("found_value"),
                "notes": ai_result.get("notes", ""),
                "rule_reference": check.get("rule_reference"),
                "chunk_ids": ai_result.get("chunk_ids", [])
            })

        return {
            "page_number": page_number,
            "page_type": page_type,
            "results": results,
            "usage": {
                "input_tokens": response_body.get("usage", {}).get("input_tokens", 0),
                "output_tokens": response_body.get("usage", {}).get("output_tokens", 0)
            }
        }

    except Exception as e:
        print(f"Error running page checks: {e}")
        return {
            "page_number": page_number,
            "page_type": page_type,
            "results": [
                {
                    "check_id": c["id"],
                    "check_name": c.get("name"),
                    "category": c.get("category", "completeness"),
                    "status": "fail",
                    "confidence": 0,
                    "notes": f"Error: {str(e)}",
                    "chunk_ids": []
                }
                for c in checks
            ],
            "usage": {"input_tokens": 0, "output_tokens": 0},
            "error": str(e)
        }


# ============ HELPER FUNCTIONS ============

async def classify_document_internal(document: Document, parse_result: ParseResult, db: Session):
    """Internal function to classify a document."""
    from services.config_service import load_default_checks_config

    settings = db.query(ProjectSettings).filter(
        ProjectSettings.project_id == document.project_id
    ).first()

    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"
    checks_config = settings.checks_config if settings else load_default_checks_config()

    doc_types_desc = "\n".join([
        f"- {dt_id}: {dt.get('name')} - {dt.get('description')}"
        for dt_id, dt in checks_config.get("document_types", {}).items()
    ])

    prompt = f"""Classify this document into one of these types:

{doc_types_desc}

Document content (first 5000 chars):
{parse_result.markdown[:5000] if parse_result.markdown else "No content"}

Respond with JSON only:
{{
    "document_type": "type_id",
    "confidence": 0-100,
    "signals_found": ["list", "of", "signals"]
}}"""

    client = get_bedrock_client()
    model_id = resolve_model_id(model)

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 500,
        "messages": [{"role": "user", "content": prompt}]
    }

    try:
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(body)
        )

        response_body = json.loads(response["body"].read())
        response_text = response_body["content"][0]["text"]

        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            result = json.loads(response_text.strip())
        except:
            result = {"document_type": "unknown", "confidence": 0, "signals_found": []}

        document.document_type = result.get("document_type", "unknown")
        document.classification_confidence = result.get("confidence", 0)
        document.classification_signals = result.get("signals_found", [])
        document.classification_model = model
        document.classification_override = False

        db.commit()
    except Exception as e:
        print(f"Classification failed: {e}")
        document.document_type = "unknown"
        db.commit()


def process_batch_checks(batch_run_id: str, project_id: str, force_rerun: bool, skip_unparsed: bool, document_ids: Optional[List[str]] = None):
    """Background task to process batch checks."""
    from database import SessionLocal

    db = SessionLocal()
    try:
        batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
        if not batch_run:
            return

        batch_run.status = "processing"
        batch_run.started_at = datetime.utcnow()
        db.commit()

        # Filter documents by document_ids if provided
        if document_ids:
            documents = db.query(Document).filter(
                Document.project_id == project_id,
                Document.id.in_(document_ids)
            ).all()
        else:
            documents = db.query(Document).filter(Document.project_id == project_id).all()
        settings = db.query(ProjectSettings).filter(ProjectSettings.project_id == project_id).first()

        total_passed = 0
        total_failed = 0
        total_needs_review = 0
        total_input_tokens = 0
        total_output_tokens = 0

        for doc in documents:
            try:
                # Get parse result
                parse_result = db.query(ParseResult).filter(
                    ParseResult.document_id == doc.id,
                    ParseResult.status == "completed"
                ).order_by(ParseResult.created_at.desc()).first()

                if not parse_result:
                    if skip_unparsed:
                        batch_run.skipped_documents += 1
                        db.commit()
                        continue
                    else:
                        batch_run.failed_documents += 1
                        db.commit()
                        continue

                # Check if already has results and not forcing rerun
                if not force_rerun:
                    existing = db.query(CheckResult).filter(
                        CheckResult.document_id == doc.id
                    ).first()
                    if existing:
                        batch_run.skipped_documents += 1
                        db.commit()
                        continue

                # Use V3 page-level checks
                model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"

                # Get or create page classifications
                page_classifications = db.query(PageClassification).filter(
                    PageClassification.parse_result_id == parse_result.id
                ).order_by(PageClassification.page_number).all()

                if not page_classifications:
                    # Classify pages first
                    from services.page_classification_service import get_page_classification_service
                    classification_service = get_page_classification_service()

                    chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
                    chunk_data = [
                        {
                            "chunk_id": c.chunk_id,
                            "page_number": c.page_number,
                            "chunk_type": c.chunk_type,
                            "markdown": c.markdown
                        }
                        for c in chunks
                    ]

                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    classifications = loop.run_until_complete(classification_service.classify_pages(
                        chunks=chunk_data,
                        page_count=parse_result.page_count or 1,
                        model="bedrock-claude-sonnet-3.5"
                    ))
                    classification_service.save_classifications(
                        db=db,
                        parse_result_id=parse_result.id,
                        classifications=classifications
                    )
                    page_classifications = db.query(PageClassification).filter(
                        PageClassification.parse_result_id == parse_result.id
                    ).order_by(PageClassification.page_number).all()

                # Get chunks grouped by page
                chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
                chunks_by_page = {}
                for c in chunks:
                    page_num = c.page_number or 1
                    if page_num not in chunks_by_page:
                        chunks_by_page[page_num] = []
                    chunks_by_page[page_num].append({
                        "id": c.chunk_id,
                        "type": c.chunk_type,
                        "content": c.markdown[:500] if c.markdown else ""
                    })

                # Create smart batches and run V3 checks
                batches = create_smart_batches(page_classifications, chunks_by_page)
                pc_by_page = {pc.page_number: pc for pc in page_classifications}

                all_page_results = []
                doc_input_tokens = 0
                doc_output_tokens = 0

                for batch in batches:
                    page_type = batch["page_type"]
                    applicable_checks = get_checks_for_page_type(page_type)

                    if not applicable_checks:
                        continue

                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    batch_result = loop.run_until_complete(run_batch_checks_ai(
                        batch=batch,
                        checks=applicable_checks,
                        model=model
                    ))

                    for page_result in batch_result.get("page_results", []):
                        page_num = page_result["page_number"]
                        pc = pc_by_page.get(page_num)
                        if pc:
                            page_result["page_classification_id"] = pc.id
                        all_page_results.append(page_result)

                    doc_input_tokens += batch_result.get("usage", {}).get("input_tokens", 0)
                    doc_output_tokens += batch_result.get("usage", {}).get("output_tokens", 0)

                # Aggregate results with page info
                all_check_results = []
                for page_result in all_page_results:
                    for check_result_item in page_result.get("results", []):
                        check_result_item["page_number"] = page_result["page_number"]
                        check_result_item["page_type"] = page_result["page_type"]
                        all_check_results.append(check_result_item)

                completeness_results = [r for r in all_check_results if r.get("category") == "completeness"]
                compliance_results = [r for r in all_check_results if r.get("category") == "compliance"]

                passed = sum(1 for r in all_check_results if r["status"] == "pass")
                failed = sum(1 for r in all_check_results if r["status"] == "fail")
                needs_review = sum(1 for r in all_check_results if r["status"] == "needs_review")
                na = sum(1 for r in all_check_results if r["status"] == "na")

                result = {
                    "completeness_results": completeness_results,
                    "compliance_results": compliance_results,
                    "summary": {
                        "total_checks": len(all_check_results),
                        "passed": passed,
                        "failed": failed,
                        "needs_review": needs_review,
                        "na": na
                    },
                    "usage": {
                        "input_tokens": doc_input_tokens,
                        "output_tokens": doc_output_tokens
                    }
                }

                # Save result
                run_count = db.query(CheckResult).filter(CheckResult.document_id == doc.id).count()
                check_result = CheckResult(
                    document_id=doc.id,
                    parse_result_id=parse_result.id,
                    project_id=project_id,
                    batch_run_id=batch_run_id,
                    run_number=run_count + 1,
                    document_type=doc.document_type,
                    completeness_results=result["completeness_results"],
                    compliance_results=result["compliance_results"],
                    summary=result["summary"],
                    checks_config_snapshot={
                        "version": "3.0",
                        "page_classifications": [
                            {"page": pc.page_number, "type": pc.page_type}
                            for pc in page_classifications
                        ]
                    },
                    model=model,
                    input_tokens=result.get("usage", {}).get("input_tokens"),
                    output_tokens=result.get("usage", {}).get("output_tokens"),
                    status="completed"
                )
                db.add(check_result)

                # Save page check results
                for page_result in all_page_results:
                    for check_res in page_result.get("results", []):
                        page_check = PageCheckResult(
                            page_classification_id=page_result.get("page_classification_id"),
                            check_result_id=check_result.id,
                            check_id=check_res["check_id"],
                            check_name=check_res.get("check_name"),
                            status=check_res["status"],
                            confidence=check_res.get("confidence"),
                            found_value=check_res.get("found_value"),
                            notes=check_res.get("notes"),
                            chunk_ids=check_res.get("chunk_ids", [])
                        )
                        db.add(page_check)

                # Update totals
                summary = result.get("summary", {})
                total_passed += summary.get("passed", 0)
                total_failed += summary.get("failed", 0)
                total_needs_review += summary.get("needs_review", 0)
                total_input_tokens += result.get("usage", {}).get("input_tokens", 0)
                total_output_tokens += result.get("usage", {}).get("output_tokens", 0)

                batch_run.completed_documents += 1
                db.commit()

            except Exception as e:
                print(f"Error processing document {doc.id}: {e}")
                batch_run.failed_documents += 1
                db.commit()

        # Finalize batch run
        batch_run.status = "completed"
        batch_run.completed_at = datetime.utcnow()
        batch_run.total_passed = total_passed
        batch_run.total_failed = total_failed
        batch_run.total_needs_review = total_needs_review
        batch_run.total_input_tokens = total_input_tokens
        batch_run.total_output_tokens = total_output_tokens

        # Update project settings usage
        if settings:
            settings.total_input_tokens = (settings.total_input_tokens or 0) + total_input_tokens
            settings.total_output_tokens = (settings.total_output_tokens or 0) + total_output_tokens

        db.commit()

    except Exception as e:
        print(f"Batch processing error: {e}")
        if batch_run:
            batch_run.status = "failed"
            batch_run.error_message = str(e)
            db.commit()
    finally:
        db.close()

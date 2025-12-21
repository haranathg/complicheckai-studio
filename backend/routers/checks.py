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
    CheckResult, BatchCheckRun
)
from services.config_service import load_default_checks_config, get_document_type_config
from routers.compliance import get_bedrock_client, resolve_model_id

router = APIRouter()


class RunChecksRequest(BaseModel):
    force_reclassify: bool = False


class BatchCheckRequest(BaseModel):
    force_rerun: bool = False
    skip_unparsed: bool = True


# ============ SINGLE DOCUMENT CHECKS ============

@router.post("/documents/{document_id}/run")
async def run_document_checks(
    document_id: str,
    body: RunChecksRequest = RunChecksRequest(),
    db: Session = Depends(get_db)
):
    """Run checks on a single document."""
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

    # Auto-classify if needed
    if not document.document_type or body.force_reclassify:
        await classify_document_internal(document, parse_result, db)

    # Get project settings
    settings = db.query(ProjectSettings).filter(
        ProjectSettings.project_id == document.project_id
    ).first()

    checks_config = settings.checks_config if settings else load_default_checks_config()
    model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"

    # Get checks for this document type
    doc_type_config = get_document_type_config(
        document.document_type or "unknown",
        checks_config
    )
    completeness_checks = doc_type_config.get("completeness_checks", [])
    compliance_checks = doc_type_config.get("compliance_checks", [])

    # Get chunks
    chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
    chunk_data = [
        {"id": c.chunk_id, "type": c.chunk_type, "content_preview": (c.markdown or "")[:300]}
        for c in chunks
    ]

    # Get run number
    run_count = db.query(CheckResult).filter(CheckResult.document_id == document_id).count()

    start_time = datetime.utcnow()

    # Run checks via AI
    result = await run_checks_ai(
        markdown=parse_result.markdown,
        chunks=chunk_data,
        completeness_checks=completeness_checks,
        compliance_checks=compliance_checks,
        document_type=document.document_type,
        model=model
    )

    processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)

    # Save result
    check_result = CheckResult(
        document_id=document_id,
        parse_result_id=parse_result.id,
        project_id=document.project_id,
        run_number=run_count + 1,
        document_type=document.document_type,
        completeness_results=result["completeness_results"],
        compliance_results=result["compliance_results"],
        summary=result["summary"],
        checks_config_snapshot={
            "document_type": document.document_type,
            "completeness_checks": completeness_checks,
            "compliance_checks": compliance_checks
        },
        model=model,
        input_tokens=result.get("usage", {}).get("input_tokens"),
        output_tokens=result.get("usage", {}).get("output_tokens"),
        status="completed",
        processing_time_ms=processing_time
    )
    db.add(check_result)

    # Update project usage
    if settings:
        settings.total_input_tokens = (settings.total_input_tokens or 0) + (result.get("usage", {}).get("input_tokens") or 0)
        settings.total_output_tokens = (settings.total_output_tokens or 0) + (result.get("usage", {}).get("output_tokens") or 0)

    db.commit()

    return {
        "id": check_result.id,
        "run_number": check_result.run_number,
        "document_type": document.document_type,
        "completeness_results": result["completeness_results"],
        "compliance_results": result["compliance_results"],
        "summary": result["summary"],
        "checked_at": check_result.created_at.isoformat(),
        "usage": result.get("usage")
    }


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

    documents = db.query(Document).filter(Document.project_id == project_id).all()
    if not documents:
        raise HTTPException(status_code=400, detail="No documents in project")

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
        skip_unparsed=body.skip_unparsed
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


async def run_checks_ai(
    markdown: str,
    chunks: List[Dict],
    completeness_checks: List[Dict],
    compliance_checks: List[Dict],
    document_type: str,
    model: str
) -> Dict[str, Any]:
    """Run checks using AI - adapted from existing compliance.py logic."""

    client = get_bedrock_client()

    # Build the prompt
    completeness_list = "\n".join([
        f"- {c.get('id')}: {c.get('name')} - {c.get('question')}"
        for c in completeness_checks
    ])

    compliance_list = "\n".join([
        f"- {c.get('id')}: {c.get('name')} - {c.get('question')}" +
        (f" (Rule: {c.get('rule_reference')})" if c.get('rule_reference') else "")
        for c in compliance_checks
    ])

    prompt = f"""Analyze this {document_type} document and evaluate each check.

DOCUMENT CONTENT:
{markdown[:15000] if markdown else "No content"}

AVAILABLE CHUNKS (use these IDs to reference where you found information):
{json.dumps(chunks[:20], indent=2)[:4000]}

COMPLETENESS CHECKS TO EVALUATE:
{completeness_list if completeness_list else "None"}

COMPLIANCE CHECKS TO EVALUATE:
{compliance_list if compliance_list else "None"}

For each check, determine:
- status: "pass" (found and meets criteria), "fail" (not found or doesn't meet criteria), "needs_review" (found but unclear/needs human verification), or "na" (not applicable to this document type)
- confidence: 0-100 (how confident you are in the assessment)
- found_value: the actual value/text found in the document (if any)
- notes: brief explanation of your finding
- chunk_ids: array of chunk IDs where you found this information

IMPORTANT:
1. Be thorough - search the entire document content for each check
2. For pass/needs_review, ALWAYS include chunk_ids where the information was found
3. If you find partial information, mark as needs_review
4. Be conservative - if uncertain, use needs_review rather than pass

Respond ONLY with valid JSON in this exact format:
{{
  "completeness_results": [
    {{"check_id": "id", "status": "pass", "confidence": 95, "found_value": "value", "notes": "explanation", "chunk_ids": ["chunk-0"]}}
  ],
  "compliance_results": [
    {{"check_id": "id", "status": "pass", "confidence": 90, "found_value": "value", "notes": "explanation", "chunk_ids": ["chunk-2"]}}
  ]
}}"""

    model_id = resolve_model_id(model)

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

        # Extract JSON from response
        try:
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            results = json.loads(response_text.strip())
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            results = {"completeness_results": [], "compliance_results": []}

        # Build full results with check metadata
        completeness_results = []
        for check in completeness_checks:
            result = next(
                (r for r in results.get("completeness_results", []) if r.get("check_id") == check.get("id")),
                {
                    "check_id": check.get("id"),
                    "status": "fail",
                    "confidence": 0,
                    "found_value": None,
                    "notes": "Not found in document",
                    "chunk_ids": []
                }
            )
            completeness_results.append({
                "check_id": check.get("id"),
                "check_name": check.get("name"),
                "check_type": "completeness",
                "status": result.get("status", "fail"),
                "confidence": result.get("confidence", 0),
                "found_value": result.get("found_value"),
                "notes": result.get("notes", ""),
                "chunk_ids": result.get("chunk_ids", []),
            })

        compliance_results = []
        for check in compliance_checks:
            result = next(
                (r for r in results.get("compliance_results", []) if r.get("check_id") == check.get("id")),
                {
                    "check_id": check.get("id"),
                    "status": "fail",
                    "confidence": 0,
                    "found_value": None,
                    "notes": "Could not verify",
                    "chunk_ids": []
                }
            )

            compliance_results.append({
                "check_id": check.get("id"),
                "check_name": check.get("name"),
                "check_type": "compliance",
                "status": result.get("status", "fail"),
                "confidence": result.get("confidence", 0),
                "found_value": result.get("found_value"),
                "notes": result.get("notes", ""),
                "rule_reference": check.get("rule_reference"),
                "chunk_ids": result.get("chunk_ids", []),
            })

        # Calculate summary
        all_results = completeness_results + compliance_results
        passed = sum(1 for r in all_results if r["status"] == "pass")
        failed = sum(1 for r in all_results if r["status"] == "fail")
        needs_review = sum(1 for r in all_results if r["status"] == "needs_review")
        na = sum(1 for r in all_results if r["status"] == "na")

        return {
            "completeness_results": completeness_results,
            "compliance_results": compliance_results,
            "summary": {
                "total_checks": len(all_results),
                "passed": passed,
                "failed": failed,
                "needs_review": needs_review,
                "na": na,
            },
            "usage": {
                "input_tokens": response_body.get("usage", {}).get("input_tokens", 0),
                "output_tokens": response_body.get("usage", {}).get("output_tokens", 0),
                "model": model_id,
            }
        }

    except Exception as e:
        print(f"Error running checks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def process_batch_checks(batch_run_id: str, project_id: str, force_rerun: bool, skip_unparsed: bool):
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

                # Classify if needed
                if not doc.document_type:
                    import asyncio
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    loop.run_until_complete(classify_document_internal(doc, parse_result, db))

                # Get checks config
                checks_config = settings.checks_config if settings else load_default_checks_config()
                model = settings.compliance_model if settings else "bedrock-claude-sonnet-3.5"

                doc_type_config = get_document_type_config(doc.document_type or "unknown", checks_config)
                completeness_checks = doc_type_config.get("completeness_checks", [])
                compliance_checks = doc_type_config.get("compliance_checks", [])

                chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
                chunk_data = [
                    {"id": c.chunk_id, "type": c.chunk_type, "content_preview": (c.markdown or "")[:300]}
                    for c in chunks
                ]

                # Run checks
                import asyncio
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                result = loop.run_until_complete(run_checks_ai(
                    markdown=parse_result.markdown,
                    chunks=chunk_data,
                    completeness_checks=completeness_checks,
                    compliance_checks=compliance_checks,
                    document_type=doc.document_type,
                    model=model
                ))

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
                        "document_type": doc.document_type,
                        "completeness_checks": completeness_checks,
                        "compliance_checks": compliance_checks
                    },
                    model=model,
                    input_tokens=result.get("usage", {}).get("input_tokens"),
                    output_tokens=result.get("usage", {}).get("output_tokens"),
                    status="completed"
                )
                db.add(check_result)

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

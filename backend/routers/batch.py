"""API endpoints for batch document processing."""
import asyncio
import logging
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.database_models import Project, Document, BatchJob, BatchTask, ParseResult, Chunk
from services import s3_service
from services.ade_service import ade_service
from services.claude_vision_service import get_claude_vision_service
from services.gemini_vision_service import get_gemini_vision_service
from services.bedrock_vision_service import get_bedrock_vision_service
from services.classification_service import classify_document
from services.page_classification_service import get_page_classification_service

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic models for API
class BatchProcessRequest(BaseModel):
    document_ids: Optional[List[str]] = None  # If None, process all documents in project
    parser: str = "landing_ai"
    model: Optional[str] = None
    skip_already_parsed: bool = True  # Skip documents that already have results for this parser


class BatchTaskResponse(BaseModel):
    id: str
    document_id: str
    status: str
    progress: int
    parse_result_id: Optional[str]
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class BatchJobResponse(BaseModel):
    id: str
    project_id: str
    parser: str
    model: Optional[str]
    status: str
    total_documents: int
    completed_documents: int
    failed_documents: int
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    tasks: List[BatchTaskResponse] = []

    class Config:
        from_attributes = True


class BatchJobListResponse(BaseModel):
    jobs: List[BatchJobResponse]
    total: int


# Helper functions
def task_to_response(task: BatchTask) -> BatchTaskResponse:
    return BatchTaskResponse(
        id=task.id,
        document_id=task.document_id,
        status=task.status,
        progress=task.progress,
        parse_result_id=task.parse_result_id,
        error_message=task.error_message,
        started_at=task.started_at,
        completed_at=task.completed_at
    )


def job_to_response(job: BatchJob, include_tasks: bool = False) -> BatchJobResponse:
    tasks = []
    if include_tasks and job.tasks:
        tasks = [task_to_response(t) for t in job.tasks]

    return BatchJobResponse(
        id=job.id,
        project_id=job.project_id,
        parser=job.parser,
        model=job.model,
        status=job.status,
        total_documents=job.total_documents,
        completed_documents=job.completed_documents,
        failed_documents=job.failed_documents,
        error_message=job.error_message,
        created_at=job.created_at,
        started_at=job.started_at,
        completed_at=job.completed_at,
        tasks=tasks
    )


async def process_single_document(
    document_id: str,
    project_id: str,
    parser: str,
    model: Optional[str],
    task_id: str,
    db_url: str
):
    """Process a single document as part of a batch job."""
    from database import SessionLocal
    import time

    logger.info(f"[Batch] Processing document {document_id} with parser {parser}")

    db = SessionLocal()
    try:
        # Get task and document
        task = db.query(BatchTask).filter(BatchTask.id == task_id).first()
        document = db.query(Document).filter(Document.id == document_id).first()

        if not task or not document:
            logger.warning(f"[Batch] Task or document not found: task_id={task_id}, document_id={document_id}")
            return

        # Update task to processing
        task.status = "processing"
        task.started_at = datetime.utcnow()
        task.progress = 10
        db.commit()

        # Download document from S3
        try:
            logger.info(f"[Batch] Downloading document {document_id} from S3: {document.s3_key}")
            content = s3_service.download_document(document.s3_key)
            logger.info(f"[Batch] Downloaded {len(content)} bytes for document {document_id}")
            task.progress = 30
            db.commit()
        except Exception as e:
            logger.error(f"[Batch] Failed to download document {document_id}: {e}", exc_info=True)
            task.status = "failed"
            task.error_message = f"Failed to download document: {str(e)}"
            task.completed_at = datetime.utcnow()
            db.commit()
            return

        start_time = time.time()

        # Parse document
        logger.info(f"[Batch] Starting parse for document {document_id} with parser {parser}")
        try:
            if parser == "claude_vision":
                claude_service = get_claude_vision_service()
                vision_model = model or "claude-sonnet-4-20250514"
                result = await claude_service.parse_document(
                    content,
                    document.original_filename,
                    vision_model
                )
            elif parser == "gemini_vision":
                gemini_service = get_gemini_vision_service()
                vision_model = model or "gemini-2.0-flash"
                result = await gemini_service.parse_document(
                    content,
                    document.original_filename,
                    vision_model
                )
            elif parser == "bedrock_claude":
                bedrock_service = get_bedrock_vision_service()
                vision_model = model or "anthropic.claude-3-5-sonnet-20241022-v2:0"
                result = await bedrock_service.parse_document(
                    content,
                    document.original_filename,
                    vision_model
                )
            else:
                # Default to Landing AI
                result = await ade_service.parse_document(content, document.original_filename)
                vision_model = None

            task.progress = 70
            db.commit()

        except Exception as e:
            logger.error(f"[Batch] Parsing failed for document {document_id}: {e}", exc_info=True)
            task.status = "failed"
            task.error_message = f"Parsing failed: {str(e)}"
            task.completed_at = datetime.utcnow()
            db.commit()
            return

        processing_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f"[Batch] Parsing completed for document {document_id} in {processing_time_ms}ms")

        # Save result to database
        try:
            # Upload full result to S3
            s3_result_key = None
            try:
                s3_result_key = s3_service.upload_parse_result(
                    project_id=project_id,
                    document_id=document_id,
                    parser=parser,
                    result_data=result
                )
                logger.info(f"[Batch] Uploaded parse result to S3: {s3_result_key}")
            except Exception as e:
                logger.warning(f"[Batch] Failed to upload parse result to S3: {e}")

            # Create ParseResult record
            parse_result = ParseResult(
                document_id=document_id,
                parser=parser,
                model=model if parser != "landing_ai" else None,
                s3_result_key=s3_result_key,
                markdown=result.get("markdown"),
                chunk_count=len(result.get("chunks", [])),
                page_count=result.get("metadata", {}).get("page_count"),
                credit_usage=result.get("metadata", {}).get("credit_usage"),
                input_tokens=result.get("metadata", {}).get("usage", {}).get("input_tokens") if result.get("metadata", {}).get("usage") else None,
                output_tokens=result.get("metadata", {}).get("usage", {}).get("output_tokens") if result.get("metadata", {}).get("usage") else None,
                status="completed",
                processing_time_ms=processing_time_ms
            )
            db.add(parse_result)
            db.flush()

            # Update document page count if not set
            if not document.page_count:
                document.page_count = result.get("metadata", {}).get("page_count")

            # Save chunks
            for idx, chunk_data in enumerate(result.get("chunks", [])):
                grounding = chunk_data.get("grounding")
                chunk = Chunk(
                    parse_result_id=parse_result.id,
                    chunk_index=idx,
                    chunk_id=chunk_data.get("id", f"chunk_{idx}"),
                    markdown=chunk_data.get("markdown"),
                    chunk_type=chunk_data.get("type"),
                    page_number=grounding.get("page", 0) + 1 if grounding else None,
                    bbox_left=grounding.get("box", {}).get("left") if grounding else None,
                    bbox_top=grounding.get("box", {}).get("top") if grounding else None,
                    bbox_right=grounding.get("box", {}).get("right") if grounding else None,
                    bbox_bottom=grounding.get("box", {}).get("bottom") if grounding else None,
                )
                db.add(chunk)

            task.parse_result_id = parse_result.id
            task.progress = 85
            db.commit()
            logger.info(f"[Batch] Saved parse result {parse_result.id} with {len(result.get('chunks', []))} chunks")

            # Auto-classify document after parsing (V2 document-level)
            try:
                logger.info(f"[Batch] Starting document classification for {document_id}")
                await classify_document(document, parse_result, db)
                logger.info(f"[Batch] Document classification completed: {document.document_type}")
                task.progress = 90
                db.commit()
            except Exception as classify_err:
                # Classification failure shouldn't fail the whole task
                logger.error(f"[Batch] Document classification failed for {document_id}: {classify_err}", exc_info=True)

            # Auto-classify pages after parsing (V3 page-level)
            try:
                logger.info(f"[Batch] Starting page classification for {document_id}")
                chunks = db.query(Chunk).filter(Chunk.parse_result_id == parse_result.id).all()
                chunk_data = [
                    {
                        "id": c.chunk_id,
                        "type": c.chunk_type,
                        "markdown": c.markdown or "",
                        "page": c.page_number
                    }
                    for c in chunks
                ]

                classification_service = get_page_classification_service()
                page_classifications = await classification_service.classify_pages(
                    chunks=chunk_data,
                    page_count=parse_result.page_count or 1,
                    model="bedrock-claude-sonnet-3.5"
                )
                classification_service.save_classifications(
                    db=db,
                    parse_result_id=parse_result.id,
                    classifications=page_classifications
                )
                logger.info(f"[Batch] Page classification completed: {len(page_classifications)} pages classified")
                task.progress = 95
                db.commit()
            except Exception as page_classify_err:
                # Page classification failure shouldn't fail the whole task
                logger.error(f"[Batch] Page classification failed for {document_id}: {page_classify_err}", exc_info=True)

            task.status = "completed"
            task.progress = 100
            task.completed_at = datetime.utcnow()
            db.commit()

        except Exception as e:
            logger.error(f"[Batch] Failed to save result for document {document_id}: {e}", exc_info=True)
            task.status = "failed"
            task.error_message = f"Failed to save result: {str(e)}"
            task.completed_at = datetime.utcnow()
            db.commit()

    finally:
        db.close()


async def run_batch_job(job_id: str, db_url: str):
    """Run a batch job, processing documents in parallel."""
    from database import SessionLocal
    import os

    logger.info(f"[Batch] Starting batch job {job_id}")

    db = SessionLocal()
    try:
        job = db.query(BatchJob).filter(BatchJob.id == job_id).first()
        if not job:
            logger.error(f"[Batch] Job not found: {job_id}")
            return

        logger.info(f"[Batch] Found job with {job.total_documents} documents, parser={job.parser}")
        job.status = "processing"
        job.started_at = datetime.utcnow()
        db.commit()

        # Get all pending tasks
        tasks = db.query(BatchTask).filter(
            BatchTask.batch_job_id == job_id,
            BatchTask.status == "pending"
        ).all()

        logger.info(f"[Batch] Found {len(tasks)} pending tasks to process")

        # Process documents in parallel (with concurrency limit)
        max_concurrent = int(os.getenv("BATCH_CONCURRENCY", "3"))
        semaphore = asyncio.Semaphore(max_concurrent)

        async def process_with_semaphore(task):
            async with semaphore:
                await process_single_document(
                    document_id=task.document_id,
                    project_id=job.project_id,
                    parser=job.parser,
                    model=job.model,
                    task_id=task.id,
                    db_url=db_url
                )

        # Run all tasks
        logger.info(f"[Batch] Starting parallel processing with concurrency={max_concurrent}")
        await asyncio.gather(*[process_with_semaphore(t) for t in tasks])
        logger.info(f"[Batch] All tasks completed for job {job_id}")

        # Update job status
        db.refresh(job)
        completed = db.query(BatchTask).filter(
            BatchTask.batch_job_id == job_id,
            BatchTask.status == "completed"
        ).count()
        failed = db.query(BatchTask).filter(
            BatchTask.batch_job_id == job_id,
            BatchTask.status == "failed"
        ).count()

        job.completed_documents = completed
        job.failed_documents = failed
        job.status = "completed" if failed == 0 else "completed_with_errors"
        job.completed_at = datetime.utcnow()
        db.commit()

    except Exception as e:
        db.refresh(job)
        job.status = "failed"
        job.error_message = str(e)
        job.completed_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


# Endpoints
@router.post("/{project_id}/batch/process", response_model=BatchJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_batch_process(
    project_id: str,
    request: BatchProcessRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Start a batch processing job for documents in a project."""
    import os

    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get documents to process
    if request.document_ids:
        documents = db.query(Document).filter(
            Document.project_id == project_id,
            Document.id.in_(request.document_ids)
        ).all()
    else:
        documents = db.query(Document).filter(Document.project_id == project_id).all()

    if not documents:
        raise HTTPException(status_code=400, detail="No documents to process")

    # Filter out already parsed documents if requested
    if request.skip_already_parsed:
        docs_to_process = []
        for doc in documents:
            existing = db.query(ParseResult).filter(
                ParseResult.document_id == doc.id,
                ParseResult.parser == request.parser,
                ParseResult.status == "completed"
            ).first()
            if not existing:
                docs_to_process.append(doc)
        documents = docs_to_process

    if not documents:
        raise HTTPException(status_code=400, detail="All documents already have parse results for this parser")

    # Create batch job
    batch_job = BatchJob(
        project_id=project_id,
        parser=request.parser,
        model=request.model,
        total_documents=len(documents),
        status="pending"
    )
    db.add(batch_job)
    db.flush()

    # Create tasks for each document
    for doc in documents:
        task = BatchTask(
            batch_job_id=batch_job.id,
            document_id=doc.id,
            status="pending"
        )
        db.add(task)

    db.commit()
    db.refresh(batch_job)

    # Start processing in background
    db_url = os.getenv("DATABASE_URL", "")
    background_tasks.add_task(run_batch_job, batch_job.id, db_url)

    return job_to_response(batch_job, include_tasks=True)


@router.get("/{project_id}/batch/jobs", response_model=BatchJobListResponse)
async def list_batch_jobs(
    project_id: str,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """List batch jobs for a project."""
    # Verify project exists
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    query = db.query(BatchJob).filter(BatchJob.project_id == project_id)

    if status:
        query = query.filter(BatchJob.status == status)

    total = query.count()
    jobs = query.order_by(BatchJob.created_at.desc()).offset(skip).limit(limit).all()

    return BatchJobListResponse(
        jobs=[job_to_response(j) for j in jobs],
        total=total
    )


@router.get("/batch/jobs/{job_id}", response_model=BatchJobResponse)
async def get_batch_job(
    job_id: str,
    db: Session = Depends(get_db)
):
    """Get a batch job with all its tasks."""
    job = db.query(BatchJob).filter(BatchJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found")

    return job_to_response(job, include_tasks=True)


@router.post("/batch/jobs/{job_id}/cancel", response_model=BatchJobResponse)
async def cancel_batch_job(
    job_id: str,
    db: Session = Depends(get_db)
):
    """Cancel a batch job."""
    job = db.query(BatchJob).filter(BatchJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found")

    if job.status in ["completed", "failed", "cancelled"]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job with status: {job.status}")

    # Mark job as cancelled
    job.status = "cancelled"
    job.completed_at = datetime.utcnow()

    # Mark pending tasks as skipped
    db.query(BatchTask).filter(
        BatchTask.batch_job_id == job_id,
        BatchTask.status == "pending"
    ).update({"status": "skipped"})

    db.commit()
    db.refresh(job)

    return job_to_response(job, include_tasks=True)

"""API endpoints for generating PDF reports."""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

from database import get_db
from models.database_models import Document, Project, CheckResult, BatchCheckRun

router = APIRouter()


class ReportRequest(BaseModel):
    title: Optional[str] = None
    include_details: bool = True
    generated_by: Optional[str] = None


@router.post("/documents/{document_id}/report")
async def generate_document_report(
    document_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for a document's check results."""
    document = db.query(Document).filter(Document.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    result = db.query(CheckResult).filter(
        CheckResult.document_id == document_id
    ).order_by(CheckResult.created_at.desc()).first()

    if not result:
        raise HTTPException(status_code=400, detail="No check results for document")

    pdf_buffer = generate_document_pdf(
        title=body.title or f"Compliance Report - {document.original_filename}",
        document=document,
        result=result,
        include_details=body.include_details,
        generated_by=body.generated_by
    )

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=check_report_{document_id[:8]}.pdf"}
    )


@router.post("/projects/{project_id}/report")
async def generate_project_report(
    project_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for all documents in a project."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    documents = db.query(Document).filter(Document.project_id == project_id).all()

    results = []
    for doc in documents:
        result = db.query(CheckResult).filter(
            CheckResult.document_id == doc.id
        ).order_by(CheckResult.created_at.desc()).first()
        if result:
            results.append((doc, result))

    if not results:
        raise HTTPException(status_code=400, detail="No check results for any documents in project")

    pdf_buffer = generate_project_pdf(
        title=body.title or f"Compliance Report - {project.name}",
        project=project,
        documents_results=results,
        include_details=body.include_details,
        generated_by=body.generated_by
    )

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=project_report_{project_id[:8]}.pdf"}
    )


@router.post("/batch-runs/{batch_run_id}/report")
async def generate_batch_report(
    batch_run_id: str,
    body: ReportRequest = ReportRequest(),
    db: Session = Depends(get_db)
):
    """Generate PDF report for a batch check run."""
    batch_run = db.query(BatchCheckRun).filter(BatchCheckRun.id == batch_run_id).first()
    if not batch_run:
        raise HTTPException(status_code=404, detail="Batch run not found")

    results = db.query(CheckResult).filter(CheckResult.batch_run_id == batch_run_id).all()

    # Get documents for each result
    results_with_docs = []
    for result in results:
        doc = db.query(Document).filter(Document.id == result.document_id).first()
        if doc:
            results_with_docs.append((doc, result))

    pdf_buffer = generate_batch_pdf(
        title=body.title or "Batch Compliance Report",
        batch_run=batch_run,
        results=results_with_docs,
        include_details=body.include_details,
        generated_by=body.generated_by
    )

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=batch_report_{batch_run_id[:8]}.pdf"}
    )


def generate_document_pdf(title: str, document, result, include_details: bool = True, generated_by: str = None) -> bytes:
    """Generate PDF for single document."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=15*mm, rightMargin=15*mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm, fontSize=16)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=12, spaceAfter=5*mm, spaceBefore=8*mm)
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, leading=14)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.grey)

    story = []

    # Title
    story.append(Paragraph(title, title_style))
    story.append(Spacer(1, 5*mm))

    # Document Info
    story.append(Paragraph(f"<b>Document:</b> {document.original_filename}", normal_style))
    story.append(Paragraph(f"<b>Type:</b> {document.document_type or 'Not classified'}", normal_style))
    story.append(Paragraph(f"<b>Report Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Paragraph(f"<b>Check Run:</b> #{result.run_number} ({result.created_at.strftime('%Y-%m-%d %H:%M')})", normal_style))
    if generated_by:
        story.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal_style))
    story.append(Spacer(1, 10*mm))

    # Summary table
    summary = result.summary or {}
    story.append(Paragraph("Summary", heading_style))

    summary_data = [
        ["Status", "Count"],
        ["Passed", str(summary.get("passed", 0))],
        ["Failed", str(summary.get("failed", 0))],
        ["Needs Review", str(summary.get("needs_review", 0))],
        ["N/A", str(summary.get("na", 0))],
        ["Total", str(summary.get("total_checks", 0))],
    ]
    t = Table(summary_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#f0f9ff')),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))

    if include_details:
        # Completeness checks
        if result.completeness_results:
            story.append(Paragraph("Completeness Checks", heading_style))
            for check in result.completeness_results:
                status = check.get("status", "unknown")
                icon = get_status_icon(status)
                color = get_status_color(status)
                check_text = f'<font color="{color}">{icon}</font> <b>{check.get("check_name", "Unknown")}</b>'
                if check.get("notes"):
                    check_text += f': {check.get("notes")}'
                if check.get("found_value"):
                    check_text += f' <i>(Found: {check.get("found_value")})</i>'
                story.append(Paragraph(check_text, normal_style))
            story.append(Spacer(1, 5*mm))

        # Compliance checks
        if result.compliance_results:
            story.append(Paragraph("Compliance Checks", heading_style))
            for check in result.compliance_results:
                status = check.get("status", "unknown")
                icon = get_status_icon(status)
                color = get_status_color(status)
                check_text = f'<font color="{color}">{icon}</font> <b>{check.get("check_name", "Unknown")}</b>'
                if check.get("rule_reference"):
                    check_text += f' <font color="gray">[{check.get("rule_reference")}]</font>'
                if check.get("notes"):
                    check_text += f': {check.get("notes")}'
                if check.get("found_value"):
                    check_text += f' <i>(Found: {check.get("found_value")})</i>'
                story.append(Paragraph(check_text, normal_style))

    # Footer
    story.append(Spacer(1, 15*mm))
    story.append(Paragraph("Generated by CompliCheckAI", small_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_project_pdf(title: str, project, documents_results: list, include_details: bool = True, generated_by: str = None) -> bytes:
    """Generate PDF for entire project."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=15*mm, rightMargin=15*mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm, fontSize=16)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=12, spaceAfter=5*mm, spaceBefore=8*mm)
    subheading_style = ParagraphStyle('Subheading', parent=styles['Heading3'], fontSize=11, spaceAfter=3*mm, spaceBefore=5*mm)
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, leading=14)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.grey)

    story = []

    # Title
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(f"<b>Project:</b> {project.name}", normal_style))
    story.append(Paragraph(f"<b>Report Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    story.append(Paragraph(f"<b>Documents:</b> {len(documents_results)}", normal_style))
    if generated_by:
        story.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal_style))
    story.append(Spacer(1, 10*mm))

    # Overall summary
    total_passed = sum(r.summary.get("passed", 0) for _, r in documents_results if r.summary)
    total_failed = sum(r.summary.get("failed", 0) for _, r in documents_results if r.summary)
    total_review = sum(r.summary.get("needs_review", 0) for _, r in documents_results if r.summary)
    total_na = sum(r.summary.get("na", 0) for _, r in documents_results if r.summary)

    story.append(Paragraph("Overall Summary", heading_style))
    summary_data = [
        ["Status", "Count"],
        ["Passed", str(total_passed)],
        ["Failed", str(total_failed)],
        ["Needs Review", str(total_review)],
        ["N/A", str(total_na)],
    ]
    t = Table(summary_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))

    # Document status overview
    story.append(Paragraph("Documents Overview", heading_style))
    doc_data = [["Document", "Type", "Passed", "Failed", "Review"]]
    for doc, result in documents_results:
        summary = result.summary or {}
        doc_data.append([
            doc.original_filename[:30] + "..." if len(doc.original_filename) > 30 else doc.original_filename,
            (doc.document_type or "unknown")[:15],
            str(summary.get("passed", 0)),
            str(summary.get("failed", 0)),
            str(summary.get("needs_review", 0))
        ])

    if len(doc_data) > 1:
        t = Table(doc_data, colWidths=[70*mm, 35*mm, 20*mm, 20*mm, 20*mm])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
        ]))
        story.append(t)

    # Per-document details if requested
    if include_details:
        story.append(Spacer(1, 10*mm))
        story.append(Paragraph("Document Details", heading_style))

        for doc, result in documents_results:
            story.append(Paragraph(f"<b>{doc.original_filename}</b> ({doc.document_type or 'unclassified'})", subheading_style))
            summary = result.summary or {}
            story.append(Paragraph(
                f"Passed: {summary.get('passed', 0)} | "
                f"Failed: {summary.get('failed', 0)} | "
                f"Review: {summary.get('needs_review', 0)}",
                normal_style
            ))
            story.append(Spacer(1, 3*mm))

    # Footer
    story.append(Spacer(1, 15*mm))
    story.append(Paragraph("Generated by CompliCheckAI", small_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def generate_batch_pdf(title: str, batch_run, results: list, include_details: bool = True, generated_by: str = None) -> bytes:
    """Generate PDF for batch run."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm, leftMargin=15*mm, rightMargin=15*mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title', parent=styles['Heading1'], alignment=TA_CENTER, spaceAfter=10*mm, fontSize=16)
    heading_style = ParagraphStyle('Heading', parent=styles['Heading2'], fontSize=12, spaceAfter=5*mm, spaceBefore=8*mm)
    normal_style = ParagraphStyle('Normal', parent=styles['Normal'], fontSize=10, leading=14)
    small_style = ParagraphStyle('Small', parent=styles['Normal'], fontSize=8, leading=10, textColor=colors.grey)

    story = []

    # Title
    story.append(Paragraph(title, title_style))
    story.append(Paragraph(f"<b>Batch Run ID:</b> {batch_run.id[:8]}...", normal_style))
    story.append(Paragraph(f"<b>Status:</b> {batch_run.status}", normal_style))
    story.append(Paragraph(f"<b>Report Date:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}", normal_style))
    if batch_run.started_at:
        story.append(Paragraph(f"<b>Started:</b> {batch_run.started_at.strftime('%Y-%m-%d %H:%M')}", normal_style))
    if batch_run.completed_at:
        story.append(Paragraph(f"<b>Completed:</b> {batch_run.completed_at.strftime('%Y-%m-%d %H:%M')}", normal_style))
    if generated_by:
        story.append(Paragraph(f"<b>Generated by:</b> {generated_by}", normal_style))
    story.append(Spacer(1, 10*mm))

    # Progress summary
    story.append(Paragraph("Processing Summary", heading_style))
    progress_data = [
        ["Metric", "Count"],
        ["Total Documents", str(batch_run.total_documents)],
        ["Completed", str(batch_run.completed_documents)],
        ["Failed", str(batch_run.failed_documents)],
        ["Skipped", str(batch_run.skipped_documents)],
    ]
    t = Table(progress_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(t)
    story.append(Spacer(1, 10*mm))

    # Check results summary
    story.append(Paragraph("Check Results Summary", heading_style))
    results_data = [
        ["Status", "Count"],
        ["Passed", str(batch_run.total_passed)],
        ["Failed", str(batch_run.total_failed)],
        ["Needs Review", str(batch_run.total_needs_review)],
    ]
    t = Table(results_data, colWidths=[80*mm, 40*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10b981')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
    ]))
    story.append(t)

    # Document list
    if results and include_details:
        story.append(Spacer(1, 10*mm))
        story.append(Paragraph("Documents Processed", heading_style))

        doc_data = [["Document", "Type", "Status", "Passed", "Failed"]]
        for doc, result in results:
            summary = result.summary or {}
            doc_data.append([
                doc.original_filename[:25] + "..." if len(doc.original_filename) > 25 else doc.original_filename,
                (doc.document_type or "unknown")[:12],
                result.status,
                str(summary.get("passed", 0)),
                str(summary.get("failed", 0))
            ])

        if len(doc_data) > 1:
            t = Table(doc_data, colWidths=[55*mm, 30*mm, 25*mm, 20*mm, 20*mm])
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#0ea5e9')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('ALIGN', (0, 0), (0, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
            ]))
            story.append(t)

    # Footer
    story.append(Spacer(1, 15*mm))
    story.append(Paragraph("Generated by CompliCheckAI", small_style))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()


def get_status_icon(status: str) -> str:
    """Get icon character for status."""
    icons = {
        "pass": "[PASS]",
        "fail": "[FAIL]",
        "needs_review": "[REVIEW]",
        "na": "[N/A]"
    }
    return icons.get(status, "[?]")


def get_status_color(status: str) -> str:
    """Get color for status."""
    colors_map = {
        "pass": "#10b981",
        "fail": "#ef4444",
        "needs_review": "#f59e0b",
        "na": "#6b7280"
    }
    return colors_map.get(status, "#6b7280")

/**
 * PDF Export Utility - Export document pages with annotation stickies
 * Uses jspdf to generate a PDF with annotations overlaid
 */
import { jsPDF } from 'jspdf';
import * as pdfjs from 'pdfjs-dist';
import type { Annotation } from '../types/annotation';
import type { Chunk } from '../types/ade';
import { ANNOTATION_BORDER_COLORS } from '../types/annotation';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface ExportOptions {
  file: File;
  annotations: Annotation[];
  chunks?: Chunk[];
  highlightAnnotatedChunks?: boolean;
  includeAnnotationText?: boolean;
}


/**
 * Export PDF with annotation stickies overlaid
 */
export async function exportPDFWithAnnotations(options: ExportOptions): Promise<Blob> {
  const { file, annotations, chunks = [], highlightAnnotatedChunks = true, includeAnnotationText = true } = options;

  // Load the PDF
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;

  // Create new jsPDF document
  // Get first page to determine orientation
  const firstPage = await pdf.getPage(1);
  const firstViewport = firstPage.getViewport({ scale: 1 });
  const isLandscape = firstViewport.width > firstViewport.height;

  const doc = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [firstViewport.width, firstViewport.height],
  });

  // Process each page
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (pageNum > 1) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      doc.addPage([viewport.width, viewport.height], viewport.width > viewport.height ? 'landscape' : 'portrait');
    }

    const page = await pdf.getPage(pageNum);
    const scale = 2; // Higher scale for better quality
    const viewport = page.getViewport({ scale });

    // Render page to canvas
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({
      canvasContext: ctx,
      viewport,
    }).promise;

    // Get page annotations (filter by page number)
    const pageAnnotations = annotations.filter(a =>
      a.page_number === pageNum ||
      (a.level === 'document' && pageNum === 1) // Show doc-level on first page
    );

    // Get chunks linked to these annotations
    const linkedChunkIds = new Set(
      pageAnnotations
        .filter(a => a.chunk_id)
        .map(a => a.chunk_id!)
    );

    // Highlight linked chunks
    if (highlightAnnotatedChunks && linkedChunkIds.size > 0) {
      const pageChunks = chunks.filter(c =>
        linkedChunkIds.has(c.id) &&
        c.grounding?.page === pageNum - 1
      );

      ctx.save();
      pageChunks.forEach(chunk => {
        if (chunk.grounding?.box) {
          const { left, top, right, bottom } = chunk.grounding.box;
          const x = left * viewport.width;
          const y = top * viewport.height;
          const w = (right - left) * viewport.width;
          const h = (bottom - top) * viewport.height;

          // Draw highlight
          ctx.fillStyle = 'rgba(251, 191, 36, 0.25)'; // Amber highlight
          ctx.fillRect(x, y, w, h);

          // Draw border
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
        }
      });
      ctx.restore();
    }

    // Draw annotation stickies
    if (includeAnnotationText) {
      ctx.save();

      // Calculate sticky positions (avoid overlap)
      const stickyWidth = 180 * scale;
      const stickyHeight = 60 * scale;
      const margin = 10 * scale;
      const startX = viewport.width - stickyWidth - margin;
      let currentY = margin;

      pageAnnotations.forEach((annotation, index) => {
        const y = currentY + (index * (stickyHeight + margin / 2));

        // Skip if off page
        if (y + stickyHeight > viewport.height - margin) return;

        // Get color based on level
        const borderColor = ANNOTATION_BORDER_COLORS[annotation.level] || '#fbbf24';
        const bgColor = annotation.level === 'page'
          ? 'rgba(251, 191, 36, 0.95)'
          : annotation.level === 'document'
            ? 'rgba(96, 165, 250, 0.95)'
            : 'rgba(74, 222, 128, 0.95)';

        // Draw sticky note background with shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 8 * scale;
        ctx.shadowOffsetX = 2 * scale;
        ctx.shadowOffsetY = 2 * scale;

        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.roundRect(startX, y, stickyWidth, stickyHeight, 4 * scale);
        ctx.fill();

        // Reset shadow for border and text
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Draw border
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2 * scale;
        ctx.stroke();

        // Draw text
        ctx.fillStyle = '#1e293b'; // slate-800
        ctx.font = `bold ${10 * scale}px system-ui, sans-serif`;

        // Level label
        const levelLabel = annotation.level === 'page'
          ? `Page ${annotation.page_number}`
          : annotation.level === 'document'
            ? 'Document'
            : 'Project';
        ctx.fillText(levelLabel, startX + 8 * scale, y + 14 * scale);

        // Annotation text (truncated)
        ctx.font = `${9 * scale}px system-ui, sans-serif`;
        const maxTextWidth = stickyWidth - 16 * scale;
        const text = annotation.text.length > 80
          ? annotation.text.substring(0, 77) + '...'
          : annotation.text;

        // Word wrap
        const words = text.split(' ');
        let line = '';
        let lineY = y + 28 * scale;
        const lineHeight = 12 * scale;

        words.forEach(word => {
          const testLine = line + word + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && line !== '') {
            ctx.fillText(line.trim(), startX + 8 * scale, lineY);
            line = word + ' ';
            lineY += lineHeight;
          } else {
            line = testLine;
          }
        });
        if (line.trim() && lineY < y + stickyHeight - 8 * scale) {
          ctx.fillText(line.trim(), startX + 8 * scale, lineY);
        }

        // Draw connector line to linked chunk if exists
        if (annotation.chunk_id) {
          const linkedChunk = chunks.find(c => c.id === annotation.chunk_id);
          if (linkedChunk?.grounding?.box && linkedChunk.grounding.page === pageNum - 1) {
            const box = linkedChunk.grounding.box;
            const chunkCenterX = ((box.left + box.right) / 2) * viewport.width;
            const chunkCenterY = ((box.top + box.bottom) / 2) * viewport.height;

            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.5 * scale;
            ctx.setLineDash([4 * scale, 4 * scale]);
            ctx.beginPath();
            ctx.moveTo(startX, y + stickyHeight / 2);
            ctx.lineTo(chunkCenterX, chunkCenterY);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      });

      ctx.restore();
    }

    // Add page to PDF
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const pageViewport = page.getViewport({ scale: 1 });

    doc.addImage(
      imgData,
      'JPEG',
      0,
      0,
      pageViewport.width,
      pageViewport.height,
      undefined,
      'FAST'
    );
  }

  // Return as blob
  return doc.output('blob');
}

/**
 * Download PDF with annotations
 */
export async function downloadPDFWithAnnotations(
  file: File,
  annotations: Annotation[],
  chunks?: Chunk[],
  filename?: string
): Promise<void> {
  const blob = await exportPDFWithAnnotations({
    file,
    annotations,
    chunks,
    highlightAnnotatedChunks: true,
    includeAnnotationText: true,
  });

  // Create download link
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `${file.name.replace('.pdf', '')}_annotated.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

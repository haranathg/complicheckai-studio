import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { Chunk } from '../types/ade';
import type { Annotation } from '../types/annotation';
import ChunkOverlay from './ChunkOverlay';
import AnnotationOverlay from './AnnotationOverlay';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker for react-pdf v9 with pdfjs-dist v4
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

interface PDFViewerProps {
  file: File;
  chunks: Chunk[];
  selectedChunk: Chunk | null;
  onChunkClick: (chunk: Chunk) => void;
  onPdfReady?: () => void;
  targetPage?: number;
  onPageChange?: (page: number) => void;
  annotations?: Annotation[];
  selectedAnnotation?: Annotation | null;
  onAnnotationClick?: (annotation: Annotation) => void;
  showChunks?: boolean;
  showAnnotations?: boolean;
}

export default function PDFViewer({
  file,
  chunks,
  selectedChunk,
  onChunkClick,
  onPdfReady,
  targetPage,
  onPageChange,
  annotations = [],
  selectedAnnotation,
  onAnnotationClick,
  showChunks = true,
  showAnnotations = true,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [canvasOffset, setCanvasOffset] = useState({ left: 0, top: 0 });
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [, setIsPageLoading] = useState(true);
  const [fileKey, setFileKey] = useState(0);
  const [lastTargetPage, setLastTargetPage] = useState<number | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Reset state when file changes
  useEffect(() => {
    if (file) {
      setPageSize({ width: 0, height: 0 });
      setCurrentPage(1);
      setNumPages(0);
      setPdfError(null);
      setIsPageLoading(true);
      setFileKey((k) => k + 1);
    }
  }, [file]);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth - 32);
      }
    };
    requestAnimationFrame(updateWidth);
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [file]);

  // Navigate to target page when it changes (only when targetPage actually changes)
  useEffect(() => {
    if (targetPage && targetPage >= 1 && targetPage <= numPages && targetPage !== lastTargetPage) {
      setLastTargetPage(targetPage);
      if (targetPage !== currentPage) {
        setPageSize({ width: 0, height: 0 });
        setCurrentPage(targetPage);
      }
    }
  }, [targetPage, numPages, lastTargetPage, currentPage]);

  // Scroll to selected chunk when it changes
  useEffect(() => {
    if (selectedChunk && selectedChunk.grounding && containerRef.current && pageSize.height > 0) {
      // Calculate the chunk's position on the page
      const chunkTop = selectedChunk.grounding.box.top * pageSize.height;
      const chunkBottom = selectedChunk.grounding.box.bottom * pageSize.height;
      const chunkCenter = (chunkTop + chunkBottom) / 2;

      // Get the container's visible height
      const containerHeight = containerRef.current.clientHeight;

      // Scroll to center the chunk in view
      const scrollTarget = chunkCenter - (containerHeight / 2) + 60; // +60 for padding/header
      containerRef.current.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [selectedChunk, pageSize]);

  // Notify parent when page changes
  useEffect(() => {
    onPageChange?.(currentPage);
  }, [currentPage, onPageChange]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    console.log('PDF document loaded, pages:', numPages);
    setNumPages(numPages);
    setCurrentPage(1);
    setPdfError(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error('PDF document load error:', error);
    setPdfError(error.message);
    setIsPageLoading(false);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onPageLoadSuccess = useCallback((page: any) => {
    // Calculate the actual rendered size based on the width we set
    // page.width and page.height are original PDF dimensions
    // We render at containerWidth * scale, so calculate the rendered height proportionally
    const renderedWidth = containerWidth * scale;
    const aspectRatio = page.height / page.width;
    const renderedHeight = renderedWidth * aspectRatio;

    console.log('PDF page loaded, original:', page.width, 'x', page.height, 'rendered:', renderedWidth, 'x', renderedHeight);

    // Use requestAnimationFrame to ensure the canvas is rendered
    requestAnimationFrame(() => {
      if (pageContainerRef.current) {
        const canvas = pageContainerRef.current.querySelector('canvas');
        if (canvas) {
          // Get the actual rendered dimensions from the canvas
          // Use getBoundingClientRect for accurate dimensions
          const rect = canvas.getBoundingClientRect();
          const offsetLeft = canvas.offsetLeft;
          const offsetTop = canvas.offsetTop;
          console.log('Canvas bounding rect:', rect.width, 'x', rect.height);
          console.log('Canvas offset within container:', offsetLeft, offsetTop);
          setPageSize({
            width: rect.width,
            height: rect.height,
          });
          setCanvasOffset({
            left: offsetLeft,
            top: offsetTop,
          });
        } else {
          setPageSize({
            width: renderedWidth,
            height: renderedHeight,
          });
          setCanvasOffset({ left: 0, top: 0 });
        }
      } else {
        setPageSize({
          width: renderedWidth,
          height: renderedHeight,
        });
        setCanvasOffset({ left: 0, top: 0 });
      }
      setIsPageLoading(false);
      onPdfReady?.();
    });
  }, [onPdfReady, containerWidth, scale]);

  const onPageLoadError = useCallback((error: Error) => {
    console.error('PDF page load error:', error);
    setPdfError(error.message);
    setIsPageLoading(false);
  }, []);

  const pageChunks = chunks.filter(
    (c) => c.grounding?.page === currentPage - 1
  );

  // Filter annotations for current page
  // Include: page-level annotations for this page, document-level, project-level
  // Also include annotations linked to chunks on this page
  const pageAnnotations = annotations.filter((a) => {
    // Page-level annotation for current page
    if (a.level === 'page' && a.page_number === currentPage) {
      return true;
    }
    // Document or project level annotations show on page 1
    if ((a.level === 'document' || a.level === 'project') && currentPage === 1) {
      return true;
    }
    // Annotation linked to a chunk - check if chunk is on current page
    if (a.chunk_id) {
      const linkedChunk = chunks.find(c => c.id === a.chunk_id);
      if (linkedChunk && linkedChunk.grounding?.page === currentPage - 1) {
        return true;
      }
    }
    return false;
  });

  // Debug: log chunk coordinates
  if (pageChunks.length > 0 && pageSize.width > 0) {
    console.log('Page chunks with coordinates:', pageChunks.map(c => ({
      type: c.type,
      box: c.grounding?.box,
      content: c.markdown.substring(0, 50)
    })));
  }

  const goToPrevPage = () => {
    setPageSize({ width: 0, height: 0 });
    setCurrentPage((p) => Math.max(1, p - 1));
  };
  const goToNextPage = () => {
    setPageSize({ width: 0, height: 0 });
    setCurrentPage((p) => Math.min(numPages, p + 1));
  };
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.1));
  const zoomOut = () => setScale((s) => Math.max(0.3, s - 0.1));
  const fitToWidth = () => setScale(1.0);

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Controls */}
      <div className="sticky top-0 z-20 bg-white border-b px-4 py-2 flex items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            ←
          </button>
          <span className="text-sm text-gray-600 min-w-[100px] text-center">
            Page {currentPage} of {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.3}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            −
          </button>
          <span className="text-sm text-gray-600 min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            +
          </button>
          <button
            onClick={fitToWidth}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors text-sm"
          >
            Fit
          </button>
        </div>
      </div>

      {/* PDF Document */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4">
        <div className="flex justify-center">
          <div className="relative inline-block shadow-lg bg-white">
            {pdfError ? (
              <div className="flex flex-col items-center justify-center h-96 w-64 bg-white text-red-500 p-4">
                <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-center">Failed to load PDF</p>
                <p className="text-xs text-gray-500 mt-1 text-center">{pdfError}</p>
              </div>
            ) : file && containerWidth > 0 ? (
              <Document
                key={`doc-${fileKey}`}
                file={file}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={
                  <div className="flex items-center justify-center h-96 w-64 bg-white">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                  </div>
                }
              >
                <div ref={pageContainerRef} className="relative">
                  <Page
                    key={`page-${currentPage}-${fileKey}`}
                    pageNumber={currentPage}
                    width={containerWidth * scale}
                    onLoadSuccess={onPageLoadSuccess}
                    onLoadError={onPageLoadError}
                    onRenderSuccess={() => {
                      console.log('PDF page rendered successfully');
                      setIsPageLoading(false);
                      onPdfReady?.();
                    }}
                    onRenderError={(error: Error) => {
                      console.error('PDF page render error:', error);
                      setPdfError(`Render error: ${error.message}`);
                    }}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <div className="flex items-center justify-center h-96 w-64 bg-white">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      </div>
                    }
                  />
                  {/* Chunk Overlays - positioned to match canvas exactly */}
                  {/* When showChunks is false (Review tab), only show chunks linked to annotations (if overlays enabled) */}
                  {pageSize.width > 0 && (showChunks || (showAnnotations && pageAnnotations.some(a => a.chunk_id))) && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: canvasOffset.left,
                        top: canvasOffset.top,
                        width: pageSize.width,
                        height: pageSize.height,
                      }}
                    >
                      {pageChunks
                        .filter(chunk => showChunks || pageAnnotations.some(a => a.chunk_id === chunk.id))
                        .map((chunk) => (
                        <ChunkOverlay
                          key={chunk.id}
                          chunk={chunk}
                          pageWidth={pageSize.width}
                          pageHeight={pageSize.height}
                          isSelected={selectedChunk?.id === chunk.id}
                          onClick={() => onChunkClick(chunk)}
                        />
                      ))}
                    </div>
                  )}
                  {/* Annotation Overlays - rendered above chunks */}
                  {/* When showChunks is true (Parse tab), only show stickies tied to chunks */}
                  {/* When showChunks is false (Review tab), show all stickies (unless toggled off) */}
                  {pageSize.width > 0 && showAnnotations && pageAnnotations.length > 0 && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: canvasOffset.left,
                        top: canvasOffset.top,
                        width: pageSize.width,
                        height: pageSize.height,
                      }}
                    >
                      {pageAnnotations
                        .filter(a => !showChunks || a.chunk_id)
                        .map((annotation) => {
                        // For chunk-linked annotations, get bbox from the linked chunk
                        let annotationWithBbox = annotation;
                        if (annotation.chunk_id && !annotation.bbox) {
                          const linkedChunk = chunks.find(c => c.id === annotation.chunk_id);
                          if (linkedChunk?.grounding?.box) {
                            annotationWithBbox = {
                              ...annotation,
                              bbox: {
                                left: linkedChunk.grounding.box.right + 0.01,
                                top: linkedChunk.grounding.box.top,
                                right: linkedChunk.grounding.box.right + 0.15,
                                bottom: linkedChunk.grounding.box.top + 0.1,
                              },
                            };
                          }
                        }
                        return (
                          <AnnotationOverlay
                            key={annotation.id}
                            annotation={annotationWithBbox}
                            pageWidth={pageSize.width}
                            pageHeight={pageSize.height}
                            isSelected={selectedAnnotation?.id === annotation.id}
                            onClick={() => onAnnotationClick?.(annotation)}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </Document>
            ) : (
              <div className="flex items-center justify-center h-96 w-64 bg-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-t px-4 py-2 flex flex-wrap gap-3 text-xs">
        {showChunks ? (
          <>
            <span className="text-gray-500 font-medium">Component types:</span>
            {['text', 'table', 'figure', 'title', 'caption', 'form_field'].map((type) => (
              <span key={type} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded"
                  style={{
                    backgroundColor:
                      type === 'text' ? 'rgba(59, 130, 246, 0.5)' :
                      type === 'table' ? 'rgba(34, 197, 94, 0.5)' :
                      type === 'figure' ? 'rgba(249, 115, 22, 0.5)' :
                      type === 'title' ? 'rgba(168, 85, 247, 0.5)' :
                      type === 'caption' ? 'rgba(236, 72, 153, 0.5)' :
                      'rgba(20, 184, 166, 0.5)',
                  }}
                />
                {type}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-gray-500 font-medium">Annotation levels:</span>
            {[
              { level: 'page', color: 'rgba(251, 191, 36, 0.85)' },
              { level: 'document', color: 'rgba(74, 222, 128, 0.85)' },
              { level: 'project', color: 'rgba(96, 165, 250, 0.85)' },
            ].map(({ level, color }) => (
              <span key={level} className="flex items-center gap-1">
                <span
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                {level}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

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

// Page classification type
interface PageClassification {
  page: number;
  page_type: string;
  confidence?: number;
}

// Page type labels for display
const PAGE_TYPE_LABELS: Record<string, string> = {
  floor_plan: 'Floor Plan',
  site_plan: 'Site Plan',
  elevation: 'Elevation',
  section: 'Section',
  detail: 'Detail',
  schedule: 'Schedule',
  cover_sheet: 'Cover Sheet',
  form: 'Form',
  letter: 'Letter',
  certificate: 'Certificate',
  report: 'Report',
  photo: 'Photo',
  table: 'Table',
  specification: 'Specification',
  unknown: 'Unknown',
};

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
  // Legend filter controls
  visibleChunkTypes?: Set<string>;
  onToggleChunkType?: (type: string) => void;
  visibleNoteLevels?: Set<string>;
  onToggleNoteLevel?: (level: string) => void;
  // Control which legends to show
  showComponentsLegend?: boolean;
  showNotesLegend?: boolean;
  // Focus mode: only show the selected chunk, hide all others
  focusMode?: boolean;
  // Page classifications for V3 page-level types
  pageClassifications?: PageClassification[];
  // Fullscreen mode
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;
}

// Default all chunk types visible
const ALL_CHUNK_TYPES = new Set(['text', 'table', 'figure', 'title', 'caption', 'form_field']);
const ALL_NOTE_LEVELS = new Set(['page', 'document', 'project']);

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
  visibleChunkTypes = ALL_CHUNK_TYPES,
  onToggleChunkType,
  visibleNoteLevels = ALL_NOTE_LEVELS,
  onToggleNoteLevel,
  showComponentsLegend = true,
  showNotesLegend = false,
  focusMode = false,
  pageClassifications = [],
  isFullscreen = false,
  onFullscreenToggle,
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
      setLastTargetPage(undefined); // Reset so page navigation works for new document
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

  // Navigate to target page when it changes
  // We use lastTargetPage to track if we already processed this request
  useEffect(() => {
    if (targetPage && targetPage >= 1 && targetPage <= numPages) {
      // Only process if this is a new target page request
      if (targetPage !== lastTargetPage) {
        setLastTargetPage(targetPage);
        if (targetPage !== currentPage) {
          setPageSize({ width: 0, height: 0 });
          setCurrentPage(targetPage);
        }
      }
    }
  }, [targetPage, numPages, lastTargetPage, currentPage]);

  // Reset lastTargetPage when selectedAnnotation or selectedChunk changes
  // This allows navigating back to the same page when clicking a different item
  useEffect(() => {
    setLastTargetPage(undefined);
  }, [selectedAnnotation?.id, selectedChunk?.id]);

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
    // Provide more helpful error messages for common issues
    let errorMessage = error.message;
    if (error.message.includes('Invalid PDF structure') || error.message.includes('Missing PDF')) {
      errorMessage = 'Invalid PDF structure. The file may be corrupted or not a valid PDF.';
    } else if (error.message.includes('worker')) {
      errorMessage = 'PDF worker failed to load. Please refresh the page.';
    }
    setPdfError(errorMessage);
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
          const containerRect = pageContainerRef.current.getBoundingClientRect();

          // Calculate actual offset relative to the pageContainerRef
          const actualOffsetLeft = rect.left - containerRect.left;
          const actualOffsetTop = rect.top - containerRect.top;

          console.log('Canvas bounding rect:', rect.width, 'x', rect.height);
          console.log('Container bounding rect:', containerRect.width, 'x', containerRect.height);
          console.log('Canvas actual offset relative to container:', actualOffsetLeft, actualOffsetTop);
          console.log('Canvas offsetLeft/offsetTop (may be wrong):', canvas.offsetLeft, canvas.offsetTop);
          console.log('Canvas offsetParent:', canvas.offsetParent?.tagName, canvas.offsetParent?.className);

          setPageSize({
            width: rect.width,
            height: rect.height,
          });
          setCanvasOffset({
            left: actualOffsetLeft,
            top: actualOffsetTop,
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
      // Note: onPdfReady is called in onRenderSuccess instead, after page is fully rendered
    });
  }, [containerWidth, scale]);

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

  // Debug: log chunk coordinates and page dimensions
  if (pageChunks.length > 0 && pageSize.width > 0) {
    console.log('=== PDF Overlay Debug ===');
    console.log('Current page:', currentPage, '(0-indexed:', currentPage - 1, ')');
    console.log('Page size:', pageSize.width, 'x', pageSize.height);
    console.log('Canvas offset:', canvasOffset);
    console.log('Focus mode:', focusMode, '| Selected chunk:', selectedChunk?.id?.substring(0, 20));
    // If there's a selected chunk, show its details
    if (selectedChunk?.grounding?.box) {
      const b = selectedChunk.grounding.box;
      console.log('*** SELECTED CHUNK ***');
      console.log(`  ID: ${selectedChunk.id}`);
      console.log(`  Type: ${selectedChunk.type}`);
      console.log(`  Page: ${selectedChunk.grounding.page}`);
      console.log(`  Box: top=${b.top} left=${b.left} right=${b.right} bottom=${b.bottom}`);
      console.log(`  Pixel pos: top=${Math.round(b.top * pageSize.height)}px left=${Math.round(b.left * pageSize.width)}px`);
      console.log(`  Content: "${selectedChunk.markdown.substring(0, 50)}..."`);
    }
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
            {numPages > 0 ? `Page ${currentPage} of ${numPages}` : 'Loading...'}
          </span>
          <button
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            →
          </button>
          {/* Page Type Badge */}
          {(() => {
            const pageType = pageClassifications.find(pc => pc.page === currentPage)?.page_type;
            if (pageType) {
              return (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                  {PAGE_TYPE_LABELS[pageType] || pageType}
                </span>
              );
            }
            return null;
          })()}
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
          {/* Fullscreen Toggle */}
          {onFullscreenToggle && (
            <button
              onClick={onFullscreenToggle}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          )}
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
                  {/* When showChunks is true: show all chunks (Parse tab) */}
                  {/* When showChunks is false: only show chunks linked to annotations if showAnnotations is also true */}
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
                        .filter(chunk => {
                          // In focus mode, very strict filtering
                          if (focusMode) {
                            // If we have a selected chunk, only show that chunk
                            if (selectedChunk) {
                              return selectedChunk.id === chunk.id;
                            }
                            // If we have a selected annotation, only show the chunk linked to it (if any)
                            if (selectedAnnotation && selectedAnnotation.chunk_id) {
                              return selectedAnnotation.chunk_id === chunk.id;
                            }
                            // Focus mode with annotation but no linked chunk - hide all chunks
                            return false;
                          }
                          // First check if chunk should be shown at all
                          const shouldShow = showChunks || (showAnnotations && pageAnnotations.some(a => a.chunk_id === chunk.id));
                          if (!shouldShow) return false;
                          // Then filter by visible chunk types (unless it's a selected chunk - always show that)
                          if (selectedChunk?.id === chunk.id) return true;
                          return visibleChunkTypes.has(chunk.type);
                        })
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
                  {/* In focus mode with selected annotation, show only that annotation */}
                  {/* When showChunks is true (Parse tab), only show stickies tied to chunks */}
                  {/* When showChunks is false (Review tab), show all stickies (unless toggled off) */}
                  {pageSize.width > 0 && (showAnnotations || (focusMode && selectedAnnotation)) && pageAnnotations.length > 0 && (
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
                        .filter(a => {
                          // In focus mode with selected annotation, only show that annotation
                          if (focusMode && selectedAnnotation) {
                            return selectedAnnotation.id === a.id;
                          }
                          // In Parse mode (showChunks), only show annotations linked to chunks
                          if (showChunks && !a.chunk_id) return false;
                          // Filter by visible note levels (unless selected - always show that)
                          if (selectedAnnotation?.id === a.id) return true;
                          return visibleNoteLevels.has(a.level);
                        })
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

      {/* Legend - Interactive toggles */}
      {(showComponentsLegend || showNotesLegend) && (
        <div className="bg-white border-t px-4 py-2 flex flex-wrap items-center gap-2 text-xs">
          {showComponentsLegend && (
            <>
              <span className="text-gray-500 font-medium mr-1">Components:</span>
              {[
                { type: 'text', color: 'rgba(59, 130, 246, 0.5)', activeColor: 'rgba(59, 130, 246, 0.8)' },
                { type: 'table', color: 'rgba(34, 197, 94, 0.5)', activeColor: 'rgba(34, 197, 94, 0.8)' },
                { type: 'figure', color: 'rgba(249, 115, 22, 0.5)', activeColor: 'rgba(249, 115, 22, 0.8)' },
                { type: 'title', color: 'rgba(168, 85, 247, 0.5)', activeColor: 'rgba(168, 85, 247, 0.8)' },
                { type: 'caption', color: 'rgba(236, 72, 153, 0.5)', activeColor: 'rgba(236, 72, 153, 0.8)' },
                { type: 'form_field', color: 'rgba(20, 184, 166, 0.5)', activeColor: 'rgba(20, 184, 166, 0.8)' },
              ].map(({ type, color, activeColor }) => {
                const isActive = visibleChunkTypes.has(type);
                const count = chunks.filter(c => c.type === type).length;
                if (count === 0) return null; // Don't show types with no chunks
                return (
                  <button
                    key={type}
                    onClick={() => onToggleChunkType?.(type)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                      isActive
                        ? 'bg-gray-100 hover:bg-gray-200'
                        : 'bg-gray-50 opacity-50 hover:opacity-75'
                    }`}
                    title={`${isActive ? 'Hide' : 'Show'} ${type} (${count})`}
                  >
                    <span
                      className="w-3 h-3 rounded transition-colors"
                      style={{ backgroundColor: isActive ? activeColor : color }}
                    />
                    <span className={isActive ? 'text-gray-700' : 'text-gray-400 line-through'}>{type}</span>
                    <span className={`text-[10px] ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>({count})</span>
                  </button>
                );
              })}
              {showNotesLegend && <span className="mx-2 text-gray-300">|</span>}
            </>
          )}
          {showNotesLegend && (
            <>
              <span className="text-gray-500 font-medium mr-1">Notes:</span>
              {[
                { level: 'page', color: 'rgba(251, 191, 36, 0.6)', activeColor: 'rgba(251, 191, 36, 0.85)' },
                { level: 'document', color: 'rgba(74, 222, 128, 0.6)', activeColor: 'rgba(74, 222, 128, 0.85)' },
                { level: 'project', color: 'rgba(96, 165, 250, 0.6)', activeColor: 'rgba(96, 165, 250, 0.85)' },
              ].map(({ level, color, activeColor }) => {
                const isActive = visibleNoteLevels.has(level);
                const count = annotations.filter(a => a.level === level).length;
                return (
                  <button
                    key={level}
                    onClick={() => onToggleNoteLevel?.(level)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all ${
                      isActive
                        ? 'bg-gray-100 hover:bg-gray-200'
                        : 'bg-gray-50 opacity-50 hover:opacity-75'
                    }`}
                    title={`${isActive ? 'Hide' : 'Show'} ${level}-level notes (${count})`}
                  >
                    <span
                      className="w-3 h-3 rounded transition-colors"
                      style={{ backgroundColor: isActive ? activeColor : color }}
                    />
                    <span className={isActive ? 'text-gray-700' : 'text-gray-400 line-through'}>{level}</span>
                    <span className={`text-[10px] ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>({count})</span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { Chunk } from '../types/ade';
import ChunkOverlay from './ChunkOverlay';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker for react-pdf v7 with pdfjs-dist v3 (has built-in JPEG2000 support)
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

interface PDFViewerProps {
  file: File;
  chunks: Chunk[];
  selectedChunk: Chunk | null;
  onChunkClick: (chunk: Chunk) => void;
  onPdfReady?: () => void;
}

export default function PDFViewer({
  file,
  chunks,
  selectedChunk,
  onChunkClick,
  onPdfReady,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [fileKey, setFileKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
    console.log('PDF page loaded, size:', page.width, 'x', page.height);
    setPageSize({
      width: page.width,
      height: page.height,
    });
    setIsPageLoading(false);
    onPdfReady?.();
  }, [onPdfReady]);

  const onPageLoadError = useCallback((error: Error) => {
    console.error('PDF page load error:', error);
    setPdfError(error.message);
    setIsPageLoading(false);
  }, []);

  const pageChunks = chunks.filter(
    (c) => c.grounding?.page === currentPage - 1
  );

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
              </Document>
            ) : (
              <div className="flex items-center justify-center h-96 w-64 bg-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            )}

            {/* Chunk Overlays */}
            {pageSize.width > 0 && (
              <div
                className="absolute top-0 left-0 pointer-events-none"
                style={{ width: pageSize.width, height: pageSize.height }}
              >
                {pageChunks.map((chunk) => (
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
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white border-t px-4 py-2 flex flex-wrap gap-3 text-xs">
        <span className="text-gray-500 font-medium">Chunk types:</span>
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
      </div>
    </div>
  );
}

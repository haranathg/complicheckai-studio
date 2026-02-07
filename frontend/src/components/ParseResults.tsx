import { useState, useEffect, useRef, useMemo } from 'react';
import type { ParseResponse, Chunk, PageClassificationInfo } from '../types/ade';
import type { Document } from '../types/project';
import { getChunkColor } from '../utils/boundingBox';
import { getMarkdownPreview } from '../utils/cleanMarkdown';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';

// Page type display names and colors
const PAGE_TYPE_CONFIG: Record<string, { name: string; color: string }> = {
  floor_plan: { name: 'Floor Plan', color: '#3b82f6' },
  site_plan: { name: 'Site Plan', color: '#10b981' },
  elevation: { name: 'Elevation', color: '#8b5cf6' },
  section: { name: 'Section', color: '#f59e0b' },
  detail: { name: 'Detail', color: '#ec4899' },
  schedule: { name: 'Schedule', color: '#06b6d4' },
  cover_sheet: { name: 'Cover Sheet', color: '#6366f1' },
  form: { name: 'Form', color: '#84cc16' },
  letter: { name: 'Letter', color: '#14b8a6' },
  certificate: { name: 'Certificate', color: '#f97316' },
  report: { name: 'Report', color: '#a855f7' },
  photo: { name: 'Photo', color: '#64748b' },
  table: { name: 'Table', color: '#0ea5e9' },
  specification: { name: 'Specification', color: '#22c55e' },
  unknown: { name: 'Unknown', color: '#94a3b8' },
};

interface ParseResultsProps {
  result: ParseResponse | null;
  highlightedChunk: Chunk | null;
  popupChunk: Chunk | null;
  onPopupOpen: (chunk: Chunk | null) => void;
  onChunkSelect: (chunk: Chunk) => void;
  isLoading: boolean;
  onAddNote?: (chunk: Chunk) => void;
  currentPage?: number;
  documents?: Document[];
  currentDocument?: Document | null;
  onDocumentSelect?: (doc: Document) => void;
}

type ViewMode = 'markdown' | 'components' | 'pages';
type ChunkFilter = 'all' | 'page';

export default function ParseResults({
  result,
  highlightedChunk,
  popupChunk,
  onPopupOpen,
  onChunkSelect,
  isLoading,
  onAddNote,
  currentPage = 1,
  documents = [],
  currentDocument,
  onDocumentSelect,
}: ParseResultsProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('components');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [chunkFilter, setChunkFilter] = useState<ChunkFilter>('all');
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Filter to only processed documents
  const processedDocs = documents.filter(d => d.has_cached_result);

  // Get current page classification
  const currentPageClassification = useMemo(() => {
    if (!result?.page_classifications) return null;
    return result.page_classifications.find(pc => pc.page === currentPage) || null;
  }, [result?.page_classifications, currentPage]);

  // Get page type info
  const getPageTypeInfo = (pageType: string) => {
    return PAGE_TYPE_CONFIG[pageType] || PAGE_TYPE_CONFIG.unknown;
  };

  // Auto-scroll to highlighted chunk when it changes (from PDF click)
  useEffect(() => {
    if (highlightedChunk && chunkRefs.current.has(highlightedChunk.id)) {
      const element = chunkRefs.current.get(highlightedChunk.id);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightedChunk]);

  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && popupChunk) {
        onPopupOpen(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [popupChunk, onPopupOpen]);

  // Show document selector even when loading or no result
  if (isLoading || !result) {
    return (
      <div className="h-full flex flex-col">
        {/* Document selector - always show if documents available */}
        {processedDocs.length > 0 && onDocumentSelect && (
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-2 ${theme.textMuted}`}>
              Select a document to view
            </label>
            <select
              value={currentDocument?.id || ''}
              onChange={(e) => {
                const doc = processedDocs.find(d => d.id === e.target.value);
                if (doc) onDocumentSelect(doc);
              }}
              disabled={isLoading}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                isDark
                  ? 'bg-slate-800/60 border-slate-600/50 text-gray-300'
                  : 'bg-white border-slate-300 text-slate-700'
              } ${isLoading ? 'opacity-50' : ''}`}
            >
              <option value="">Select a document...</option>
              {processedDocs.map(doc => (
                <option key={doc.id} value={doc.id}>
                  {doc.original_filename}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading state */}
        {isLoading ? (
          <div className={`flex flex-col items-center justify-center flex-1 ${theme.textMuted}`}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mb-4"></div>
            <p className={theme.textSecondary}>Loading document...</p>
            <p className={`text-sm ${theme.textSubtle} mt-2`}>This may take a moment</p>
          </div>
        ) : (
          <div className={`flex flex-col items-center justify-center flex-1 ${theme.textSubtle}`}>
            <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className={theme.textMuted}>
              {processedDocs.length > 0
                ? 'Select a processed document above'
                : 'No processed documents yet'}
            </p>
          </div>
        )}
      </div>
    );
  }

  const chunkTypes = [...new Set(result.chunks.map((c) => c.type))];

  // Apply both type and page filters
  let filteredChunks = result.chunks;

  // Filter by page if 'page' filter is selected
  if (chunkFilter === 'page') {
    filteredChunks = filteredChunks.filter(c =>
      c.grounding && c.grounding.page === currentPage - 1
    );
  }

  // Filter by type
  if (typeFilter !== 'all') {
    filteredChunks = filteredChunks.filter(c => c.type === typeFilter);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Document selector */}
      {processedDocs.length > 0 && onDocumentSelect && (
        <div className={`mb-4`}>
          <select
            value={currentDocument?.id || ''}
            onChange={(e) => {
              const doc = processedDocs.find(d => d.id === e.target.value);
              if (doc) onDocumentSelect(doc);
            }}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
              isDark
                ? 'bg-slate-800/60 border-slate-600/50 text-gray-300'
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <option value="" disabled>Select a document...</option>
            {processedDocs.map(doc => (
              <option key={doc.id} value={doc.id}>
                {doc.original_filename}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Collapsible Document Info header with options */}
      <div className={`rounded-xl mb-4 border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
        {/* Header row - always visible */}
        <div
          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isDark ? 'hover:bg-slate-800/30' : 'hover:bg-slate-50'}`}
          onClick={() => setOptionsExpanded(!optionsExpanded)}
        >
          <div className="flex items-center gap-3">
            <svg
              className={`w-4 h-4 transition-transform ${optionsExpanded ? 'rotate-180' : ''} ${theme.textMuted}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className={`text-sm font-medium ${theme.textSecondary}`}>
              {result.metadata.page_count || '?'} pages
            </span>
            <span className={theme.textSubtle}>•</span>
            <span className={`text-sm font-medium ${theme.textSecondary}`}>
              {filteredChunks.length} components
              {chunkFilter === 'page' && <span className={theme.textMuted}> on page {currentPage}</span>}
            </span>
            {currentPageClassification && (
              <>
                <span className={theme.textSubtle}>•</span>
                <span
                  className="px-2 py-0.5 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: getPageTypeInfo(currentPageClassification.page_type).color }}
                  title={`Page ${currentPage}: ${getPageTypeInfo(currentPageClassification.page_type).name} (${currentPageClassification.confidence}% confidence)`}
                >
                  {getPageTypeInfo(currentPageClassification.page_type).name}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Document Info label with tooltip */}
            <div className="relative group">
              <span className={`text-xs px-2 py-1 rounded cursor-help ${isDark ? 'bg-slate-700/50 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                Document Info
              </span>
              {/* Tooltip with parse details - shows below to avoid overflow:hidden clipping */}
              <div className={`absolute right-0 top-full mt-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-[200] pointer-events-none shadow-lg ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-white'}`}>
                <div className="flex flex-col gap-1">
                  {result.metadata.parsed_at && (
                    <span>Parsed: {new Date(result.metadata.parsed_at).toLocaleString()}</span>
                  )}
                  {result.metadata.parser && (
                    <span>Parser: {result.metadata.parser === 'landing_ai' ? 'Landing AI' : result.metadata.parser === 'gemini_vision' ? 'Gemini Vision' : result.metadata.parser === 'bedrock_claude' ? 'Bedrock Claude' : result.metadata.parser}{result.metadata.model ? ` (${result.metadata.model})` : ''}</span>
                  )}
                  {result.metadata.parsed_by && (
                    <span>By: {result.metadata.parsed_by}</span>
                  )}
                  {!result.metadata.parsed_at && !result.metadata.parser && (
                    <span>No parse info available</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Expandable options section */}
        <div className={`overflow-hidden transition-all duration-200 ease-in-out ${optionsExpanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className={`px-4 pb-3 pt-1 border-t ${theme.border} flex items-center gap-3 flex-wrap`}>
            {/* View mode toggle */}
            <div className={`flex rounded-lg p-0.5 border ${theme.border}`} style={{ background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setViewMode('components'); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'components'
                    ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                    : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Components
              </button>
              {result.page_classifications && result.page_classifications.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setViewMode('pages'); }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    viewMode === 'pages'
                      ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                      : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Pages
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setViewMode('markdown'); }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewMode === 'markdown'
                    ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                    : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Markdown
              </button>
            </div>

            {viewMode === 'components' && (
              <>
                {/* Page vs All toggle */}
                <div className={`flex rounded-lg p-0.5 border ${theme.border}`} style={{ background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setChunkFilter('page'); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      chunkFilter === 'page'
                        ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                        : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    This Page
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setChunkFilter('all'); }}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      chunkFilter === 'all'
                        ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                        : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    All Pages
                  </button>
                </div>

                {/* Type filter */}
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className={`border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isDark
                      ? 'bg-slate-800/60 border-slate-600/50 text-gray-300'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  <option value="all">All types ({result.chunks.length})</option>
                  {chunkTypes.map((type) => (
                    <option key={type} value={type}>
                      {type} ({result.chunks.filter((c) => c.type === type).length})
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {viewMode === 'markdown' ? (
          <div className={`rounded-xl border p-4 ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
            <pre className={`whitespace-pre-wrap text-sm font-mono ${theme.textSecondary} overflow-x-auto`}>
              {result.markdown}
            </pre>
          </div>
        ) : viewMode === 'pages' && result.page_classifications ? (
          <div className={`rounded-xl border p-4 ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
            <h4 className={`text-sm font-medium mb-3 ${theme.textSecondary}`}>Page Classifications</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {result.page_classifications.map((pc: PageClassificationInfo) => {
                const typeInfo = getPageTypeInfo(pc.page_type);
                const isCurrentPage = pc.page === currentPage;
                return (
                  <div
                    key={pc.page}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      isCurrentPage
                        ? 'ring-2 ring-sky-500 border-sky-500'
                        : isDark ? 'border-slate-700 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
                    }`}
                    style={{ background: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc' }}
                    onClick={() => {
                      // Trigger page navigation - this would need to be passed as a prop
                      // For now, just highlight
                    }}
                    title={pc.signals?.join(', ') || 'No signals'}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${theme.textMuted}`}>Page {pc.page}</span>
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: typeInfo.color }}
                      />
                    </div>
                    <div
                      className="text-xs font-medium px-1.5 py-0.5 rounded text-white text-center"
                      style={{ backgroundColor: typeInfo.color }}
                    >
                      {typeInfo.name}
                    </div>
                    {pc.confidence !== undefined && (
                      <div className={`text-[10px] text-center mt-1 ${theme.textSubtle}`}>
                        {pc.confidence}% confidence
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className={`mt-4 pt-3 border-t ${theme.border}`}>
              <h5 className={`text-xs font-medium mb-2 ${theme.textMuted}`}>Page Types</h5>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PAGE_TYPE_CONFIG)
                  .filter(([key]) => result.page_classifications?.some((pc: PageClassificationInfo) => pc.page_type === key))
                  .map(([key, info]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: `${info.color}20`, color: info.color }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: info.color }} />
                      {info.name}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Chunk list */}
            <div className="space-y-3 overflow-auto flex-1">
              {filteredChunks.map((chunk) => (
                <div
                  key={chunk.id}
                  ref={(el) => {
                    if (el) {
                      chunkRefs.current.set(chunk.id, el);
                    }
                  }}
                  onClick={() => onChunkSelect(chunk)}
                  className={`
                    p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md
                    ${highlightedChunk?.id === chunk.id
                      ? 'border-sky-500 ring-2 ring-sky-500/50 border-2'
                      : isDark ? 'border-slate-700/40 hover:border-slate-600' : 'border-slate-200 hover:border-slate-300'
                    }
                  `}
                  style={{
                    background: highlightedChunk?.id === chunk.id
                      ? (isDark ? 'rgba(14, 165, 233, 0.1)' : 'rgba(186, 230, 253, 0.3)')
                      : (isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff')
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: getChunkColor(chunk.type).replace('0.3', '0.8') }}
                    >
                      {chunk.type}
                    </span>
                    {chunk.grounding && (
                      <span className={`text-xs ${theme.textSubtle}`}>
                        Page {chunk.grounding.page + 1}
                      </span>
                    )}
                    <div className="flex-1" />
                    {onAddNote && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddNote(chunk);
                        }}
                        className={`p-1 rounded transition-colors ${
                          isDark
                            ? 'text-amber-400/60 hover:text-amber-400 hover:bg-amber-900/30'
                            : 'text-amber-500/60 hover:text-amber-600 hover:bg-amber-50'
                        }`}
                        title="Add note to this component"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <p className={`text-sm ${theme.textSecondary} line-clamp-3`}>
                    {getMarkdownPreview(chunk.markdown, 200)}
                    {chunk.markdown.length > 200 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPopupOpen(chunk);
                        }}
                        className="text-sky-400 hover:text-sky-300 font-medium ml-1"
                        title="View full content"
                      >
                        ...more
                      </button>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal popup for viewing full chunk content */}
      {popupChunk && (
        <div
          className={`fixed inset-0 flex items-center justify-center z-50 p-4 ${isDark ? 'bg-black/70' : 'bg-black/50'}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onPopupOpen(null);
            }
          }}
        >
          <div
            className={`rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border ${theme.border}`}
            style={{ background: isDark ? 'radial-gradient(circle at top left, rgba(30, 64, 175, 0.2), #020617 65%)' : '#ffffff' }}
          >
            {/* Modal header */}
            <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
              <div className="flex items-center gap-3">
                <span
                  className="px-3 py-1 rounded text-sm font-medium text-white"
                  style={{ backgroundColor: getChunkColor(popupChunk.type).replace('0.3', '0.8') }}
                >
                  {popupChunk.type}
                </span>
                {popupChunk.grounding && (
                  <span className={`text-sm ${theme.textMuted}`}>
                    Page {popupChunk.grounding.page + 1}
                  </span>
                )}
                <span className={`text-sm ${theme.textSubtle}`}>
                  {popupChunk.markdown.length} characters
                </span>
              </div>
              <button
                onClick={() => onPopupOpen(null)}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                title="Close (Esc)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className={`whitespace-pre-wrap text-sm font-mono ${theme.textSecondary} leading-relaxed`}>
                {popupChunk.markdown}
              </pre>
            </div>

            {/* Modal footer */}
            <div
              className={`flex items-center justify-between p-4 border-t ${theme.border} rounded-b-xl`}
              style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(248, 250, 252, 0.9)' }}
            >
              <span className={`text-xs ${theme.textSubtle}`}>Press Esc or click outside to close</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(popupChunk.markdown);
                }}
                className="px-4 py-2 text-white rounded-full transition-colors flex items-center gap-2 text-sm"
                style={{
                  background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                  boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
                  border: '1px solid rgba(191, 219, 254, 0.3)'
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy to clipboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

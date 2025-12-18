import { useState, useEffect, useRef } from 'react';
import type { ParseResponse, Chunk } from '../types/ade';
import { getChunkColor } from '../utils/boundingBox';
import { getMarkdownPreview } from '../utils/cleanMarkdown';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';

interface ParseResultsProps {
  result: ParseResponse | null;
  highlightedChunk: Chunk | null;
  popupChunk: Chunk | null;
  onPopupOpen: (chunk: Chunk | null) => void;
  onChunkSelect: (chunk: Chunk) => void;
  isLoading: boolean;
}

type ViewMode = 'markdown' | 'components';

export default function ParseResults({
  result,
  highlightedChunk,
  popupChunk,
  onPopupOpen,
  onChunkSelect,
  isLoading,
}: ParseResultsProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [viewMode, setViewMode] = useState<ViewMode>('components');
  const [filter, setFilter] = useState<string>('all');
  const chunkRefs = useRef<Map<string, HTMLDivElement>>(new Map());

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

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${theme.textMuted}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mb-4"></div>
        <p className={theme.textSecondary}>Parsing document...</p>
        <p className={`text-sm ${theme.textSubtle} mt-2`}>This may take a moment</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${theme.textSubtle}`}>
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className={theme.textMuted}>Upload a document to see parsed results</p>
      </div>
    );
  }

  const chunkTypes = [...new Set(result.chunks.map((c) => c.type))];
  const filteredChunks =
    filter === 'all'
      ? result.chunks
      : result.chunks.filter((c) => c.type === filter);

  return (
    <div className="h-full flex flex-col">
      {/* Header with metadata */}
      <div className={`rounded-xl p-4 mb-4 border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
        <h3 className={`font-semibold ${theme.textPrimary} mb-2`}>Document Info</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className={theme.textSubtle}>Pages:</span>
            <span className={`ml-2 font-medium ${theme.textSecondary}`}>{result.metadata.page_count || 'N/A'}</span>
          </div>
          <div>
            <span className={theme.textSubtle}>Components:</span>
            <span className={`ml-2 font-medium ${theme.textSecondary}`}>{result.chunks.length}</span>
          </div>
        </div>
      </div>

      {/* View mode toggle and filter */}
      <div className="flex items-center gap-4 mb-4">
        <div className={`flex rounded-lg p-1 border ${theme.border}`} style={{ background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9' }}>
          <button
            onClick={() => setViewMode('components')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'components'
                ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Components
          </button>
          <button
            onClick={() => setViewMode('markdown')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'markdown'
                ? isDark ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-900 shadow-sm'
                : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Markdown
          </button>
        </div>

        {viewMode === 'components' && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
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
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {viewMode === 'markdown' ? (
          <div className={`rounded-xl border p-4 ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
            <pre className={`whitespace-pre-wrap text-sm font-mono ${theme.textSecondary} overflow-x-auto`}>
              {result.markdown}
            </pre>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Chunk list */}
            <div className="space-y-2 overflow-auto flex-1">
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
                    p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md
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

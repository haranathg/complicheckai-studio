import { useState, useEffect, useRef } from 'react';
import type { ParseResponse, Chunk } from '../types/ade';
import { getChunkColor } from '../utils/boundingBox';
import { getMarkdownPreview } from '../utils/cleanMarkdown';

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
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400 mb-4"></div>
        <p className="text-gray-300">Parsing document...</p>
        <p className="text-sm text-gray-500 mt-2">This may take a moment</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-400">Upload a document to see parsed results</p>
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
      <div className="rounded-xl p-4 mb-4 border border-slate-700/40" style={{ background: 'rgba(2, 6, 23, 0.6)' }}>
        <h3 className="font-semibold text-gray-200 mb-2">Document Info</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Pages:</span>
            <span className="ml-2 font-medium text-gray-300">{result.metadata.page_count || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500">Components:</span>
            <span className="ml-2 font-medium text-gray-300">{result.chunks.length}</span>
          </div>
        </div>
      </div>

      {/* View mode toggle and filter */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex bg-slate-800/60 rounded-lg p-1 border border-slate-700/40">
          <button
            onClick={() => setViewMode('components')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'components'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Components
          </button>
          <button
            onClick={() => setViewMode('markdown')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'markdown'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Markdown
          </button>
        </div>

        {viewMode === 'components' && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-slate-800/60 border border-slate-600/50 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all" className="bg-slate-800">All types ({result.chunks.length})</option>
            {chunkTypes.map((type) => (
              <option key={type} value={type} className="bg-slate-800">
                {type} ({result.chunks.filter((c) => c.type === type).length})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {viewMode === 'markdown' ? (
          <div className="rounded-xl border border-slate-700/40 p-4" style={{ background: 'rgba(2, 6, 23, 0.6)' }}>
            <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 overflow-x-auto">
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
                      : 'border-slate-700/40 hover:border-slate-600'
                    }
                  `}
                  style={{ background: highlightedChunk?.id === chunk.id ? 'rgba(14, 165, 233, 0.1)' : 'rgba(2, 6, 23, 0.6)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: getChunkColor(chunk.type).replace('0.3', '0.8') }}
                    >
                      {chunk.type}
                    </span>
                    {chunk.grounding && (
                      <span className="text-xs text-gray-500">
                        Page {chunk.grounding.page + 1}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-300 line-clamp-3">
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
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              onPopupOpen(null);
            }
          }}
        >
          <div className="rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col border border-slate-700/40" style={{ background: 'radial-gradient(circle at top left, rgba(30, 64, 175, 0.2), #020617 65%)' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700/40">
              <div className="flex items-center gap-3">
                <span
                  className="px-3 py-1 rounded text-sm font-medium text-white"
                  style={{ backgroundColor: getChunkColor(popupChunk.type).replace('0.3', '0.8') }}
                >
                  {popupChunk.type}
                </span>
                {popupChunk.grounding && (
                  <span className="text-sm text-gray-400">
                    Page {popupChunk.grounding.page + 1}
                  </span>
                )}
                <span className="text-sm text-gray-500">
                  {popupChunk.markdown.length} characters
                </span>
              </div>
              <button
                onClick={() => onPopupOpen(null)}
                className="text-gray-400 hover:text-gray-200 p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Close (Esc)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal content */}
            <div className="flex-1 overflow-auto p-4">
              <pre className="whitespace-pre-wrap text-sm font-mono text-gray-300 leading-relaxed">
                {popupChunk.markdown}
              </pre>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-700/40 rounded-b-xl" style={{ background: 'rgba(2, 6, 23, 0.6)' }}>
              <span className="text-xs text-gray-500">Press Esc or click outside to close</span>
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

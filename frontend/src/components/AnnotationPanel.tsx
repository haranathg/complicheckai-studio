/**
 * AnnotationPanel - Compact annotation panel that sits below the PDF viewer
 * Shows annotations for the current document/page with quick add functionality
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project, Document } from '../types/project';
import type { Chunk } from '../types/ade';
import type { Annotation, AnnotationLevel } from '../types/annotation';
import { ANNOTATION_COLORS, ANNOTATION_BORDER_COLORS } from '../types/annotation';
import {
  listDocumentAnnotations,
  createAnnotation,
  deleteAnnotation,
  resolveAnnotation,
} from '../services/annotationService';
import { downloadPDFWithAnnotations } from '../utils/pdfExport';

interface AnnotationPanelProps {
  currentProject: Project | null;
  currentDocument: Document | null;
  currentPage: number;
  prefilledChunk?: Chunk | null;
  onClearPrefilledChunk?: () => void;
  onAnnotationClick?: (annotation: Annotation) => void;
  onAnnotationsChange?: () => void;
  file?: File | null;
  chunks?: Chunk[];
}

export default function AnnotationPanel({
  currentProject,
  currentDocument,
  currentPage,
  prefilledChunk,
  onClearPrefilledChunk,
  onAnnotationClick,
  onAnnotationsChange,
  file,
  chunks = [],
}: AnnotationPanelProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteLevel, setNoteLevel] = useState<AnnotationLevel>('page');
  const [isExporting, setIsExporting] = useState(false);

  // When a prefilled chunk comes in, open the add note form
  useEffect(() => {
    if (prefilledChunk) {
      setIsAddingNote(true);
      setNoteLevel('page');
    }
  }, [prefilledChunk]);

  // Load annotations for current document/page
  const loadAnnotations = useCallback(async () => {
    if (!currentProject || !currentDocument) {
      setAnnotations([]);
      return;
    }

    setIsLoading(true);
    try {
      const response = await listDocumentAnnotations(currentProject.id, currentDocument.id);
      setAnnotations(response.annotations);
    } catch (err) {
      console.error('Failed to load annotations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, currentDocument]);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Filter annotations for current page
  const pageAnnotations = annotations.filter(
    a => a.level === 'page' && a.page_number === currentPage
  );
  const docAnnotations = annotations.filter(a => a.level === 'document');

  const handleAddNote = async () => {
    if (!currentProject || !noteText.trim()) return;

    try {
      const annotation = await createAnnotation(currentProject.id, {
        document_id: currentDocument?.id,
        chunk_id: prefilledChunk?.id,
        level: noteLevel,
        page_number: noteLevel === 'page' ? currentPage : undefined,
        text: noteText,
        annotation_type: 'comment',
        priority: 'normal',
      });

      setAnnotations(prev => [annotation, ...prev]);
      setNoteText('');
      setIsAddingNote(false);
      onClearPrefilledChunk?.();
      onAnnotationsChange?.();
    } catch (err) {
      console.error('Failed to create annotation:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await deleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
      onAnnotationsChange?.();
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  const handleResolveAnnotation = async (id: string) => {
    try {
      const updated = await resolveAnnotation(id);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
      onAnnotationsChange?.();
    } catch (err) {
      console.error('Failed to resolve annotation:', err);
    }
  };

  const cancelAddNote = () => {
    setIsAddingNote(false);
    setNoteText('');
    onClearPrefilledChunk?.();
  };

  const handleExportPDF = async () => {
    if (!file || annotations.length === 0) return;

    setIsExporting(true);
    try {
      const docName = currentDocument?.original_filename || currentDocument?.filename || file.name;
      const baseName = docName.replace('.pdf', '');
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      const filename = `${baseName}_annotated_${timestamp}.pdf`;
      await downloadPDFWithAnnotations(file, annotations, chunks, filename);
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!currentProject || !currentDocument) {
    return null;
  }

  const totalCount = pageAnnotations.length + docAnnotations.length;

  return (
    <div className={`border-t ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.8)' : 'rgba(248, 250, 252, 0.95)' }}>
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-700/20 transition-colors`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''} ${theme.textMuted}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className={`text-sm font-medium ${theme.textSecondary}`}>
            Notes
          </span>
          {totalCount > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isDark ? 'bg-amber-900/50 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
              {totalCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Export PDF button - more visible */}
          {file && annotations.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExportPDF();
              }}
              disabled={isExporting}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                isExporting
                  ? 'opacity-50 cursor-not-allowed'
                  : isDark
                    ? 'bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60 border border-emerald-700/50'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
              title="Export PDF with annotations"
            >
              {isExporting ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-emerald-400 border-t-transparent" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              <span>Export</span>
            </button>
          )}
          {/* Add note button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsAddingNote(true);
              setIsExpanded(true);
            }}
            className={`p-1.5 rounded-md transition-colors ${
              isDark
                ? 'text-sky-400 hover:bg-sky-900/30'
                : 'text-sky-600 hover:bg-sky-50'
            }`}
            title="Add note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 max-h-48 overflow-y-auto">
          {/* Add note form */}
          {isAddingNote && (
            <div className={`mb-2 p-2 rounded-lg border ${isDark ? 'border-sky-700/50 bg-sky-900/20' : 'border-sky-200 bg-sky-50'}`}>
              {prefilledChunk && (
                <div className={`text-xs mb-2 ${theme.textMuted}`}>
                  Adding note for: <span className="font-medium">{prefilledChunk.type}</span> on page {(prefilledChunk.grounding?.page || 0) + 1}
                </div>
              )}
              <div className="flex gap-2 mb-2">
                <select
                  value={noteLevel}
                  onChange={(e) => setNoteLevel(e.target.value as AnnotationLevel)}
                  className={`text-xs px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
                >
                  <option value="page">Page {currentPage}</option>
                  <option value="document">Document</option>
                  <option value="project">Project</option>
                </select>
              </div>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter your note..."
                rows={2}
                autoFocus
                className={`w-full text-sm px-2 py-1.5 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={cancelAddNote}
                  className={`text-xs px-2 py-1 rounded ${theme.textMuted} hover:${theme.textSecondary}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={!noteText.trim()}
                  className={`text-xs px-2 py-1 rounded transition-colors ${
                    !noteText.trim()
                      ? 'opacity-50 cursor-not-allowed'
                      : ''
                  } ${isDark ? 'bg-sky-600 text-white hover:bg-sky-500' : 'bg-sky-500 text-white hover:bg-sky-600'}`}
                >
                  Add Note
                </button>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading ? (
            <div className={`text-xs ${theme.textMuted} text-center py-2`}>Loading...</div>
          ) : totalCount === 0 && !isAddingNote ? (
            <div className={`text-xs ${theme.textMuted} text-center py-2`}>
              No notes for this page
            </div>
          ) : (
            <div className="space-y-1.5">
              {/* Page annotations */}
              {pageAnnotations.map(annotation => (
                <AnnotationItem
                  key={annotation.id}
                  annotation={annotation}
                  isDark={isDark}
                  theme={theme}
                  onClick={() => onAnnotationClick?.(annotation)}
                  onResolve={() => handleResolveAnnotation(annotation.id)}
                  onDelete={() => handleDeleteAnnotation(annotation.id)}
                />
              ))}

              {/* Document annotations */}
              {docAnnotations.length > 0 && (
                <>
                  {pageAnnotations.length > 0 && (
                    <div className={`text-xs ${theme.textMuted} pt-1`}>Document-level:</div>
                  )}
                  {docAnnotations.map(annotation => (
                    <AnnotationItem
                      key={annotation.id}
                      annotation={annotation}
                      isDark={isDark}
                      theme={theme}
                      onClick={() => onAnnotationClick?.(annotation)}
                      onResolve={() => handleResolveAnnotation(annotation.id)}
                      onDelete={() => handleDeleteAnnotation(annotation.id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AnnotationItemProps {
  annotation: Annotation;
  isDark: boolean;
  theme: ReturnType<typeof getThemeStyles>;
  onClick?: () => void;
  onResolve?: () => void;
  onDelete?: () => void;
}

function AnnotationItem({ annotation, isDark, theme, onClick, onResolve, onDelete }: AnnotationItemProps) {
  return (
    <div
      onClick={onClick}
      className={`p-2 rounded-lg text-xs cursor-pointer transition-colors group ${
        isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-100'
      }`}
      style={{
        borderLeft: `3px solid ${ANNOTATION_BORDER_COLORS[annotation.level]}`,
        background: isDark
          ? `linear-gradient(to right, ${ANNOTATION_COLORS[annotation.level].replace('0.85', '0.1')}, transparent)`
          : `linear-gradient(to right, ${ANNOTATION_COLORS[annotation.level].replace('0.85', '0.08')}, transparent)`
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={`${theme.textSecondary} line-clamp-2`}>{annotation.text}</p>
          <div className={`flex items-center gap-2 mt-1 ${theme.textMuted}`}>
            {annotation.page_number && (
              <span>p.{annotation.page_number}</span>
            )}
            <span className={`px-1 py-0.5 rounded ${
              annotation.status === 'resolved'
                ? isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700'
                : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
            }`}>
              {annotation.status}
            </span>
          </div>
        </div>
        <div className={`flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
          {annotation.status === 'open' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve?.();
              }}
              className={`p-1 rounded ${isDark ? 'hover:bg-green-900/30 text-green-400' : 'hover:bg-green-50 text-green-600'}`}
              title="Mark as resolved"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className={`p-1 rounded ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
            title="Delete"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

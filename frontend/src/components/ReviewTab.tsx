/**
 * Review Tab - Document review with annotations and view modes
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project, Document } from '../types/project';
import type { Chunk } from '../types/ade';
import type { Annotation, AnnotationCreate, AnnotationLevel } from '../types/annotation';
import { ANNOTATION_COLORS, ANNOTATION_BORDER_COLORS } from '../types/annotation';
import {
  listDocumentAnnotations,
  listProjectAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  resolveAnnotation,
} from '../services/annotationService';
import { downloadPDFWithAnnotations } from '../utils/pdfExport';

export type ViewMode = 'page' | 'document' | 'project';

interface ReviewTabProps {
  currentProject: Project | null;
  currentDocument: Document | null;
  currentPage: number;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onCreateAnnotation?: (position: { page: number; bbox: { left: number; top: number; right: number; bottom: number } }) => void;
  file?: File | null;
  chunks?: Chunk[];
  showOverlays?: boolean;
  onToggleOverlays?: (show: boolean) => void;
}

export default function ReviewTab({
  currentProject,
  currentDocument,
  currentPage,
  onAnnotationSelect,
  file,
  chunks = [],
  showOverlays = true,
  onToggleOverlays,
}: ReviewTabProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [viewMode, setViewMode] = useState<ViewMode>('page');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState<Partial<AnnotationCreate>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Load annotations based on view mode
  const loadAnnotations = useCallback(async () => {
    if (!currentProject) {
      setAnnotations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let response;
      if (viewMode === 'project') {
        response = await listProjectAnnotations(currentProject.id, {
          status: filterStatus !== 'all' ? filterStatus : undefined,
        });
      } else if (currentDocument) {
        response = await listDocumentAnnotations(currentProject.id, currentDocument.id, {
          status: filterStatus !== 'all' ? filterStatus : undefined,
          page_number: viewMode === 'page' ? currentPage : undefined,
        });
      } else {
        setAnnotations([]);
        return;
      }

      setAnnotations(response.annotations);
    } catch (err) {
      console.error('Failed to load annotations:', err);
      setError('Failed to load annotations');
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, currentDocument, viewMode, currentPage, filterStatus]);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Create new annotation
  const handleCreateAnnotation = async () => {
    if (!currentProject || !newAnnotation.text) return;

    try {
      const annotation = await createAnnotation(currentProject.id, {
        document_id: currentDocument?.id,
        level: newAnnotation.level || 'page',
        page_number: newAnnotation.level === 'page' ? currentPage : undefined,
        text: newAnnotation.text,
        title: newAnnotation.title,
        annotation_type: newAnnotation.annotation_type || 'comment',
        priority: newAnnotation.priority || 'normal',
      });

      setAnnotations(prev => [annotation, ...prev]);
      setIsCreating(false);
      setNewAnnotation({});
    } catch (err) {
      console.error('Failed to create annotation:', err);
      setError('Failed to create annotation');
    }
  };

  // Update annotation
  const handleUpdateAnnotation = async (id: string, updates: Partial<Annotation>) => {
    try {
      const updated = await updateAnnotation(id, updates);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update annotation:', err);
    }
  };

  // Delete annotation
  const handleDeleteAnnotation = async (id: string) => {
    if (!confirm('Delete this annotation?')) return;

    try {
      await deleteAnnotation(id);
      setAnnotations(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  // Resolve annotation
  const handleResolveAnnotation = async (id: string) => {
    try {
      const updated = await resolveAnnotation(id);
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
    } catch (err) {
      console.error('Failed to resolve annotation:', err);
    }
  };

  // Export PDF with annotations
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
      setError('Failed to export PDF with annotations');
    } finally {
      setIsExporting(false);
    }
  };

  const getLevelIcon = (level: AnnotationLevel) => {
    switch (level) {
      case 'page':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
      case 'project':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        );
    }
  };

  if (!currentProject) {
    return (
      <div className={`h-full flex items-center justify-center ${theme.textSubtle}`}>
        <p>Select a project to view annotations</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* View mode selector */}
      <div className={`px-4 py-3 border-b ${theme.border} ${isDark ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${theme.textSecondary}`}>View:</span>
            <div className={`flex rounded-lg overflow-hidden border ${theme.border}`}>
              {(['page', 'document', 'project'] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === mode
                      ? isDark ? 'bg-sky-600 text-white' : 'bg-sky-500 text-white'
                      : `${theme.textMuted} hover:${theme.textSecondary}`
                  }`}
                  disabled={mode === 'page' && !currentDocument}
                >
                  {mode === 'page' ? 'Current Page' : mode === 'document' ? 'Document' : 'Project'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={`text-xs px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
            >
              <option value="all">All Status</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </select>

            {/* Overlay toggle */}
            {onToggleOverlays && (
              <label className={`flex items-center gap-2 text-xs ${theme.textMuted} cursor-pointer`}>
                <input
                  type="checkbox"
                  checked={showOverlays}
                  onChange={(e) => onToggleOverlays(e.target.checked)}
                  className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                />
                Show Overlays
              </label>
            )}

            {/* Export PDF button */}
            {file && annotations.length > 0 && (
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                  isExporting
                    ? 'opacity-50 cursor-not-allowed'
                    : isDark
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
                title="Export PDF with annotations"
              >
                {isExporting ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent" />
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                Export PDF
              </button>
            )}

            <button
              onClick={() => setIsCreating(true)}
              disabled={!currentDocument && viewMode !== 'project'}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${
                !currentDocument && viewMode !== 'project'
                  ? `${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'} cursor-not-allowed`
                  : `${isDark ? 'bg-sky-600 hover:bg-sky-500' : 'bg-sky-500 hover:bg-sky-600'} text-white`
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Note
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className={`flex items-center gap-4 text-xs ${theme.textMuted}`}>
          <span>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
          <span>{annotations.filter(a => a.status === 'open').length} open</span>
          <span>{annotations.filter(a => a.status === 'resolved').length} resolved</span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className={`px-4 py-2 text-sm ${isDark ? 'text-red-400 bg-red-900/20' : 'text-red-600 bg-red-50'}`}>
          {error}
        </div>
      )}

      {/* New annotation form */}
      {isCreating && (
        <div className={`px-4 py-3 border-b ${theme.border} ${isDark ? 'bg-indigo-900/20' : 'bg-indigo-50'}`}>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <select
                value={newAnnotation.level || 'page'}
                onChange={(e) => setNewAnnotation(prev => ({ ...prev, level: e.target.value as AnnotationLevel }))}
                className={`text-sm px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
              >
                <option value="page">Page Note</option>
                <option value="document">Document Note</option>
                <option value="project">Project Note</option>
              </select>

              <select
                value={newAnnotation.annotation_type || 'comment'}
                onChange={(e) => setNewAnnotation(prev => ({ ...prev, annotation_type: e.target.value as AnnotationCreate['annotation_type'] }))}
                className={`text-sm px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
              >
                <option value="comment">Comment</option>
                <option value="question">Question</option>
                <option value="issue">Issue</option>
                <option value="suggestion">Suggestion</option>
              </select>

              <select
                value={newAnnotation.priority || 'normal'}
                onChange={(e) => setNewAnnotation(prev => ({ ...prev, priority: e.target.value as AnnotationCreate['priority'] }))}
                className={`text-sm px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <input
              type="text"
              placeholder="Title (optional)"
              value={newAnnotation.title || ''}
              onChange={(e) => setNewAnnotation(prev => ({ ...prev, title: e.target.value }))}
              className={`w-full text-sm px-3 py-2 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
            />

            <textarea
              placeholder="Enter your note..."
              value={newAnnotation.text || ''}
              onChange={(e) => setNewAnnotation(prev => ({ ...prev, text: e.target.value }))}
              rows={3}
              className={`w-full text-sm px-3 py-2 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewAnnotation({});
                }}
                className={`px-3 py-1.5 text-sm rounded ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAnnotation}
                disabled={!newAnnotation.text}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${
                  !newAnnotation.text
                    ? `${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'} cursor-not-allowed`
                    : `${isDark ? 'bg-sky-600 hover:bg-sky-500' : 'bg-sky-500 hover:bg-sky-600'} text-white`
                }`}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Annotations list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className={`flex items-center justify-center py-8 ${theme.textSubtle}`}>
            <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : annotations.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-8 ${theme.textSubtle}`}>
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-sm">No annotations yet</p>
            <p className={`text-xs mt-1 ${theme.textMuted}`}>
              {viewMode === 'page' ? 'Add notes to this page' : viewMode === 'document' ? 'Add notes to this document' : 'Add notes to this project'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {annotations.map(annotation => (
              <div
                key={annotation.id}
                onClick={() => onAnnotationSelect?.(annotation)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'
                }`}
                style={{
                  borderLeft: `4px solid ${ANNOTATION_BORDER_COLORS[annotation.level]}`,
                  background: isDark
                    ? `linear-gradient(to right, ${ANNOTATION_COLORS[annotation.level].replace('0.85', '0.15')}, transparent)`
                    : `linear-gradient(to right, ${ANNOTATION_COLORS[annotation.level].replace('0.85', '0.1')}, transparent)`
                }}
              >
                <div className="flex items-start gap-2">
                  <div style={{ color: ANNOTATION_BORDER_COLORS[annotation.level] }}>
                    {getLevelIcon(annotation.level)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {annotation.title && (
                        <span className={`font-medium text-sm ${theme.textPrimary}`}>
                          {annotation.title}
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        annotation.status === 'resolved'
                          ? isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700'
                          : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {annotation.status}
                      </span>
                      <span className={`text-xs ${theme.textMuted}`}>
                        {annotation.annotation_type}
                      </span>
                      {annotation.priority !== 'normal' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          annotation.priority === 'critical'
                            ? isDark ? 'bg-red-900/50 text-red-400' : 'bg-red-100 text-red-700'
                            : annotation.priority === 'high'
                              ? isDark ? 'bg-orange-900/50 text-orange-400' : 'bg-orange-100 text-orange-700'
                              : isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {annotation.priority}
                        </span>
                      )}
                    </div>

                    {editingId === annotation.id ? (
                      <div className="space-y-2">
                        <textarea
                          defaultValue={annotation.text}
                          rows={3}
                          className={`w-full text-sm px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.metaKey) {
                              handleUpdateAnnotation(annotation.id, { text: e.currentTarget.value });
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                            }}
                            className={`text-xs ${theme.textMuted}`}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const textarea = e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement;
                              handleUpdateAnnotation(annotation.id, { text: textarea.value });
                            }}
                            className="text-xs text-sky-500"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className={`text-sm ${theme.textSecondary} whitespace-pre-wrap`}>
                        {annotation.text}
                      </p>
                    )}

                    <div className={`flex items-center gap-3 mt-2 text-xs ${theme.textMuted}`}>
                      {annotation.page_number && (
                        <span>Page {annotation.page_number}</span>
                      )}
                      <span>{new Date(annotation.created_at).toLocaleDateString()}</span>

                      <div className="flex-1" />

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(annotation.id);
                        }}
                        className="hover:text-sky-500"
                      >
                        Edit
                      </button>
                      {annotation.status === 'open' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResolveAnnotation(annotation.id);
                          }}
                          className="hover:text-green-500"
                        >
                          Resolve
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnnotation(annotation.id);
                        }}
                        className="hover:text-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

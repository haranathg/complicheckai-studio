/**
 * Review Tab - Document review with annotations and view modes
 * Consumes useAnnotations hook for state management (shared with AnnotationPanel)
 */
import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project, Document } from '../types/project';
import type { Chunk } from '../types/ade';
import type { Annotation, AnnotationCreate, AnnotationLevel } from '../types/annotation';
import { ANNOTATION_COLORS, ANNOTATION_BORDER_COLORS } from '../types/annotation';
import { updateDocumentReview } from '../services/projectService';
import { Modal, Button, SegmentedControl } from './ui';
import type { UseAnnotationsReturn, ViewMode } from '../hooks/useAnnotations';

interface ReviewTabProps {
  currentProject: Project | null;
  currentDocument: Document | null;
  currentPage: number;
  onAnnotationSelect?: (annotation: Annotation) => void;
  onCreateAnnotation?: (position: { page: number; bbox: { left: number; top: number; right: number; bottom: number } }) => void;
  file?: File | null;
  chunks?: Chunk[];
  annotationHook: UseAnnotationsReturn;
}

export default function ReviewTab({
  currentProject,
  currentDocument,
  currentPage,
  onAnnotationSelect,
  file,
  chunks = [],
  annotationHook,
}: ReviewTabProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  // Local UI state only — no annotation data state
  const [viewMode, setViewMode] = useState<ViewMode>('page');
  const [isCreating, setIsCreating] = useState(false);
  const [newAnnotation, setNewAnnotation] = useState<Partial<AnnotationCreate>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deleteAnnotationId, setDeleteAnnotationId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<'not_reviewed' | 'needs_info' | 'ok'>('not_reviewed');

  // Sync review status when document changes
  useEffect(() => {
    if (currentDocument) {
      setReviewStatus((currentDocument as { review_status?: 'not_reviewed' | 'needs_info' | 'ok' }).review_status || 'not_reviewed');
    }
  }, [currentDocument]);

  const handleReviewStatusChange = async (newStatus: 'not_reviewed' | 'needs_info' | 'ok') => {
    if (!currentProject || !currentDocument) return;
    setReviewStatus(newStatus);
    try {
      await updateDocumentReview(currentProject.id, currentDocument.id, newStatus);
    } catch (err) {
      console.error('Failed to update review status:', err);
    }
  };

  // Get filtered annotations from the shared hook
  const annotations = annotationHook.viewAnnotations(viewMode, filterStatus, currentPage);
  const { isLoading, error, isExporting } = annotationHook;

  // Create new annotation via hook
  const handleCreateAnnotation = async () => {
    if (!currentProject || !newAnnotation.text) return;

    const level = newAnnotation.level || 'page';
    const result = await annotationHook.create({
      document_id: currentDocument?.id,
      level,
      page_number: level === 'page' ? currentPage : undefined,
      text: newAnnotation.text,
      title: newAnnotation.title,
      annotation_type: newAnnotation.annotation_type || 'comment',
      priority: newAnnotation.priority || 'normal',
    });

    if (result) {
      setIsCreating(false);
      setNewAnnotation({});
    }
  };

  // Update annotation via hook
  const handleUpdateAnnotation = async (id: string, updates: Partial<Annotation>) => {
    const result = await annotationHook.update(id, updates);
    if (result) {
      setEditingId(null);
    }
  };

  // Delete annotation via hook
  const handleDeleteAnnotation = async (id: string) => {
    setIsDeleting(true);
    const success = await annotationHook.remove(id);
    if (success) {
      setDeleteAnnotationId(null);
    }
    setIsDeleting(false);
  };

  // Resolve annotation via hook
  const handleResolveAnnotation = async (id: string) => {
    await annotationHook.resolve(id);
  };

  // Export PDF via hook
  const handleExportPDF = async () => {
    if (!file || annotationHook.annotations.length === 0) return;
    const docName = currentDocument?.original_filename || currentDocument?.filename || file.name;
    await annotationHook.exportPDF(file, chunks, docName);
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
      {/* Header - Two-row layout */}
      <div className={`px-5 py-3 border-b ${theme.border} ${isDark ? 'bg-slate-800/30' : 'bg-slate-50'} space-y-2`}>
        {/* Row 1: View mode toggle | Review status + Add Note */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${theme.textSecondary}`}>View:</span>
            <SegmentedControl
              options={[
                { value: 'page' as ViewMode, label: 'Current Page', disabled: !currentDocument },
                { value: 'document' as ViewMode, label: 'Document' },
                { value: 'project' as ViewMode, label: 'Project' },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Review Status Dropdown */}
            {currentDocument && (
              <select
                value={reviewStatus}
                onChange={(e) => handleReviewStatusChange(e.target.value as 'not_reviewed' | 'needs_info' | 'ok')}
                className={`text-xs px-2 py-1 rounded border font-medium ${
                  reviewStatus === 'ok'
                    ? isDark ? 'bg-green-900/30 border-green-700 text-green-400' : 'bg-green-50 border-green-300 text-green-700'
                    : reviewStatus === 'needs_info'
                      ? isDark ? 'bg-amber-900/30 border-amber-700 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700'
                      : isDark ? 'bg-slate-800 border-slate-600 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-500'
                }`}
              >
                <option value="not_reviewed">Not Reviewed</option>
                <option value="needs_info">Needs Info</option>
                <option value="ok">OK</option>
              </select>
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

        {/* Row 2: Filter | Stats | Export PDF */}
        <div className="flex items-center justify-between">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className={`text-xs px-2 py-1 rounded border ${theme.border} ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-white text-slate-700'}`}
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Summary stats */}
          <div className={`flex items-center gap-3 text-xs ${theme.textMuted}`}>
            <span>{annotations.length} annotation{annotations.length !== 1 ? 's' : ''}</span>
            <span>{annotationHook.openCount} open</span>
            <span>{annotationHook.resolvedCount} resolved</span>
            {isLoading && annotations.length > 0 && (
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>

          {/* Export PDF button */}
          {file && annotationHook.annotations.length > 0 ? (
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
          ) : (
            <div />
          )}
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
        {/* Only show full loading spinner on initial load (when we have no annotations yet) */}
        {isLoading && annotations.length === 0 ? (
          <div className={`flex items-center justify-center py-8 ${theme.textSubtle}`}>
            <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : !isLoading && annotations.length === 0 ? (
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
          <div className="p-3 space-y-3">
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
                      {annotation.author && (
                        <span className="font-medium">{annotation.author}</span>
                      )}
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
                          setDeleteAnnotationId(annotation.id);
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

      {/* Delete Annotation Confirmation Modal */}
      <Modal
        isOpen={!!deleteAnnotationId}
        onClose={() => setDeleteAnnotationId(null)}
        title="Delete Annotation"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setDeleteAnnotationId(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteAnnotationId && handleDeleteAnnotation(deleteAnnotationId)}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className={`text-sm ${theme.textSecondary}`}>
          Are you sure you want to delete this annotation?
        </p>
        <p className={`text-sm mt-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
          This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

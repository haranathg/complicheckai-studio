/**
 * Upload Tab - Project/document management with batch processing
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ProjectSelector from './ProjectSelector';
import type { Project, Document } from '../types/project';
import type { ParseResponse } from '../types/ade';
import type { BatchJob } from '../types/batch';
import {
  uploadDocument,
  getLatestParseResult,
  getDocumentDownloadUrl,
  checkProjectsAvailable,
  getOrCreateDefaultProject,
  listDocuments,
} from '../services/projectService';
import type { DuplicateCheckResponse } from '../services/projectService';
import {
  startBatchProcess,
  getBatchJob,
  cancelBatchJob,
  listBatchJobs,
} from '../services/batchService';
import { getParserType, getModelForParser } from './ParserSelector';

interface UploadTabProps {
  onDocumentLoad: (file: File, cachedResult?: ParseResponse) => void;
  onClearDocument: () => void;
  isProcessing: boolean;
  selectedParser: string;
  selectedModel: string;
  onProjectChange?: (project: Project | null) => void;
  onDocumentChange?: (document: Document | null) => void;
  currentProject: Project | null;
  currentDocument: Document | null;
}

export default function UploadTab({
  onDocumentLoad,
  onClearDocument,
  isProcessing,
  selectedParser,
  // selectedModel is passed but not used directly - parser determines model
  selectedModel: _selectedModel,
  onProjectChange,
  onDocumentChange,
  currentProject,
  currentDocument,
}: UploadTabProps) {
  void _selectedModel; // Acknowledge unused prop
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingCached, setIsFetchingCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Batch processing state
  const [activeBatchJob, setActiveBatchJob] = useState<BatchJob | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Duplicate confirmation state
  const [pendingUpload, setPendingUpload] = useState<{ file: File; duplicate: DuplicateCheckResponse } | null>(null);

  // Check if projects feature is available
  useEffect(() => {
    const init = async () => {
      const available = await checkProjectsAvailable();
      setIsAvailable(available);
      if (available) {
        const defProject = await getOrCreateDefaultProject();
        setDefaultProject(defProject);
      }
    };
    init();
  }, []);

  // Load documents when project changes
  useEffect(() => {
    const loadDocuments = async () => {
      const project = currentProject || defaultProject;
      if (!project) {
        setDocuments([]);
        return;
      }
      try {
        const response = await listDocuments(project.id);
        setDocuments(response.documents);
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    };
    loadDocuments();
  }, [currentProject, defaultProject, refreshKey]);

  // Poll for batch job status
  useEffect(() => {
    if (!activeBatchJob || ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(activeBatchJob.status)) {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const job = await getBatchJob(activeBatchJob.id);
        setActiveBatchJob(job);
        if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
          // Refresh document list to show new cached badges
          setRefreshKey(prev => prev + 1);
        }
      } catch (err) {
        console.error('Failed to poll batch job:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [activeBatchJob]);

  // Check for active batch job on project change
  useEffect(() => {
    const checkActiveBatch = async () => {
      const project = currentProject || defaultProject;
      if (!project) return;

      try {
        const response = await listBatchJobs(project.id, { status: 'processing' });
        if (response.jobs.length > 0) {
          setActiveBatchJob(response.jobs[0]);
        }
      } catch (err) {
        // Ignore errors - batch feature may not be available
      }
    };
    checkActiveBatch();
  }, [currentProject, defaultProject]);

  // Handle document selection for viewing
  const handleDocumentSelect = useCallback(async (doc: Document | null) => {
    onDocumentChange?.(doc);
    setError(null);

    const project = currentProject || defaultProject;
    if (!doc || !project) {
      return;
    }

    setIsFetchingCached(true);

    try {
      const fileUrl = await getDocumentDownloadUrl(project.id, doc.id);
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const file = new File([blob], doc.original_filename, {
        type: doc.content_type || 'application/pdf',
      });

      const cachedResponse = await getLatestParseResult(project.id, doc.id, selectedParser);

      if (cachedResponse.cached && cachedResponse.result) {
        const parseResult: ParseResponse = {
          markdown: cachedResponse.result.markdown,
          chunks: cachedResponse.result.chunks.map(c => ({
            id: c.id,
            markdown: c.markdown,
            type: c.type,
            grounding: c.grounding || null,
          })),
          metadata: {
            page_count: cachedResponse.result.metadata.page_count || null,
            credit_usage: cachedResponse.result.metadata.credit_usage || null,
            parser: cachedResponse.result.metadata.parser,
            model: cachedResponse.result.metadata.model,
            usage: cachedResponse.result.metadata.usage,
          },
        };
        onDocumentLoad(file, parseResult);
      } else {
        onDocumentLoad(file);
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      setError('Failed to load document');
    } finally {
      setIsFetchingCached(false);
    }
  }, [currentProject, defaultProject, selectedParser, onDocumentLoad, onDocumentChange]);

  // Handle file upload - tries upload directly and handles conflicts
  const handleUpload = async (file: File, replaceExisting: boolean = false) => {
    const targetProject = currentProject || defaultProject;
    if (!targetProject) {
      onDocumentLoad(file);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const doc = await uploadDocument(targetProject.id, file, replaceExisting);
      if (!currentProject && defaultProject) {
        onProjectChange?.(defaultProject);
      }
      onDocumentChange?.(doc);
      setRefreshKey(prev => prev + 1);
      onDocumentLoad(file);
    } catch (err: unknown) {
      console.error('Failed to upload document:', err);

      // Check if it's a conflict error (filename duplicate)
      const error = err as Error & { isConflict?: boolean; uploadedAt?: string };
      if (error.isConflict) {
        // Show duplicate confirmation dialog
        setPendingUpload({
          file,
          duplicate: {
            is_duplicate: true,
            duplicate_type: 'filename',
            message: `A file named '${file.name}' already exists (uploaded ${error.uploadedAt ? new Date(error.uploadedAt).toLocaleString() : 'previously'}). Do you want to replace it?`
          }
        });
      } else {
        setError('Failed to upload document');
        onDocumentLoad(file);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Handle duplicate confirmation
  const handleDuplicateConfirm = async (replace: boolean) => {
    if (!pendingUpload) return;

    if (replace) {
      await handleUpload(pendingUpload.file, true);
    } else {
      // User chose to keep existing, load the file locally without uploading
      onDocumentLoad(pendingUpload.file);
    }
    setPendingUpload(null);
  };

  // Toggle document selection for batch processing
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  // Select/deselect all documents
  const toggleSelectAll = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map(d => d.id)));
    }
  };

  // Start batch processing
  const handleBatchProcess = async (processAll: boolean) => {
    const project = currentProject || defaultProject;
    if (!project) return;

    setBatchError(null);

    const documentIds = processAll ? undefined : Array.from(selectedDocIds);
    if (!processAll && documentIds?.length === 0) {
      setBatchError('Select at least one document');
      return;
    }

    try {
      const job = await startBatchProcess(project.id, {
        document_ids: documentIds,
        parser: getParserType(selectedParser),
        model: getModelForParser(selectedParser) || undefined,
        skip_already_parsed: true,
      });
      setActiveBatchJob(job);
      setSelectedDocIds(new Set());
    } catch (err) {
      console.error('Failed to start batch processing:', err);
      setBatchError(err instanceof Error ? err.message : 'Failed to start processing');
    }
  };

  // Cancel batch job
  const handleCancelBatch = async () => {
    if (!activeBatchJob) return;

    try {
      await cancelBatchJob(activeBatchJob.id);
      setActiveBatchJob(null);
    } catch (err) {
      console.error('Failed to cancel batch job:', err);
    }
  };

  // Handle project change
  const handleProjectChange = (project: Project | null) => {
    onProjectChange?.(project);
    onDocumentChange?.(null);
    setSelectedDocIds(new Set());
    onClearDocument();
  };

  if (isAvailable === false) {
    return (
      <div className={`h-full flex items-center justify-center ${theme.textSubtle}`}>
        <p>Project storage is not configured</p>
      </div>
    );
  }

  if (isAvailable === null) {
    return (
      <div className={`h-full flex items-center justify-center ${theme.textSubtle}`}>
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    );
  }

  const effectiveProject = currentProject || defaultProject;
  const isAnyJobRunning = !!(activeBatchJob && ['pending', 'processing'].includes(activeBatchJob.status));

  return (
    <div className="h-full flex flex-col">
      {/* Project selector and upload */}
      <div className={`flex items-center gap-3 px-4 py-3 border-b ${theme.border}`}>
        <ProjectSelector
          selectedProject={currentProject}
          onProjectChange={handleProjectChange}
          disabled={isProcessing || isUploading || isFetchingCached}
        />

        <label className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
          isUploading || !!pendingUpload ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        style={{
          background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
          color: 'white',
        }}
        >
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = '';
            }}
            disabled={isUploading || !!pendingUpload}
            className="hidden"
          />
          {isUploading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Document
            </>
          )}
        </label>
      </div>

      {/* Error messages */}
      {(error || batchError) && (
        <div className={`px-4 py-2 text-sm ${isDark ? 'text-red-400 bg-red-900/20' : 'text-red-600 bg-red-50'}`}>
          {error || batchError}
        </div>
      )}

      {/* Duplicate confirmation dialog */}
      {pendingUpload && (
        <div className={`px-4 py-3 border-b ${theme.border} ${isDark ? 'bg-amber-900/20' : 'bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            <svg className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className={`text-sm font-medium ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                Duplicate file detected
              </p>
              <p className={`text-sm mt-1 ${isDark ? 'text-amber-400/80' : 'text-amber-700'}`}>
                {pendingUpload.duplicate.message}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => handleDuplicateConfirm(true)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    isDark ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
                  }`}
                >
                  Replace existing
                </button>
                <button
                  onClick={() => handleDuplicateConfirm(false)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                  }`}
                >
                  Keep existing
                </button>
                <button
                  onClick={() => setPendingUpload(null)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch processing controls */}
      {effectiveProject && documents.length > 0 && (
        <div className={`px-4 py-3 border-b ${theme.border} ${isDark ? 'bg-slate-800/30' : 'bg-slate-50'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDocIds.size === documents.length && documents.length > 0}
                  onChange={toggleSelectAll}
                  disabled={isAnyJobRunning}
                  className="w-4 h-4 rounded border-gray-400 text-sky-500 focus:ring-sky-500"
                />
                <span className={`text-sm ${theme.textSecondary}`}>
                  {selectedDocIds.size > 0 ? `${selectedDocIds.size} selected` : 'Select all'}
                </span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleBatchProcess(false)}
                disabled={selectedDocIds.size === 0 || isAnyJobRunning}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedDocIds.size === 0 || isAnyJobRunning
                    ? `${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'} cursor-not-allowed`
                    : `${isDark ? 'bg-sky-600 hover:bg-sky-500' : 'bg-sky-500 hover:bg-sky-600'} text-white`
                }`}
              >
                Process Selected
              </button>
              <button
                onClick={() => handleBatchProcess(true)}
                disabled={isAnyJobRunning}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isAnyJobRunning
                    ? `${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400'} cursor-not-allowed`
                    : `${isDark ? 'bg-purple-600 hover:bg-purple-500' : 'bg-purple-500 hover:bg-purple-600'} text-white`
                }`}
              >
                Process All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active batch job status */}
      {activeBatchJob && (
        <div className={`px-4 py-3 border-b ${theme.border} ${isDark ? 'bg-indigo-900/20' : 'bg-indigo-50'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
              Batch Processing: {activeBatchJob.status === 'processing' ? 'In Progress' : activeBatchJob.status}
            </span>
            {['pending', 'processing'].includes(activeBatchJob.status) && (
              <button
                onClick={handleCancelBatch}
                className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-red-900/50 text-red-400 hover:bg-red-900' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
              >
                Cancel
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className={`w-full h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-purple-500 transition-all duration-300"
              style={{
                width: `${((activeBatchJob.completed_documents + activeBatchJob.failed_documents) / activeBatchJob.total_documents) * 100}%`
              }}
            />
          </div>

          <div className={`mt-2 text-xs ${theme.textMuted}`}>
            {activeBatchJob.completed_documents} completed
            {activeBatchJob.failed_documents > 0 && `, ${activeBatchJob.failed_documents} failed`}
            {' / '}{activeBatchJob.total_documents} total
          </div>
        </div>
      )}

      {/* Document list with selection */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {effectiveProject ? (
          documents.length > 0 ? (
            <div className="space-y-1">
              {documents.map(doc => {
                const isSelected = currentDocument?.id === doc.id;
                const isChecked = selectedDocIds.has(doc.id);
                const taskStatus = activeBatchJob?.tasks?.find(t => t.document_id === doc.id);

                return (
                  <div
                    key={doc.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                      isSelected
                        ? isDark ? 'bg-sky-900/30 ring-1 ring-sky-500/50' : 'bg-sky-100 ring-1 ring-sky-400/50'
                        : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleDocSelection(doc.id);
                      }}
                      disabled={isAnyJobRunning}
                      className="w-4 h-4 rounded border-gray-400 text-sky-500 focus:ring-sky-500"
                    />

                    <div
                      className="flex-1 min-w-0"
                      onClick={() => handleDocumentSelect(doc)}
                    >
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 flex-shrink-0 ${theme.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className={`text-sm truncate ${theme.textPrimary}`}>
                          {doc.original_filename}
                        </span>
                        {doc.has_cached_result && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-green-900/50 text-green-400' : 'bg-green-100 text-green-700'}`}>
                            Processed
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Task progress indicator */}
                    {taskStatus && ['pending', 'processing'].includes(taskStatus.status) && (
                      <div className="flex items-center gap-2">
                        <div className={`w-16 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                          <div
                            className="h-full bg-sky-500 transition-all"
                            style={{ width: `${taskStatus.progress}%` }}
                          />
                        </div>
                        <span className={`text-xs ${theme.textMuted}`}>{taskStatus.progress}%</span>
                      </div>
                    )}
                    {taskStatus?.status === 'completed' && (
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {taskStatus?.status === 'failed' && (
                      <span title={taskStatus.error_message || 'Failed'}>
                        <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={`h-full flex flex-col items-center justify-center ${theme.textSubtle}`}>
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">No documents yet</p>
              <p className={`text-xs mt-1 ${theme.textMuted}`}>Upload documents to get started</p>
            </div>
          )
        ) : (
          <div className={`h-full flex items-center justify-center ${theme.textSubtle}`}>
            <p>Select or create a project</p>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isFetchingCached && (
        <div className={`px-4 py-2 flex items-center gap-2 text-sm ${theme.textSubtle} border-t ${theme.border}`}>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading document...
        </div>
      )}
    </div>
  );
}

/**
 * Dashboard Page - Full page showing all projects with document status summaries
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, DocumentStatusSummary } from '../types/project';
import type { ProjectSettings } from '../types/checksV2';
import { listProjects, getProjectDocumentStatus, uploadDocument, createProject, deleteProject, deleteDocument } from '../services/projectService';
import { runBatchChecks, getBatchRuns, getProjectSettings } from '../services/checksService';
import { startBatchProcess, listBatchJobs, getBatchJob, cancelBatchJob } from '../services/batchService';
import type { BatchJob } from '../types/batch';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import DocumentTypeBadge from './DocumentTypeBadge';
import BatchCheckProgress from './BatchCheckProgress';
import UserMenu from './UserMenu';
import { Modal, Button } from './ui';
import cognaifySymbol from '../assets/cognaify-symbol.png';
import cognaifyLogo from '../assets/Cognaify-logo-white-bg.png';

interface DashboardPageProps {
  onOpenDocument: (project: Project, documentId: string) => void;
  onOpenSettings: () => void;
  onProjectChange?: (project: Project | null) => void;
}

export default function DashboardPage({
  onOpenDocument,
  onOpenSettings,
  onProjectChange,
}: DashboardPageProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const { getAccessToken, signOut } = useAuth();

  // Proactively check session validity on mount
  // GET endpoints work without auth, so user won't know their session expired
  // until they try a write operation. This catches it early.
  useEffect(() => {
    const checkSession = async () => {
      const token = await getAccessToken();
      if (!token) {
        console.warn('[Dashboard] No valid auth token - session may have expired');
        await signOut();
        window.location.reload();
      }
    };
    checkSession();
  }, [getAccessToken, signOut]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<DocumentStatusSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isRunningBatchCheck, setIsRunningBatchCheck] = useState(false);
  const [activeBatchRunId, setActiveBatchRunId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeBatchJob, setActiveBatchJob] = useState<BatchJob | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [showReprocessModal, setShowReprocessModal] = useState(false);
  const [reprocessAction, setReprocessAction] = useState<'process' | 'check' | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings | null>(null);
  const [showDeleteProjectModal, setShowDeleteProjectModal] = useState(false);
  const [showDeleteDocModal, setShowDeleteDocModal] = useState<string | null>(null); // document ID to delete
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadDocumentsRequestId = useRef(0); // Track request ID to prevent stale updates
  const checkBatchJobsRequestId = useRef(0); // Track batch jobs request ID

  // Clear selection when documents change
  useEffect(() => {
    setSelectedDocIds(new Set());
  }, [documents]);

  // Notify parent of selected project changes
  useEffect(() => {
    onProjectChange?.(selectedProject);
  }, [selectedProject, onProjectChange]);

  // Reset request counters when project changes (ensures spinner shows on project switch)
  useEffect(() => {
    loadDocumentsRequestId.current = 0;
    checkBatchJobsRequestId.current = 0;
  }, [selectedProject?.id]);

  // Load projects on mount
  useEffect(() => {
    const loadProjectsAndDocs = async () => {
      try {
        setIsLoading(true);
        const response = await listProjects();
        setProjects(response.projects);
        // Auto-select first project - the loadDocuments effect will handle loading docs
        if (response.projects.length > 0) {
          const firstProject = response.projects[0];
          setSelectedProject(firstProject);
          // Note: Don't load documents here - the useEffect with loadDocuments will handle it
          // This prevents duplicate requests and race conditions
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError('Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };
    loadProjectsAndDocs();
  }, []);

  // Load documents and settings when selected project changes
  const loadDocuments = useCallback(async () => {
    if (!selectedProject) {
      setDocuments([]);
      setProjectSettings(null);
      return;
    }

    // Check if this is the first load (before incrementing)
    const isInitialLoad = loadDocumentsRequestId.current === 0;

    // Increment request ID and capture it for this request
    const requestId = ++loadDocumentsRequestId.current;
    const projectId = selectedProject.id;

    try {
      // Only show loading spinner on initial load (prevents flicker on refresh)
      if (isInitialLoad) {
        setIsLoadingDocs(true);
      }
      // Load documents and settings in parallel
      const [docResponse, settings] = await Promise.all([
        getProjectDocumentStatus(projectId),
        getProjectSettings(projectId).catch(() => null), // Don't fail if settings unavailable
      ]);

      // Only update if this is still the latest request
      if (requestId === loadDocumentsRequestId.current) {
        setDocuments(docResponse.documents);
        if (settings) {
          setProjectSettings(settings);
        }
      } else {
        console.log('Ignoring stale document response for request', requestId);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
      // Only clear on error if this is still the latest request
      if (requestId === loadDocumentsRequestId.current) {
        setDocuments([]);
      }
    } finally {
      // Only update loading state if this is still the latest request
      if (requestId === loadDocumentsRequestId.current) {
        setIsLoadingDocs(false);
      }
    }
  }, [selectedProject]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Check for active batch jobs (processing) when project changes
  const checkActiveBatchJobs = useCallback(async () => {
    if (!selectedProject) {
      setActiveBatchJob(null);
      setIsProcessing(false);
      setActiveBatchRunId(null);
      setIsRunningBatchCheck(false);
      return;
    }

    // Increment request ID and capture it for this request
    const requestId = ++checkBatchJobsRequestId.current;
    const projectId = selectedProject.id;

    try {
      // Check for active document processing jobs
      const response = await listBatchJobs(projectId, { status: 'processing' });

      // Only update if this is still the latest request
      if (requestId !== checkBatchJobsRequestId.current) {
        console.log('Ignoring stale batch jobs response for request', requestId);
        return;
      }

      if (response.jobs.length > 0) {
        setActiveBatchJob(response.jobs[0]);
        setIsProcessing(true);
      } else {
        // Also check for pending jobs
        const pendingResponse = await listBatchJobs(projectId, { status: 'pending' });

        // Check again for stale request
        if (requestId !== checkBatchJobsRequestId.current) {
          console.log('Ignoring stale batch jobs response for request', requestId);
          return;
        }

        if (pendingResponse.jobs.length > 0) {
          setActiveBatchJob(pendingResponse.jobs[0]);
          setIsProcessing(true);
        } else {
          setActiveBatchJob(null);
          setIsProcessing(false);
        }
      }

      // Check for active batch check runs
      const batchRuns = await getBatchRuns(projectId);

      // Check again for stale request
      if (requestId !== checkBatchJobsRequestId.current) {
        console.log('Ignoring stale batch runs response for request', requestId);
        return;
      }

      const activeCheckRun = batchRuns.runs.find(
        run => run.status === 'processing' || run.status === 'pending'
      );
      if (activeCheckRun) {
        setActiveBatchRunId(activeCheckRun.id);
        setIsRunningBatchCheck(true);
      } else {
        setActiveBatchRunId(null);
        setIsRunningBatchCheck(false);
      }
    } catch (err) {
      console.error('Failed to check batch jobs:', err);
    }
  }, [selectedProject]);

  useEffect(() => {
    checkActiveBatchJobs();
  }, [checkActiveBatchJobs]);

  // Poll for batch job progress
  useEffect(() => {
    if (!activeBatchJob || !isProcessing || !selectedProject) return;

    const pollInterval = setInterval(async () => {
      try {
        const job = await getBatchJob(activeBatchJob.id);
        setActiveBatchJob(job);

        if (job.status === 'completed' || job.status === 'completed_with_errors' || job.status === 'failed' || job.status === 'cancelled') {
          setIsProcessing(false);
          setActiveBatchJob(null);
          // Only reload if we're still on the same project
          // Use the ref-based loadDocuments which handles stale requests
          loadDocuments();

          // Show error message for failed or partially failed jobs
          if (job.status === 'failed') {
            setError(`Batch processing failed: ${job.error_message || 'Unknown error'}`);
          } else if (job.status === 'completed_with_errors') {
            setError(`Processing completed with ${job.failed_documents} failed document(s). Check individual documents for details.`);
          } else if (job.status === 'cancelled') {
            setError('Batch processing was cancelled');
          }
        }
      } catch (err) {
        console.error('Failed to poll batch job:', err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [activeBatchJob?.id, activeBatchJob?.status, isProcessing, selectedProject?.id, loadDocuments]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;

    try {
      setIsUploading(true);
      await uploadDocument(selectedProject.id, file);
      // Reload documents after upload using the tracked loadDocuments
      await loadDocuments();
    } catch (err) {
      console.error('Failed to upload document:', err);
      setError('Failed to upload document');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle new project creation
  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const project = await createProject(newProjectName.trim());
      setProjects([project, ...projects]);
      setSelectedProject(project);
      setNewProjectName('');
      setShowNewProjectModal(false);
    } catch (err) {
      console.error('Failed to create project:', err);
      setError('Failed to create project');
    }
  };

  // Handle batch check completion
  const handleBatchCheckComplete = () => {
    setIsRunningBatchCheck(false);
    setActiveBatchRunId(null);
    // Reload documents to get updated check results
    loadDocuments();
  };

  // Handle delete project
  const handleDeleteProject = async () => {
    if (!selectedProject) return;

    setIsDeleting(true);
    try {
      await deleteProject(selectedProject.id);
      // Remove from projects list and select another
      const remaining = projects.filter(p => p.id !== selectedProject.id);
      setProjects(remaining);
      setSelectedProject(remaining.length > 0 ? remaining[0] : null);
      setShowDeleteProjectModal(false);
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError('Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle delete document
  const handleDeleteDocument = async (documentId: string) => {
    if (!selectedProject) return;

    setIsDeleting(true);
    try {
      await deleteDocument(selectedProject.id, documentId);
      // Remove from documents list
      setDocuments(docs => docs.filter(d => d.id !== documentId));
      setShowDeleteDocModal(null);
    } catch (err) {
      console.error('Failed to delete document:', err);
      setError('Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  // Selection helpers
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

  const toggleSelectAll = () => {
    if (selectedDocIds.size === documents.length) {
      setSelectedDocIds(new Set());
    } else {
      setSelectedDocIds(new Set(documents.map(d => d.id)));
    }
  };

  const isAllSelected = documents.length > 0 && selectedDocIds.size === documents.length;
  const isSomeSelected = selectedDocIds.size > 0 && selectedDocIds.size < documents.length;

  // Get selected documents info
  const selectedDocs = documents.filter(d => selectedDocIds.has(d.id));
  const selectedProcessedDocs = selectedDocs.filter(d => d.processed_at);
  const selectedUnprocessedDocs = selectedDocs.filter(d => !d.processed_at);
  const selectedWithChecks = selectedDocs.filter(d => d.check_summary);

  // Handle processing selected documents
  const handleProcessSelected = async (forceReprocess = false) => {
    if (!selectedProject || selectedDocIds.size === 0) return;

    // Check if any selected docs are already processed
    if (!forceReprocess && selectedProcessedDocs.length > 0 && selectedUnprocessedDocs.length === 0) {
      // All selected are already processed - ask about reprocessing
      setReprocessAction('process');
      setShowReprocessModal(true);
      return;
    }

    const docsToProcess = forceReprocess
      ? selectedDocs
      : selectedUnprocessedDocs;

    if (docsToProcess.length === 0) {
      setError('No documents to process');
      return;
    }

    try {
      setIsProcessing(true);
      const job = await startBatchProcess(selectedProject.id, {
        document_ids: docsToProcess.map(doc => doc.id),
        parser: projectSettings?.vision_parser || 'landing_ai', // Use project settings
        skip_already_parsed: !forceReprocess,
      });
      setActiveBatchJob(job);
      setSelectedDocIds(new Set()); // Clear selection after starting
    } catch (err: unknown) {
      console.error('Failed to start batch processing:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start document processing: ${errorMessage}`);
      setIsProcessing(false);
    }
  };

  // Handle running checks on selected documents
  const handleRunChecksSelected = async (forceRerun = false) => {
    if (!selectedProject || selectedDocIds.size === 0) return;

    // Only run checks on processed documents
    const processedSelected = selectedProcessedDocs;
    if (processedSelected.length === 0) {
      setError('No processed documents selected. Process documents first before running checks.');
      return;
    }

    // Check if any have existing check results
    if (!forceRerun && selectedWithChecks.length > 0 && selectedWithChecks.length === processedSelected.length) {
      // All have existing checks - ask about rerunning
      setReprocessAction('check');
      setShowReprocessModal(true);
      return;
    }

    try {
      setIsRunningBatchCheck(true);
      const response = await runBatchChecks(selectedProject.id, {
        force_rerun: forceRerun,
        skip_unparsed: true,
      });
      setActiveBatchRunId(response.batch_run_id);
      setSelectedDocIds(new Set()); // Clear selection after starting
    } catch (err: unknown) {
      console.error('Failed to start batch checks:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start batch checks: ${errorMessage}`);
      setIsRunningBatchCheck(false);
    }
  };

  // Handle confirmation from reprocess modal
  const handleReprocessConfirm = (reprocess: boolean) => {
    setShowReprocessModal(false);
    if (reprocessAction === 'process') {
      handleProcessSelected(reprocess);
    } else if (reprocessAction === 'check') {
      handleRunChecksSelected(reprocess);
    }
    setReprocessAction(null);
  };

  // Handle cancelling a batch job (including stuck jobs)
  const handleCancelBatchJob = async () => {
    if (!activeBatchJob) return;

    try {
      await cancelBatchJob(activeBatchJob.id);
      setActiveBatchJob(null);
      setIsProcessing(false);
      // Reload documents to get updated status
      loadDocuments();
    } catch (err) {
      console.error('Failed to cancel batch job:', err);
      // Even if backend cancel fails, reset the UI state
      // The job may have already completed or been cleaned up
      setActiveBatchJob(null);
      setIsProcessing(false);
      loadDocuments();
    }
  };

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: theme.pageBg }}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-400"></div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: theme.pageBg }}>
      {/* Header */}
      <header className={`border-b ${theme.border} px-6 py-3 relative z-50`} style={{ background: theme.headerBg, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={cognaifySymbol} alt="Cognaify Solutions" className="h-10 object-contain" />
            <div className={`h-8 w-px ${isDark ? 'bg-slate-700/40' : 'bg-slate-300/60'}`}></div>
            <div className="flex flex-col">
              <h1 className={`text-lg font-semibold ${theme.textPrimary} leading-tight`}>
                CompliCheck<span className="bg-gradient-to-r from-sky-400 via-purple-500 to-orange-500 bg-clip-text text-transparent">AI</span>
                <sup className={`text-[8px] ${theme.textMuted} ml-0.5`}>TM</sup>
              </h1>
              <span className={`text-xs ${theme.textMuted}`}>Document Compliance Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className={`${isDark ? 'bg-red-900/30 border-red-700/50' : 'bg-red-100 border-red-300'} border-b px-6 py-3`}>
          <div className={`flex items-center gap-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
            <button onClick={() => setError(null)} className={`ml-auto ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Projects */}
        <div className={`w-64 border-r ${theme.border} flex flex-col`} style={{ background: theme.panelBg }}>
          <div className="p-4 border-b" style={{ borderColor: isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.8)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`font-semibold ${theme.textPrimary}`}>Projects</h2>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700/50 text-gray-400 hover:text-gray-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
                title="New Project"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProject(project)}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  selectedProject?.id === project.id
                    ? isDark
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'bg-sky-50 text-sky-700 border border-sky-200'
                    : isDark
                      ? 'text-gray-300 hover:bg-slate-700/50'
                      : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="truncate font-medium">{project.name}</span>
                </div>
                <div className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                  {project.document_count} document{project.document_count !== 1 ? 's' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Area - Documents */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Project Header */}
          {selectedProject && (
            <div className={`px-6 py-4 border-b ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.4)' : 'rgba(248, 250, 252, 0.8)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <h2 className={`text-xl font-semibold ${theme.textPrimary}`}>{selectedProject.name}</h2>
                    <p className={`text-sm ${theme.textMuted}`}>
                      {documents.length} document{documents.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {/* Project Settings Button */}
                  <button
                    onClick={onOpenSettings}
                    className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                    title="Project Settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  {/* Delete Project Button */}
                  <button
                    onClick={() => setShowDeleteProjectModal(true)}
                    className={`p-2 rounded-lg transition-colors ${isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20' : 'text-red-500 hover:text-red-600 hover:bg-red-50'}`}
                    title="Delete Project"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                  />
                  {/* Selection indicator */}
                  {selectedDocIds.size > 0 && (
                    <span className={`text-sm ${theme.textMuted}`}>
                      {selectedDocIds.size} selected
                    </span>
                  )}
                  {/* Process Button / Cancel Processing Button */}
                  {isProcessing ? (
                    <button
                      onClick={handleCancelBatchJob}
                      className="px-4 py-2 rounded-full transition-colors flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white"
                      title="Cancel processing"
                    >
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Cancel</span>
                      {activeBatchJob && (
                        <span className="text-xs opacity-80">
                          ({activeBatchJob.completed_documents}/{activeBatchJob.total_documents})
                        </span>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleProcessSelected()}
                      disabled={selectedDocIds.size === 0}
                      className={`px-4 py-2 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50 border ${
                        isDark
                          ? 'bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:border-slate-500'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                      }`}
                      title={selectedDocIds.size === 0 ? 'Select documents to process' : `Process ${selectedDocIds.size} selected document(s)`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Process</span>
                    </button>
                  )}
                  {/* Run Checks Button */}
                  <button
                    onClick={() => handleRunChecksSelected()}
                    disabled={isRunningBatchCheck || selectedDocIds.size === 0}
                    className={`px-4 py-2 rounded-full transition-colors flex items-center gap-2 disabled:opacity-50 border ${
                      isDark
                        ? 'bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700/50 hover:border-slate-500'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                    }`}
                    title={selectedDocIds.size === 0 ? 'Select documents to run checks' : `Run checks on ${selectedDocIds.size} selected document(s)`}
                  >
                    {isRunningBatchCheck ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Running...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                        </svg>
                        <span>Run Checks</span>
                      </>
                    )}
                  </button>
                  {/* Upload Button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-4 py-2 text-white rounded-full transition-colors flex items-center gap-2 disabled:opacity-50"
                    style={{
                      background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                      boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
                      border: '1px solid rgba(191, 219, 254, 0.3)'
                    }}
                  >
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Upload Document</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Batch Check Progress */}
          {activeBatchRunId && (
            <div className="px-6 pt-4">
              <BatchCheckProgress
                batchRunId={activeBatchRunId}
                onComplete={handleBatchCheckComplete}
                onClose={() => {
                  setActiveBatchRunId(null);
                  setIsRunningBatchCheck(false);
                }}
              />
            </div>
          )}

          {/* Documents Table */}
          <div className="flex-1 overflow-auto p-6">
            {isLoadingDocs ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-400"></div>
              </div>
            ) : documents.length === 0 ? (
              <div className={`flex flex-col items-center justify-center h-full ${theme.textSubtle}`}>
                <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className={theme.textMuted}>No documents yet</p>
                <p className={`text-sm mt-1 ${theme.textSubtle}`}>Upload a document to get started</p>
              </div>
            ) : (
              <div className={`rounded-xl border ${theme.border} overflow-hidden`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#ffffff' }}>
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${theme.border}`} style={{ background: isDark ? 'rgba(30, 41, 59, 0.5)' : 'rgba(248, 250, 252, 0.8)' }}>
                      <th className={`w-10 px-4 py-3`}>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => { if (el) el.indeterminate = isSomeSelected; }}
                          onChange={toggleSelectAll}
                          className={`rounded border-2 ${isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'} text-sky-500 focus:ring-sky-500 cursor-pointer`}
                        />
                      </th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Document</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Type</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Status</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Check Results</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Comments</th>
                      <th className={`text-right px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`border-b last:border-0 ${theme.border} transition-colors cursor-pointer ${
                          selectedDocIds.has(doc.id)
                            ? isDark ? 'bg-sky-900/20' : 'bg-sky-50'
                            : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                        }`}
                        onClick={() => selectedProject && onOpenDocument(selectedProject, doc.id)}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedDocIds.has(doc.id)}
                            onChange={() => toggleDocSelection(doc.id)}
                            className={`rounded border-2 ${isDark ? 'border-slate-600 bg-slate-800' : 'border-slate-300 bg-white'} text-sky-500 focus:ring-sky-500 cursor-pointer`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                              <svg className={`w-5 h-5 ${isDark ? 'text-gray-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                            <div>
                              <p className={`font-medium ${theme.textPrimary}`}>{doc.original_filename}</p>
                              <p className={`text-xs ${theme.textSubtle}`}>
                                {formatFileSize(doc.file_size)}
                                {doc.page_count && ` - ${doc.page_count} pages`}
                              </p>
                            </div>
                          </div>
                        </td>
                        {/* Document Type Column */}
                        <td className="px-4 py-3">
                          <DocumentTypeBadge
                            documentType={doc.document_type}
                            confidence={doc.classification_confidence}
                            isOverride={doc.classification_override}
                            pageTypes={doc.page_types}
                          />
                        </td>
                        {/* Status Column */}
                        <td className="px-4 py-3">
                          {doc.processed_at ? (
                            <div className="flex items-center gap-2 group relative">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium cursor-help ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}
                              >
                                Parsed
                              </span>
                              {/* Tooltip */}
                              <div className={`absolute left-0 bottom-full mb-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 text-white'}`}>
                                <div className="flex flex-col gap-1">
                                  <span>{new Date(doc.processed_at).toLocaleString()}</span>
                                  <span>Parser: {doc.parser === 'landing_ai' ? 'Landing AI' : doc.parser === 'gemini_vision' ? 'Gemini Vision' : doc.parser === 'bedrock_claude' ? 'Bedrock Claude' : doc.parser || 'Unknown'}{doc.parser_model ? ` (${doc.parser_model})` : ''}</span>
                                  {doc.uploaded_by && <span>By: {doc.uploaded_by}</span>}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                              Pending
                            </span>
                          )}
                        </td>
                        {/* Check Results Column */}
                        <td className="px-4 py-3">
                          {doc.check_summary ? (
                            <div className="flex items-center gap-2">
                              {doc.check_summary.passed > 0 && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                                  {doc.check_summary.passed} ✓
                                </span>
                              )}
                              {doc.check_summary.failed > 0 && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'}`}>
                                  {doc.check_summary.failed} ✗
                                </span>
                              )}
                              {doc.check_summary.needs_review > 0 && (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                  {doc.check_summary.needs_review} ⚠
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={`text-xs ${theme.textSubtle}`}>Not checked</span>
                          )}
                        </td>
                        {/* Comments Column */}
                        <td className="px-4 py-3">
                          {doc.annotations.total > 0 ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-sky-500/20 text-sky-400' : 'bg-sky-100 text-sky-700'}`}>
                                {doc.annotations.total}
                              </span>
                              {doc.annotations.open > 0 && (
                                <span className={`text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                                  ({doc.annotations.open} open)
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className={`text-sm ${theme.textSubtle}`}>-</span>
                          )}
                        </td>
                        {/* Actions Column */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                selectedProject && onOpenDocument(selectedProject, doc.id);
                              }}
                              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${isDark ? 'text-sky-400 hover:bg-sky-500/20' : 'text-sky-600 hover:bg-sky-50'}`}
                            >
                              Review
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowDeleteDocModal(doc.id);
                              }}
                              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-red-400 hover:bg-red-500/20' : 'text-red-500 hover:bg-red-50'}`}
                              title="Delete Document"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={`border-t ${theme.border} px-6 py-2 text-xs ${theme.textSubtle} flex items-center justify-between`} style={{ background: theme.footerBg }}>
        <span className="flex items-center gap-2">
          <span>CompliCheck<span className="bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent font-medium">AI</span><sup className="text-[6px]">TM</sup></span>
          <span>- powered by</span>
          <a href="https://cognaify.com" target="_blank" rel="noopener noreferrer" className="flex items-center">
            <img src={cognaifyLogo} alt="Cognaify Solutions" className="h-5 object-contain" />
          </a>
        </span>
        <span className={theme.textMuted}>
          {projects.length} project{projects.length !== 1 ? 's' : ''} - {documents.length} document{documents.length !== 1 ? 's' : ''}
        </span>
      </footer>

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className={`rounded-xl shadow-2xl max-w-md w-full mx-4 border ${theme.border}`} style={{ background: isDark ? 'radial-gradient(circle at top left, rgba(30, 64, 175, 0.2), #020617 65%)' : '#ffffff' }}>
            <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
              <h3 className={`font-semibold ${theme.textPrimary}`}>New Project</h3>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className={`p-1 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <label className={`block text-sm font-medium mb-2 ${theme.textMuted}`}>Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Enter project name..."
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  isDark
                    ? 'bg-slate-800/60 border-slate-600/50 text-gray-300 placeholder-gray-500'
                    : 'bg-white border-slate-300 text-slate-700 placeholder-slate-400'
                }`}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
              />
            </div>
            <div className={`flex justify-end gap-3 p-4 border-t ${theme.border}`}>
              <button
                onClick={() => setShowNewProjectModal(false)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDark ? 'text-gray-300 hover:bg-slate-700/50' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                disabled={!newProjectName.trim()}
                className="px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50"
                style={{
                  background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                }}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reprocess Confirmation Modal */}
      {showReprocessModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className={`rounded-xl shadow-2xl max-w-md w-full mx-4 border ${theme.border}`} style={{ background: isDark ? 'radial-gradient(circle at top left, rgba(30, 64, 175, 0.2), #020617 65%)' : '#ffffff' }}>
            <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
              <h3 className={`font-semibold ${theme.textPrimary}`}>
                {reprocessAction === 'process' ? 'Reprocess Documents?' : 'Re-run Checks?'}
              </h3>
              <button
                onClick={() => setShowReprocessModal(false)}
                className={`p-1 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className={`text-sm ${theme.textSecondary}`}>
                {reprocessAction === 'process' ? (
                  <>
                    {selectedProcessedDocs.length} of the selected documents have already been processed.
                    Would you like to reprocess them?
                  </>
                ) : (
                  <>
                    {selectedWithChecks.length} of the selected documents already have check results.
                    Would you like to re-run the checks?
                  </>
                )}
              </p>
            </div>
            <div className={`flex justify-end gap-3 p-4 border-t ${theme.border}`}>
              <button
                onClick={() => setShowReprocessModal(false)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDark ? 'text-gray-300 hover:bg-slate-700/50' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReprocessConfirm(false)}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-gray-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
              >
                {reprocessAction === 'process' ? 'Skip Processed' : 'Skip Existing'}
              </button>
              <button
                onClick={() => handleReprocessConfirm(true)}
                className="px-4 py-2 text-sm text-white rounded-lg transition-colors"
                style={{
                  background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                }}
              >
                {reprocessAction === 'process' ? 'Reprocess All' : 'Re-run All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      <Modal
        isOpen={showDeleteProjectModal && !!selectedProject}
        onClose={() => setShowDeleteProjectModal(false)}
        title="Delete Project"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteProjectModal(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteProject}
              isLoading={isDeleting}
            >
              Delete Project
            </Button>
          </>
        }
      >
        <p className={`text-sm ${theme.textSecondary}`}>
          Are you sure you want to delete <strong className={theme.textPrimary}>{selectedProject?.name}</strong>?
        </p>
        <p className={`text-sm mt-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
          This will permanently delete the project and all {documents.length} document{documents.length !== 1 ? 's' : ''} in it. This action cannot be undone.
        </p>
      </Modal>

      {/* Delete Document Confirmation Modal */}
      <Modal
        isOpen={!!showDeleteDocModal}
        onClose={() => setShowDeleteDocModal(null)}
        title="Delete Document"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDocModal(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => showDeleteDocModal && handleDeleteDocument(showDeleteDocModal)}
              isLoading={isDeleting}
            >
              Delete Document
            </Button>
          </>
        }
      >
        <p className={`text-sm ${theme.textSecondary}`}>
          Are you sure you want to delete <strong className={theme.textPrimary}>{documents.find(d => d.id === showDeleteDocModal)?.original_filename}</strong>?
        </p>
        <p className={`text-sm mt-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
          This will permanently delete this document and all its check results. This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}

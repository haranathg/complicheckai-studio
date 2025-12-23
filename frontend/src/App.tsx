import { useState, useRef, useEffect, useCallback } from 'react';
import PDFViewer from './components/PDFViewer';
import TabNavigation from './components/TabNavigation';
import ParseResults from './components/ParseResults';
import ChatPanel from './components/ChatPanel';
import ComplianceTabV2 from './components/ComplianceTabV2';
import SettingsPanel from './components/SettingsPanel';
import ReviewTab from './components/ReviewTab';
import AnnotationPanel from './components/AnnotationPanel';
import DashboardPage from './components/DashboardPage';
import type { Project, Document } from './types/project';
import type { Annotation } from './types/annotation';
import SaveToProjectDropdown from './components/SaveToProjectDropdown';
import LoginPage from './components/LoginPage';
import type { ParseResponse, Chunk, TabType, ChatMessage, ChunkReference, BoundingBox } from './types/ade';
import type { ComplianceCheck } from './types/compliance';
import { API_URL } from './config';
import { isAuthenticated, logout } from './utils/auth';
import { getDefaultModelForParser } from './components/ModelSelector';
import { getParserType, getModelForParser } from './components/ParserSelector';
import { uploadDocument, checkProjectsAvailable, getOrCreateDefaultProject, listDocuments, getLatestParseResult, getDocumentDownloadUrl } from './services/projectService';
import { listDocumentAnnotations, listProjectAnnotations } from './services/annotationService';
import { useTheme, getThemeStyles } from './contexts/ThemeContext';
import cognaifyLogo from './assets/Cognaify-logo-white-bg.png';
import cognaifySymbol from './assets/cognaify-symbol.png';
import complianceConfig from './config/complianceChecks.json';

type ViewType = 'dashboard' | 'document';

// Default model (for chat/compliance) and parser
const DEFAULT_MODEL = 'bedrock-claude-sonnet-3.5';
const DEFAULT_PARSER = 'landing_ai';

function App() {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [currentView, setCurrentView] = useState<ViewType>('dashboard');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<Chunk | null>(null);
  const [popupChunk, setPopupChunk] = useState<Chunk | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('parse');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [selectedParser, setSelectedParser] = useState(DEFAULT_PARSER);
  const [completenessChecks, setCompletenessChecks] = useState<ComplianceCheck[]>(
    complianceConfig.completeness_checks as ComplianceCheck[]
  );
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>(
    complianceConfig.compliance_checks as ComplianceCheck[]
  );

  const [isPdfReady, setIsPdfReady] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentDocument, setCurrentDocument] = useState<Document | null>(null);
  const [projectsAvailable, setProjectsAvailable] = useState<boolean | null>(null);
  const [defaultProject, setDefaultProject] = useState<Project | null>(null);
  const [prefilledChunk, setPrefilledChunk] = useState<Chunk | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  // Chunk type visibility filters (for Parse tab legend)
  const [visibleChunkTypes, setVisibleChunkTypes] = useState<Set<string>>(
    new Set(['text', 'table', 'figure', 'title', 'caption', 'form_field'])
  );
  // Note level visibility filters (for Review tab legend)
  const [visibleNoteLevels, setVisibleNoteLevels] = useState<Set<string>>(
    new Set(['page', 'document', 'project'])
  );
  // Note: showReviewOverlays is now derived from visibleNoteLevels.size > 0
  const showReviewOverlays = visibleNoteLevels.size > 0;
  // Focus mode: when true, only show the selected chunk (hide all others)
  const [focusMode, setFocusMode] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Ref to store pending chunk to highlight after PDF loads (for cross-document navigation)
  const pendingChunkHighlightRef = useRef<{ chunk: Chunk | null; pageNumber?: number } | null>(null);

  // Check if projects are available and get default project on mount
  useEffect(() => {
    const init = async () => {
      const available = await checkProjectsAvailable();
      setProjectsAvailable(available);
      if (available) {
        const defProject = await getOrCreateDefaultProject();
        setDefaultProject(defProject);
        // Immediately load documents for the default project
        if (defProject) {
          try {
            const response = await listDocuments(defProject.id);
            setDocuments(response.documents);
          } catch (err) {
            console.error('Failed to load initial documents:', err);
          }
        }
      }
    };
    init();
  }, []);

  // Fetch annotations when document changes
  const loadAnnotations = useCallback(async () => {
    if (!currentProject) {
      setAnnotations([]);
      return;
    }
    try {
      if (currentDocument) {
        const response = await listDocumentAnnotations(currentProject.id, currentDocument.id);
        setAnnotations(response.annotations);
      } else {
        const response = await listProjectAnnotations(currentProject.id);
        setAnnotations(response.annotations);
      }
    } catch (err) {
      console.error('Failed to load annotations:', err);
      setAnnotations([]);
    }
  }, [currentProject, currentDocument]);

  useEffect(() => {
    loadAnnotations();
  }, [loadAnnotations]);

  // Load documents when project changes
  const loadDocuments = useCallback(async () => {
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
      setDocuments([]);
    }
  }, [currentProject, defaultProject]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Handle document selection from Parse tab dropdown
  const handleParseDocumentSelect = useCallback(async (doc: Document) => {
    const project = currentProject || defaultProject;
    if (!project) return;

    setCurrentDocument(doc);
    setIsLoading(true);

    try {
      const fileUrl = await getDocumentDownloadUrl(project.id, doc.id);
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();

      // Validate that we got a valid file
      const contentType = response.headers.get('content-type') || doc.content_type || 'application/pdf';
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      const loadedFile = new File([blob], doc.original_filename, {
        type: contentType,
      });

      const cachedResponse = await getLatestParseResult(project.id, doc.id, selectedParser);

      if (cachedResponse.cached && cachedResponse.result) {
        const parseResultData: ParseResponse = {
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
        setFile(loadedFile);
        setParseResult(parseResultData);
      } else {
        setFile(loadedFile);
        setParseResult(null);
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      // Provide meaningful error messages
      let errorMessage = 'Failed to load document';
      if (err instanceof Error) {
        if (err.message.includes('500')) {
          errorMessage = 'Server error loading document. The database connection may have been interrupted. Please try again.';
        } else if (err.message.includes('404')) {
          errorMessage = 'Document not found. It may have been deleted.';
        } else if (err.message.includes('403')) {
          errorMessage = 'Access denied. You may not have permission to view this document.';
        } else if (err.message.includes('network') || err.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (err.message.includes('empty')) {
          errorMessage = 'Document file is empty or corrupted.';
        } else {
          errorMessage = `Failed to load document: ${err.message}`;
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, defaultProject, selectedParser]);

  // Helper to find a chunk by page/bbox matching when ID doesn't match
  const findChunkByPageAndBbox = useCallback((
    chunks: Chunk[],
    targetPage: number,
    targetBbox: BoundingBox,
    tolerance: number = 0.05  // 5% tolerance for bbox matching
  ): Chunk | undefined => {
    // Find chunks on the same page
    const chunksOnPage = chunks.filter(c =>
      c.grounding?.page === targetPage
    );

    if (chunksOnPage.length === 0) return undefined;

    // Find chunk with closest matching bbox
    let bestMatch: Chunk | undefined;
    let bestScore = Infinity;

    for (const chunk of chunksOnPage) {
      if (!chunk.grounding?.box) continue;
      const box = chunk.grounding.box;

      // Calculate position difference
      const leftDiff = Math.abs(box.left - targetBbox.left);
      const topDiff = Math.abs(box.top - targetBbox.top);
      const rightDiff = Math.abs(box.right - targetBbox.right);
      const bottomDiff = Math.abs(box.bottom - targetBbox.bottom);
      const score = leftDiff + topDiff + rightDiff + bottomDiff;

      // Check if within tolerance
      if (leftDiff <= tolerance && topDiff <= tolerance &&
          rightDiff <= tolerance && bottomDiff <= tolerance) {
        if (score < bestScore) {
          bestScore = score;
          bestMatch = chunk;
        }
      }
    }

    return bestMatch;
  }, []);

  // Handle switching to a different document and highlighting a specific chunk
  // Used when clicking source chunks from multi-doc chat or compliance checks
  const handleSwitchDocumentAndHighlight = useCallback(async (
    documentId: string,
    chunkIds: string[],
    pageNumber?: number,
    chunkRef?: ChunkReference
  ) => {
    const project = currentProject || defaultProject;
    if (!project) return;

    // If it's the current document, just highlight the chunk
    if (currentDocument?.id === documentId) {
      const chunk = parseResult?.chunks.find(c => chunkIds.includes(c.id));
      if (chunk) {
        if (!visibleChunkTypes.has(chunk.type)) {
          setVisibleChunkTypes(prev => new Set([...prev, chunk.type]));
        }
        setHighlightedChunk(chunk);
        if (pageNumber) {
          setTargetPage(pageNumber);
        } else if (chunk.grounding) {
          setTargetPage(chunk.grounding.page + 1);
        }
      }
      return;
    }

    // Find the document in the list
    const doc = documents.find(d => d.id === documentId);
    if (!doc) {
      console.error('Document not found:', documentId);
      return;
    }

    // Load the document
    setIsLoading(true);
    try {
      const fileUrl = await getDocumentDownloadUrl(project.id, doc.id);
      const response = await fetch(fileUrl);

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const contentType = response.headers.get('content-type') || doc.content_type || 'application/pdf';
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }

      const loadedFile = new File([blob], doc.original_filename, {
        type: contentType,
      });

      const cachedResponse = await getLatestParseResult(project.id, doc.id, selectedParser);

      if (cachedResponse.cached && cachedResponse.result) {
        const parseResultData: ParseResponse = {
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

        // Find the chunk to highlight in the new document
        let chunkToHighlight = parseResultData.chunks.find(c => chunkIds.includes(c.id));

        // If chunk ID not found, try fallback matching by page/bbox
        if (!chunkToHighlight && chunkRef?.page !== undefined && chunkRef.bbox) {
          chunkToHighlight = findChunkByPageAndBbox(parseResultData.chunks, chunkRef.page, chunkRef.bbox);
        }

        // Store pending chunk to highlight after PDF loads
        if (chunkToHighlight) {
          pendingChunkHighlightRef.current = { chunk: chunkToHighlight, pageNumber };
        } else if (chunkRef?.page !== undefined) {
          // If we have page info but couldn't find chunk, at least navigate to the page
          pendingChunkHighlightRef.current = { chunk: null, pageNumber: chunkRef.page + 1 };
        }

        setCurrentDocument(doc);
        setFile(loadedFile);
        setParseResult(parseResultData);
        // Don't set highlightedChunk here - it will be set in handlePdfReady
      } else {
        // Document not parsed yet
        setCurrentDocument(doc);
        setFile(loadedFile);
        setParseResult(null);
        setError('This document has not been parsed yet. Please process it first.');
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setIsLoading(false);
    }
  }, [currentProject, defaultProject, currentDocument, documents, parseResult, selectedParser, visibleChunkTypes, findChunkByPageAndBbox]);

  const handleFileSelect = (uploadedFile: File, cachedResult?: ParseResponse) => {
    // Cancel any ongoing processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(uploadedFile);
    setError(null);
    setParseResult(cachedResult || null);
    setHighlightedChunk(null);
    setPopupChunk(null);
    setIsPdfReady(false);
    setIsLoading(false);
    setTargetPage(undefined);
    setChatMessages([]);
  };

  const handlePdfReady = useCallback(() => {
    setIsPdfReady(true);
    // Apply pending chunk highlight if we were waiting for PDF to load
    if (pendingChunkHighlightRef.current) {
      const { chunk, pageNumber } = pendingChunkHighlightRef.current;
      pendingChunkHighlightRef.current = null;

      // Handle page-only navigation (when chunk matching failed but we have page info)
      if (!chunk && pageNumber) {
        setTimeout(() => {
          setTargetPage(pageNumber);
        }, 150);
        return;
      }

      if (!chunk) {
        return;
      }

      const chunkPage = chunk.grounding ? chunk.grounding.page + 1 : undefined;
      // Use setTimeout to ensure PDF viewer has fully rendered
      setTimeout(() => {
        // Set highlighted chunk (focus mode is already enabled by onChunkSelect)
        setHighlightedChunk(chunk);
        // Navigate to page
        const targetPageNum = pageNumber || chunkPage;
        if (targetPageNum) {
          setTargetPage(targetPageNum);
        }
      }, 150);
    }
  }, []);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setError(null);
  };

  const handleProcess = async () => {
    if (!file) return;

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    // Map frontend parser ID to backend parser type
    const parserType = getParserType(selectedParser);
    formData.append('parser', parserType);
    // For Bedrock parsers, use the model from ParserSelector; otherwise use selectedModel
    const bedrockModel = getModelForParser(selectedParser);
    if (bedrockModel) {
      formData.append('model', bedrockModel);
    } else if (parserType === 'claude_vision') {
      formData.append('model', selectedModel);
    }
    // Add project/document context for caching
    if (currentProject && currentDocument) {
      formData.append('project_id', currentProject.id);
      formData.append('document_id', currentDocument.id);
    }

    try {
      const response = await fetch(`${API_URL}/api/parse`, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Parse failed');
      }

      const result = await response.json();
      setParseResult(result);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }
      console.error('Error parsing document:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Handle clicking chunk on PDF - only highlight, no popup
  const handleChunkClick = (chunk: Chunk) => {
    setHighlightedChunk(highlightedChunk?.id === chunk.id ? null : chunk);
    // Switch to parse tab to show chunk in list
    if (activeTab !== 'parse') {
      setActiveTab('parse');
    }
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
  };

  // Handle opening a document from the dashboard
  const handleOpenDocumentFromDashboard = useCallback(async (project: Project, documentId: string) => {
    setCurrentProject(project);
    setCurrentView('document');
    setActiveTab('parse');
    setFocusMode(false); // Reset focus mode when opening a new document

    // Load documents for this project
    try {
      const response = await listDocuments(project.id);
      setDocuments(response.documents);

      // Find and load the selected document
      const doc = response.documents.find(d => d.id === documentId);
      if (doc) {
        setCurrentDocument(doc);
        setIsLoading(true);

        try {
          const fileUrl = await getDocumentDownloadUrl(project.id, doc.id);
          const fileResponse = await fetch(fileUrl);

          if (!fileResponse.ok) {
            throw new Error(`Failed to download file: ${fileResponse.status} ${fileResponse.statusText}`);
          }

          const blob = await fileResponse.blob();

          // Validate that we got a PDF (check for PDF magic bytes or content-type)
          const contentType = fileResponse.headers.get('content-type') || doc.content_type || 'application/pdf';
          if (blob.size === 0) {
            throw new Error('Downloaded file is empty');
          }

          const loadedFile = new File([blob], doc.original_filename, {
            type: contentType,
          });

          const cachedResponse = await getLatestParseResult(project.id, doc.id, selectedParser);

          if (cachedResponse.cached && cachedResponse.result) {
            const parseResultData: ParseResponse = {
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
            setFile(loadedFile);
            setParseResult(parseResultData);
          } else {
            setFile(loadedFile);
            setParseResult(null);
          }
        } catch (err) {
          console.error('Failed to load document:', err);
          // Provide meaningful error messages
          let errorMessage = 'Failed to load document';
          if (err instanceof Error) {
            if (err.message.includes('500')) {
              errorMessage = 'Server error loading document. The database connection may have been interrupted. Please try again.';
            } else if (err.message.includes('404')) {
              errorMessage = 'Document not found. It may have been deleted.';
            } else if (err.message.includes('403')) {
              errorMessage = 'Access denied. You may not have permission to view this document.';
            } else if (err.message.includes('network') || err.message.includes('fetch')) {
              errorMessage = 'Network error. Please check your internet connection and try again.';
            } else if (err.message.includes('empty')) {
              errorMessage = 'Document file is empty or corrupted.';
            } else {
              errorMessage = `Failed to load document: ${err.message}`;
            }
          }
          setError(errorMessage);
        } finally {
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Failed to load project documents. Please try again.');
    }
  }, [selectedParser]);

  // Handle going back to dashboard
  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    // Clear document state
    setFile(null);
    setParseResult(null);
    setCurrentDocument(null);
    setHighlightedChunk(null);
    setPopupChunk(null);
    setError(null);
    setChatMessages([]);
  };

  const handleParserChange = (parser: string) => {
    setSelectedParser(parser);
    // Reset model to the default for the new parser
    setSelectedModel(getDefaultModelForParser(parser));
  };

  // Save current file to a project (for docs not yet saved)
  const handleSaveToProject = async (project: Project) => {
    if (!file) return;

    try {
      const doc = await uploadDocument(project.id, file);
      setCurrentProject(project);
      setCurrentDocument(doc);
    } catch (err) {
      console.error('Failed to save to project:', err);
      setError('Failed to save document to project');
    }
  };

  // Handle file upload - always saves to selected project or default Personal project
  const handleFileUpload = async (selectedFile: File) => {
    // Use current project if selected, otherwise use default project
    const targetProject = currentProject || defaultProject;

    if (targetProject && projectsAvailable) {
      try {
        const doc = await uploadDocument(targetProject.id, selectedFile);
        setCurrentProject(targetProject);
        setCurrentDocument(doc);
        handleFileSelect(selectedFile);
      } catch (err) {
        console.error('Failed to upload to project:', err);
        // Still load the file even if upload fails
        handleFileSelect(selectedFile);
      }
    } else {
      // No project available, just load the file
      handleFileSelect(selectedFile);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileUpload(selectedFile);
    }
    e.target.value = ''; // Reset input
  };

  // Show login page if not authenticated
  if (!authenticated) {
    return <LoginPage onAuthenticated={() => setAuthenticated(true)} />;
  }

  // Show Dashboard when in dashboard view
  if (currentView === 'dashboard') {
    return (
      <>
        <DashboardPage
          onOpenDocument={handleOpenDocumentFromDashboard}
          onLogout={handleLogout}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onProjectChange={setCurrentProject}
        />
        {/* Settings Panel - available on dashboard too */}
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          selectedParser={selectedParser}
          onParserChange={handleParserChange}
          completenessChecks={completenessChecks}
          complianceChecks={complianceChecks}
          onCompletenessChecksChange={setCompletenessChecks}
          onComplianceChecksChange={setComplianceChecks}
          currentProject={currentProject}
        />
      </>
    );
  }

  // Check if current doc is unsaved (has file but no document record)
  const isUnsavedDoc = file && !currentDocument && projectsAvailable;

  // Document Viewer view
  return (
    <div className="h-screen flex flex-col" style={{ background: theme.pageBg }}>
      {/* Header */}
      <header className={`border-b ${theme.border} px-6 py-3`} style={{ background: theme.headerBg, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back to Dashboard button */}
            <button
              onClick={handleBackToDashboard}
              className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700/50 text-gray-400 hover:text-gray-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <img
              src={cognaifySymbol}
              alt="Cognaify Solutions"
              className="h-10 object-contain"
            />
            <div className={`h-8 w-px ${isDark ? 'bg-slate-700/40' : 'bg-slate-300/60'}`}></div>
            <div className="flex flex-col">
              <h1 className={`text-lg font-semibold ${theme.textPrimary} leading-tight`}>
                CompliCheck<span className="bg-gradient-to-r from-sky-400 via-purple-500 to-orange-500 bg-clip-text text-transparent">AI</span><sup className={`text-[8px] ${theme.textMuted} ml-0.5`}>TM</sup>
              </h1>
              <span className={`text-xs ${theme.textMuted}`}>Document Compliance Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {file && (
              <div className="flex items-center gap-2">
                <span className={`text-sm ${theme.textSecondary}`}>
                  {file.name}
                </span>
                {currentDocument && currentProject && (
                  <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                    {currentProject.name}
                  </span>
                )}
              </div>
            )}
            {isUnsavedDoc && (
              <SaveToProjectDropdown
                onSave={handleSaveToProject}
                currentProject={currentProject}
              />
            )}
            {file && !parseResult && !isLoading && (
              <button
                onClick={handleProcess}
                disabled={!isPdfReady}
                className="px-4 py-2 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                style={{
                  background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                  boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
                  border: '1px solid rgba(191, 219, 254, 0.3)'
                }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Process
              </button>
            )}
            {isLoading && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-red-600/80 text-white rounded-full hover:bg-red-600 transition-colors flex items-center gap-2 border border-red-500/50"
              >
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Cancel</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className={`p-2 ${theme.textMuted} hover:${theme.textPrimary} transition-colors`}
              title="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
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
            <button
              onClick={() => setError(null)}
              className={`ml-auto ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - PDF Viewer + Annotation Panel */}
        <div className={`w-1/2 border-r ${theme.border} overflow-hidden flex flex-col`} style={{ background: theme.panelBg }}>
          {file ? (
            <>
              <div className="flex-1 overflow-hidden">
                <PDFViewer
                  file={file}
                  chunks={parseResult?.chunks || []}
                  selectedChunk={highlightedChunk}
                  onChunkClick={(chunk) => {
                    // When clicking directly on a chunk overlay, exit focus mode
                    setFocusMode(false);
                    handleChunkClick(chunk);
                  }}
                  onPdfReady={handlePdfReady}
                  targetPage={targetPage}
                  onPageChange={setCurrentPage}
                  annotations={annotations}
                  selectedAnnotation={selectedAnnotation}
                  showChunks={activeTab === 'parse' || activeTab === 'review' || activeTab === 'chat' || activeTab === 'compliance' || focusMode}
                  showAnnotations={activeTab === 'review' && !focusMode && showReviewOverlays}
                  visibleChunkTypes={visibleChunkTypes}
                  onToggleChunkType={(type) => {
                    setFocusMode(false); // Exit focus mode when toggling
                    setVisibleChunkTypes(prev => {
                      const next = new Set(prev);
                      if (next.has(type)) {
                        next.delete(type);
                      } else {
                        next.add(type);
                      }
                      return next;
                    });
                  }}
                  visibleNoteLevels={visibleNoteLevels}
                  onToggleNoteLevel={(level) => {
                    setFocusMode(false); // Exit focus mode when toggling
                    setVisibleNoteLevels(prev => {
                      const next = new Set(prev);
                      if (next.has(level)) {
                        next.delete(level);
                      } else {
                        next.add(level);
                      }
                      return next;
                    });
                  }}
                  onAnnotationClick={(annotation) => {
                    // Enter focus mode to show only this annotation
                    setFocusMode(true);
                    setSelectedAnnotation(annotation);
                    setHighlightedChunk(null); // Clear any highlighted chunk
                    // Navigate to the annotation's page
                    if (annotation.page_number) {
                      setTargetPage(annotation.page_number);
                    } else if (annotation.chunk_id) {
                      const linkedChunk = parseResult?.chunks?.find(c => c.id === annotation.chunk_id);
                      if (linkedChunk?.grounding) {
                        setTargetPage(linkedChunk.grounding.page + 1);
                      } else {
                        setTargetPage(1);
                      }
                    } else {
                      // Document or project level annotation - go to page 1
                      setTargetPage(1);
                    }
                  }}
                  showComponentsLegend={!focusMode}
                  showNotesLegend={!focusMode && activeTab === 'review'}
                  focusMode={focusMode}
                />
              </div>
              {/* Annotation Panel - below PDF */}
              <AnnotationPanel
                currentProject={currentProject}
                currentDocument={currentDocument}
                currentPage={currentPage}
                prefilledChunk={prefilledChunk}
                onClearPrefilledChunk={() => setPrefilledChunk(null)}
                onAnnotationClick={(annotation) => {
                  // Enter focus mode to show only this annotation (and its linked chunk if any)
                  setFocusMode(true);
                  setSelectedAnnotation(annotation);
                  setHighlightedChunk(null); // Clear highlighted chunk - focus mode filter will show linked chunk
                  // Navigate to the annotation's page
                  if (annotation.chunk_id) {
                    const linkedChunk = parseResult?.chunks?.find(c => c.id === annotation.chunk_id);
                    if (linkedChunk?.grounding) {
                      setTargetPage(linkedChunk.grounding.page + 1);
                    } else {
                      setTargetPage(1);
                    }
                  } else if (annotation.page_number) {
                    setTargetPage(annotation.page_number);
                  } else {
                    // Document or project level annotation - go to page 1
                    setTargetPage(1);
                  }
                }}
                onAnnotationsChange={loadAnnotations}
                file={file}
                chunks={parseResult?.chunks}
              />
            </>
          ) : (
            <label className={`h-full w-full flex flex-col items-center justify-center ${theme.textSubtle} cursor-pointer hover:opacity-80 transition-opacity`}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                onChange={handleFileInputChange}
                className="hidden"
              />
              <svg className="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className={`text-sm ${theme.textMuted}`}>Click to add a document</p>
              <p className={`text-xs mt-1 ${theme.textSubtle}`}>
                Will be saved to: <span className="font-medium">{currentProject?.name || defaultProject?.name || 'Personal'}</span>
              </p>
            </label>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="w-1/2 flex flex-col overflow-hidden" style={{ background: theme.panelBgAlt }}>
          <TabNavigation
            activeTab={activeTab}
            onTabChange={(tab) => {
              setFocusMode(false); // Exit focus mode when changing tabs
              setActiveTab(tab);
            }}
            disabled={!parseResult}
            onSettingsClick={() => setIsSettingsOpen(true)}
          />

          <div className="flex-1 overflow-auto">
            {activeTab === 'parse' && (
              <div className="p-4 h-full">
                <ParseResults
                  result={parseResult}
                  highlightedChunk={highlightedChunk}
                  popupChunk={popupChunk}
                  onPopupOpen={setPopupChunk}
                  onChunkSelect={(chunk) => {
                    setHighlightedChunk(highlightedChunk?.id === chunk.id ? null : chunk);
                    // Navigate to the chunk's page
                    if (chunk.grounding) {
                      setTargetPage(chunk.grounding.page + 1);
                    }
                  }}
                  isLoading={isLoading}
                  onAddNote={(chunk) => {
                    setPrefilledChunk(chunk);
                    // Navigate to chunk's page so annotation panel shows the right page
                    if (chunk.grounding) {
                      setTargetPage(chunk.grounding.page + 1);
                      setCurrentPage(chunk.grounding.page + 1);
                    }
                  }}
                  currentPage={currentPage}
                  documents={documents}
                  currentDocument={currentDocument}
                  onDocumentSelect={handleParseDocumentSelect}
                />
              </div>
            )}
            {activeTab === 'review' && (
              <ReviewTab
                currentProject={currentProject}
                currentDocument={currentDocument}
                currentPage={currentPage}
                onAnnotationSelect={(annotation) => {
                  // Enter focus mode to show only this annotation
                  setFocusMode(true);
                  setSelectedAnnotation(annotation);
                  setHighlightedChunk(null); // Clear - focus mode filter will show linked chunk if any

                  // Check if annotation is from a different document
                  if (annotation.document_id && annotation.document_id !== currentDocument?.id) {
                    // Switch to that document and navigate to the annotation
                    const chunkIds = annotation.chunk_id ? [annotation.chunk_id] : [];
                    handleSwitchDocumentAndHighlight(annotation.document_id, chunkIds, annotation.page_number || 1);
                  } else {
                    // Same document - navigate to page/chunk
                    if (annotation.chunk_id) {
                      const linkedChunk = parseResult?.chunks?.find(c => c.id === annotation.chunk_id);
                      if (linkedChunk?.grounding) {
                        setTargetPage(linkedChunk.grounding.page + 1);
                      } else {
                        // Chunk not found or no grounding, go to page 1
                        setTargetPage(1);
                      }
                    } else if (annotation.page_number) {
                      setTargetPage(annotation.page_number);
                    } else {
                      // Document or project level annotation - go to page 1
                      setTargetPage(1);
                    }
                  }
                }}
                file={file}
                chunks={parseResult?.chunks}
              />
            )}
            {activeTab === 'chat' && (
              <div className="p-4 h-full">
                <ChatPanel
                  markdown={parseResult?.markdown || ''}
                  chunks={parseResult?.chunks || []}
                  disabled={!parseResult}
                  messages={chatMessages}
                  onMessagesChange={setChatMessages}
                  selectedModel={selectedModel}
                  allDocuments={documents}
                  currentDocumentId={currentDocument?.id}
                  onLoadDocumentContext={async (docId: string) => {
                    const project = currentProject || defaultProject;
                    if (!project) return null;
                    try {
                      const cachedResponse = await getLatestParseResult(project.id, docId, selectedParser);
                      if (cachedResponse.cached && cachedResponse.result) {
                        return {
                          markdown: cachedResponse.result.markdown,
                          chunks: cachedResponse.result.chunks.map(c => ({
                            id: c.id,
                            markdown: c.markdown,
                            type: c.type,
                            grounding: c.grounding || null,
                          })),
                        };
                      }
                      return null;
                    } catch (err) {
                      console.error('Failed to load document context:', err);
                      return null;
                    }
                  }}
                  onChunkSelect={(chunkIds, pageNumber, documentId, chunkRef) => {
                    // Enable focus mode to show only the selected chunk
                    setFocusMode(true);
                    setSelectedAnnotation(null); // Clear any selected annotation
                    // If documentId provided and different from current, switch docs then highlight
                    if (documentId && documentId !== currentDocument?.id) {
                      handleSwitchDocumentAndHighlight(documentId, chunkIds, pageNumber, chunkRef);
                    } else {
                      // Highlight in current document - try ID match first, then page/bbox fallback
                      let chunk = parseResult?.chunks.find(c => chunkIds.includes(c.id));
                      if (!chunk && chunkRef?.page !== undefined && chunkRef.bbox && parseResult?.chunks) {
                        chunk = findChunkByPageAndBbox(parseResult.chunks, chunkRef.page, chunkRef.bbox);
                      }
                      if (chunk) {
                        setHighlightedChunk(chunk);
                        if (pageNumber) {
                          setTargetPage(pageNumber);
                        } else if (chunk.grounding) {
                          setTargetPage(chunk.grounding.page + 1);
                        }
                      } else if (chunkRef?.page !== undefined) {
                        // At least navigate to the page if we have page info
                        setTargetPage(chunkRef.page + 1);
                      }
                    }
                  }}
                />
              </div>
            )}
            {activeTab === 'compliance' && (
              <ComplianceTabV2
                project={currentProject}
                document={currentDocument}
                chunks={parseResult?.chunks}
                onChunkSelect={(chunkIds, pageNumber) => {
                  const chunk = parseResult?.chunks?.find(c => chunkIds.includes(c.id));
                  if (chunk) {
                    // Auto-enable the chunk type if it was hidden
                    if (!visibleChunkTypes.has(chunk.type)) {
                      setVisibleChunkTypes(prev => new Set([...prev, chunk.type]));
                    }
                    setHighlightedChunk(chunk);
                    // Navigate to page (use provided pageNumber or get from chunk's grounding)
                    if (pageNumber) {
                      setTargetPage(pageNumber);
                    } else if (chunk.grounding) {
                      setTargetPage(chunk.grounding.page + 1);
                    }
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className={`border-t ${theme.border} px-6 py-2 text-xs ${theme.textSubtle} flex items-center justify-between relative`} style={{ background: theme.footerBg }}>
        <span className="flex items-center gap-2">
          <span>CompliCheck<span className="bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent font-medium">AI</span><sup className="text-[6px]">TM</sup></span>
          <span>- powered by</span>
          <a href="https://cognaify.com" target="_blank" rel="noopener noreferrer" className="flex items-center">
            <img src={cognaifyLogo} alt="Cognaify Solutions" className="h-5 object-contain" />
          </a>
        </span>
        {parseResult && (
          <span className={theme.textMuted}>
            {parseResult.chunks.length} components extracted
            {parseResult.metadata.page_count && ` from ${parseResult.metadata.page_count} pages`}
          </span>
        )}
      </footer>

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        selectedParser={selectedParser}
        onParserChange={handleParserChange}
        completenessChecks={completenessChecks}
        complianceChecks={complianceChecks}
        onCompletenessChecksChange={setCompletenessChecks}
        onComplianceChecksChange={setComplianceChecks}
        chatUsage={chatMessages.reduce(
          (acc, msg) => {
            if (msg.usage) {
              return {
                input_tokens: acc.input_tokens + msg.usage.input_tokens,
                output_tokens: acc.output_tokens + msg.usage.output_tokens,
                model: msg.usage.model || acc.model,
              };
            }
            return acc;
          },
          { input_tokens: 0, output_tokens: 0, model: undefined as string | undefined }
        )}
        complianceUsage={undefined}
        parseCredits={parseResult?.metadata.credit_usage}
        parseUsage={parseResult?.metadata.usage}
        currentProject={currentProject}
      />
    </div>
  );
}

export default App;

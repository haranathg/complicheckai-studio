import { useState, useRef, useEffect } from 'react';
import PDFViewer from './components/PDFViewer';
import TabNavigation from './components/TabNavigation';
import ParseResults from './components/ParseResults';
import ChatPanel from './components/ChatPanel';
import CompliancePanel from './components/CompliancePanel';
import SettingsPanel from './components/SettingsPanel';
import UploadTab from './components/UploadTab';
import ReviewTab from './components/ReviewTab';
import type { Project, Document } from './types/project';
import SaveToProjectDropdown from './components/SaveToProjectDropdown';
import LoginPage from './components/LoginPage';
import type { ParseResponse, Chunk, TabType, ChatMessage } from './types/ade';
import type { ComplianceReport, ComplianceCheck } from './types/compliance';
import { API_URL } from './config';
import { isAuthenticated, logout } from './utils/auth';
import { getDefaultModelForParser } from './components/ModelSelector';
import { getParserType, getModelForParser } from './components/ParserSelector';
import { uploadDocument, checkProjectsAvailable, getOrCreateDefaultProject } from './services/projectService';
import { useTheme, getThemeStyles } from './contexts/ThemeContext';
import cognaifyLogo from './assets/Cognaify-logo-white-bg.png';
import cognaifySymbol from './assets/cognaify-symbol.png';
import complianceConfig from './config/complianceChecks.json';

// Default model (for chat/compliance) and parser
const DEFAULT_MODEL = 'bedrock-claude-sonnet-3.5';
const DEFAULT_PARSER = 'landing_ai';

function App() {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<Chunk | null>(null);
  const [popupChunk, setPopupChunk] = useState<Chunk | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);
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
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if projects are available and get default project on mount
  useEffect(() => {
    const init = async () => {
      const available = await checkProjectsAvailable();
      setProjectsAvailable(available);
      if (available) {
        const defProject = await getOrCreateDefaultProject();
        setDefaultProject(defProject);
      }
    };
    init();
  }, []);

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
    setComplianceReport(null);
    setTargetPage(undefined);
    setChatMessages([]);
  };

  const handleClearDocument = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(null);
    setParseResult(null);
    setHighlightedChunk(null);
    setPopupChunk(null);
    setIsPdfReady(false);
    setIsLoading(false);
    setError(null);
    setComplianceReport(null);
    setTargetPage(undefined);
    setChatMessages([]);
    setCurrentDocument(null);
  };

  const handlePdfReady = () => {
    setIsPdfReady(true);
  };

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

  // Check if current doc is unsaved (has file but no document record)
  const isUnsavedDoc = file && !currentDocument && projectsAvailable;

  return (
    <div className="h-screen flex flex-col" style={{ background: theme.pageBg }}>
      {/* Header */}
      <header className={`border-b ${theme.border} px-6 py-3`} style={{ background: theme.headerBg, backdropFilter: 'blur(8px)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
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
              onClick={() => setIsSettingsOpen(true)}
              className={`p-2 ${theme.textMuted} hover:${theme.textPrimary} transition-colors`}
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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
        {/* Left Panel - PDF Viewer */}
        <div className={`w-1/2 border-r ${theme.border} overflow-hidden`} style={{ background: theme.panelBg }}>
          {file ? (
            <PDFViewer
              file={file}
              chunks={parseResult?.chunks || []}
              selectedChunk={highlightedChunk}
              onChunkClick={handleChunkClick}
              onPdfReady={handlePdfReady}
              targetPage={targetPage}
              onPageChange={setCurrentPage}
            />
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
            onTabChange={setActiveTab}
            disabled={!parseResult}
          />

          <div className="flex-1 overflow-auto">
            {activeTab === 'upload' && (
              <UploadTab
                onDocumentLoad={handleFileSelect}
                onClearDocument={handleClearDocument}
                isProcessing={isLoading}
                selectedParser={selectedParser}
                selectedModel={selectedModel}
                onProjectChange={setCurrentProject}
                onDocumentChange={setCurrentDocument}
                currentProject={currentProject}
                currentDocument={currentDocument}
              />
            )}
            {activeTab === 'parse' && (
              <div className="p-4">
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
                />
              </div>
            )}
            {activeTab === 'review' && (
              <ReviewTab
                currentProject={currentProject}
                currentDocument={currentDocument}
                currentPage={currentPage}
                onAnnotationSelect={(annotation) => {
                  if (annotation.page_number) {
                    setTargetPage(annotation.page_number);
                    setCurrentPage(annotation.page_number);
                  }
                }}
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
                  onChunkSelect={(chunkIds, pageNumber) => {
                    const chunk = parseResult?.chunks.find(c => chunkIds.includes(c.id));
                    if (chunk) {
                      setHighlightedChunk(chunk);
                      if (pageNumber) {
                        setTargetPage(pageNumber);
                      }
                    }
                  }}
                />
              </div>
            )}
            {activeTab === 'compliance' && (
              <div className="p-4 h-full">
                <CompliancePanel
                  markdown={parseResult?.markdown || ''}
                  chunks={parseResult?.chunks || []}
                  disabled={!parseResult}
                  report={complianceReport}
                  onReportChange={setComplianceReport}
                  selectedModel={selectedModel}
                  completenessChecks={completenessChecks}
                  complianceChecks={complianceChecks}
                  onChunkSelect={(chunkIds, pageNumber) => {
                    const chunk = parseResult?.chunks.find(c => chunkIds.includes(c.id));
                    if (chunk) {
                      setHighlightedChunk(chunk);
                      if (pageNumber) {
                        setTargetPage(pageNumber);
                      }
                    }
                  }}
                />
              </div>
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
        complianceUsage={complianceReport?.usage ? {
          input_tokens: complianceReport.usage.input_tokens,
          output_tokens: complianceReport.usage.output_tokens,
          model: complianceReport.usage.model,
        } : undefined}
        parseCredits={parseResult?.metadata.credit_usage}
        parseUsage={parseResult?.metadata.usage}
        currentProject={currentProject}
      />
    </div>
  );
}

export default App;

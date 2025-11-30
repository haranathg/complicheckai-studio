import { useState, useRef } from 'react';
import FileUpload from './components/FileUpload';
import PDFViewer from './components/PDFViewer';
import TabNavigation from './components/TabNavigation';
import ParseResults from './components/ParseResults';
import ExtractPanel from './components/ExtractPanel';
import ChatPanel from './components/ChatPanel';
import CompliancePanel from './components/CompliancePanel';
import ComplianceChecksManager from './components/ComplianceChecksManager';
import LoginPage from './components/LoginPage';
import type { ParseResponse, Chunk, TabType, ChatMessage } from './types/ade';
import type { ComplianceReport, ComplianceCheck } from './types/compliance';
import { API_URL } from './config';
import { isAuthenticated, logout } from './utils/auth';
import bundabergLogo from './assets/bundaberg.jpeg';
import complianceConfig from './config/complianceChecks.json';

// Default model and parser
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_PARSER = 'landing_ai';

function App() {
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null);
  const [highlightedChunk, setHighlightedChunk] = useState<Chunk | null>(null);
  const [popupChunk, setPopupChunk] = useState<Chunk | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('parse');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complianceReport, setComplianceReport] = useState<ComplianceReport | null>(null);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
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
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileSelect = (uploadedFile: File) => {
    // Cancel any ongoing processing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setFile(uploadedFile);
    setError(null);
    setParseResult(null);
    setHighlightedChunk(null);
    setPopupChunk(null);
    setIsPdfReady(false);
    setIsLoading(false);
    setComplianceReport(null);
    setTargetPage(undefined);
    setChatMessages([]);
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
    formData.append('parser', selectedParser);
    if (selectedParser === 'claude_vision') {
      formData.append('model', selectedModel);
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

  // Show login page if not authenticated
  if (!authenticated) {
    return <LoginPage onAuthenticated={() => setAuthenticated(true)} />;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={bundabergLogo}
              alt="Bundaberg Logo"
              className="w-[100px] h-[100px] object-contain rounded"
            />
            <div className="flex flex-col">
              <span className="text-xl font-semibold text-gray-700 leading-tight">Doc Scan Studio</span>
              <h1 className="text-sm font-bold text-gray-800 leading-tight">
                CompliCheck<span className="text-green-600">AI</span><span className="text-[10px] align-super">™</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {file && (
              <span className="text-sm text-gray-500">
                {file.name}
              </span>
            )}
            <FileUpload onUpload={handleFileSelect} isLoading={isLoading} />
            {file && !parseResult && !isLoading && (
              <button
                onClick={handleProcess}
                disabled={!isPdfReady}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Cancel</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Logout"
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
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="flex items-center gap-2 text-red-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
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
        <div className="w-1/2 border-r bg-gray-50 overflow-hidden">
          {file ? (
            <PDFViewer
              file={file}
              chunks={parseResult?.chunks || []}
              selectedChunk={highlightedChunk}
              onChunkClick={handleChunkClick}
              onPdfReady={handlePdfReady}
              targetPage={targetPage}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <svg className="w-20 h-20 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-lg font-medium mb-2">Upload a document</p>
              <p className="text-sm">Supported formats: PDF, PNG, JPG, TIFF, BMP</p>
            </div>
          )}
        </div>

        {/* Right Panel - Results */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            disabled={!parseResult}
          />

          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'parse' && (
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
            )}
            {activeTab === 'extract' && (
              <ExtractPanel
                markdown={parseResult?.markdown || ''}
                disabled={!parseResult}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                selectedParser={selectedParser}
                onParserChange={setSelectedParser}
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
              />
            )}
            {activeTab === 'checks' && (
              <div className="h-full">
                <ComplianceChecksManager
                  completenessChecks={completenessChecks}
                  complianceChecks={complianceChecks}
                  onCompletenessChecksChange={setCompletenessChecks}
                  onComplianceChecksChange={setComplianceChecks}
                />
              </div>
            )}
            {activeTab === 'chat' && (
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
            )}
            {activeTab === 'compliance' && (
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
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t px-6 py-2 text-xs text-gray-500 flex items-center justify-between">
        <span>Powered by CompliCheck<span className="text-green-600 font-medium">AI</span>™ from UrbanCompass</span>
        {parseResult && (
          <span>
            {parseResult.chunks.length} components extracted
            {parseResult.metadata.page_count && ` from ${parseResult.metadata.page_count} pages`}
          </span>
        )}
      </footer>
    </div>
  );
}

export default App;

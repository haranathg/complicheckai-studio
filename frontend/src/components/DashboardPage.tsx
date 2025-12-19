/**
 * Dashboard Page - Full page showing all projects with document status summaries
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import type { Project, DocumentStatusSummary } from '../types/project';
import { listProjects, getProjectDocumentStatus, uploadDocument, createProject } from '../services/projectService';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import cognaifySymbol from '../assets/cognaify-symbol.png';
import cognaifyLogo from '../assets/Cognaify-logo-white-bg.png';

interface DashboardPageProps {
  onOpenDocument: (project: Project, documentId: string) => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}

export default function DashboardPage({
  onOpenDocument,
  onLogout,
  onOpenSettings,
}: DashboardPageProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<DocumentStatusSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setIsLoading(true);
        const response = await listProjects();
        setProjects(response.projects);
        // Auto-select first project if available
        if (response.projects.length > 0 && !selectedProject) {
          setSelectedProject(response.projects[0]);
        }
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError('Failed to load projects');
      } finally {
        setIsLoading(false);
      }
    };
    loadProjects();
  }, []);

  // Load documents when selected project changes
  const loadDocuments = useCallback(async () => {
    if (!selectedProject) {
      setDocuments([]);
      return;
    }
    try {
      setIsLoadingDocs(true);
      const response = await getProjectDocumentStatus(selectedProject.id);
      setDocuments(response.documents);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setDocuments([]);
    } finally {
      setIsLoadingDocs(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;

    try {
      setIsUploading(true);
      await uploadDocument(selectedProject.id, file);
      // Reload documents after upload
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

  // Format file size
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
      <header className={`border-b ${theme.border} px-6 py-3`} style={{ background: theme.headerBg, backdropFilter: 'blur(8px)' }}>
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
            <button
              onClick={onOpenSettings}
              className={`p-2 ${theme.textMuted} hover:${theme.textPrimary} transition-colors`}
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={onLogout}
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
                <div>
                  <h2 className={`text-xl font-semibold ${theme.textPrimary}`}>{selectedProject.name}</h2>
                  <p className={`text-sm ${theme.textMuted}`}>
                    {documents.length} document{documents.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
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
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Document</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Uploaded</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Processed</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Comments</th>
                      <th className={`text-left px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Last Activity</th>
                      <th className={`text-right px-4 py-3 text-sm font-medium ${theme.textMuted}`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className={`border-b last:border-0 ${theme.border} transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}
                        onClick={() => selectedProject && onOpenDocument(selectedProject, doc.id)}
                      >
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
                        <td className={`px-4 py-3 text-sm ${theme.textSecondary}`}>
                          {formatDate(doc.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          {doc.processed_at ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                                Processed
                              </span>
                              <span className={`text-xs ${theme.textSubtle}`}>
                                {doc.parser}
                              </span>
                            </div>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                              Pending
                            </span>
                          )}
                        </td>
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
                        <td className="px-4 py-3">
                          {doc.annotations.last_updated_at ? (
                            <div>
                              <p className={`text-sm ${theme.textSecondary}`}>
                                {formatDate(doc.annotations.last_updated_at)}
                              </p>
                              {doc.annotations.last_comment_preview && (
                                <p className={`text-xs ${theme.textSubtle} truncate max-w-[200px]`}>
                                  {doc.annotations.last_comment_preview}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className={`text-sm ${theme.textSubtle}`}>-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              selectedProject && onOpenDocument(selectedProject, doc.id);
                            }}
                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${isDark ? 'text-sky-400 hover:bg-sky-500/20' : 'text-sky-600 hover:bg-sky-50'}`}
                          >
                            Open
                          </button>
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
    </div>
  );
}

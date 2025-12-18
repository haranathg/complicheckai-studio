import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project, Document } from '../types/project';
import { listDocuments, deleteDocument } from '../services/projectService';

interface DocumentListProps {
  project: Project;
  selectedDocument: Document | null;
  onDocumentSelect: (doc: Document | null) => void;
  onDocumentsChange?: () => void;
}

export default function DocumentList({
  project,
  selectedDocument,
  onDocumentSelect,
  onDocumentsChange,
}: DocumentListProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load documents when project changes
  useEffect(() => {
    loadDocuments();
  }, [project.id]);

  const loadDocuments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listDocuments(project.id);
      setDocuments(response.documents);
    } catch (err) {
      setError('Failed to load documents');
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDocument = async (e: React.MouseEvent, doc: Document) => {
    e.stopPropagation();
    if (!confirm(`Delete "${doc.original_filename}"?`)) return;

    try {
      await deleteDocument(project.id, doc.id);
      const updatedDocs = documents.filter(d => d.id !== doc.id);
      setDocuments(updatedDocs);
      if (selectedDocument?.id === doc.id) {
        onDocumentSelect(null);
      }
      onDocumentsChange?.();
    } catch (err) {
      setError('Failed to delete document');
      console.error('Failed to delete document:', err);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center py-8 ${theme.textSubtle}`}>
        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading documents...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 ${theme.textSubtle}`}>
        <p className="text-red-400 mb-2">{error}</p>
        <button
          onClick={loadDocuments}
          className={`text-sm ${theme.textMuted} hover:${theme.textSecondary} underline`}
        >
          Try again
        </button>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className={`text-center py-8 ${theme.textSubtle}`}>
        <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm">No documents in this project yet.</p>
        <p className="text-xs mt-1">Upload a document to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`text-xs ${theme.textSubtle} px-2 py-1 flex items-center justify-between`}>
        <span>{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
        <button
          onClick={loadDocuments}
          className={`${theme.textMuted} hover:${theme.textSecondary} transition-colors`}
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {documents.map((doc) => (
        <div
          key={doc.id}
          onClick={() => onDocumentSelect(doc)}
          className={`flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-colors group ${
            selectedDocument?.id === doc.id
              ? isDark ? 'bg-sky-900/30 border border-sky-500/30' : 'bg-sky-50 border border-sky-200'
              : `${theme.buttonHover} border border-transparent`
          }`}
        >
          {/* File icon */}
          <div className={`flex-shrink-0 mt-0.5 ${selectedDocument?.id === doc.id ? 'text-sky-400' : theme.textMuted}`}>
            {doc.content_type?.includes('pdf') ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            )}
          </div>

          {/* Document info */}
          <div className="flex-1 min-w-0">
            <div className={`text-sm ${theme.textSecondary} truncate`} title={doc.original_filename}>
              {doc.original_filename}
            </div>
            <div className={`flex items-center gap-2 text-xs ${theme.textSubtle}`}>
              {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
              {doc.page_count && <span>{doc.page_count} pg</span>}
              <span>{formatDate(doc.created_at)}</span>
            </div>
            {/* Parse status */}
            {doc.has_cached_result && (
              <div className="flex items-center gap-1 mt-1">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Cached
                </span>
                {doc.latest_parser && (
                  <span className={`text-xs ${theme.textSubtle}`}>
                    {doc.latest_parser.replace('_', ' ')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Delete button */}
          <button
            onClick={(e) => handleDeleteDocument(e, doc)}
            className={`p-1 rounded opacity-0 group-hover:opacity-100 ${theme.buttonHover} text-red-400 hover:text-red-300 transition-all flex-shrink-0`}
            title="Delete document"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

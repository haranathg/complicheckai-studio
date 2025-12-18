import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ProjectSelector from './ProjectSelector';
import DocumentList from './DocumentList';
import type { Project, Document } from '../types/project';
import type { ParseResponse } from '../types/ade';
import {
  uploadDocument,
  getLatestParseResult,
  getDocumentDownloadUrl,
  checkProjectsAvailable,
} from '../services/projectService';

interface ProjectDocumentPanelProps {
  onDocumentLoad: (file: File, cachedResult?: ParseResponse) => void;
  onClearDocument: () => void;
  isLoading: boolean;
  selectedParser: string;
}

export default function ProjectDocumentPanel({
  onDocumentLoad,
  onClearDocument,
  isLoading,
  selectedParser,
}: ProjectDocumentPanelProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingCached, setIsFetchingCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Check if projects feature is available
  useEffect(() => {
    checkProjectsAvailable().then(setIsAvailable);
  }, []);

  // When a document is selected, try to load its cached result
  const handleDocumentSelect = useCallback(async (doc: Document | null) => {
    setSelectedDocument(doc);
    setError(null);

    if (!doc || !selectedProject) {
      return;
    }

    setIsFetchingCached(true);

    try {
      // First, get the document file URL
      const fileUrl = await getDocumentDownloadUrl(selectedProject.id, doc.id);

      // Fetch the file
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const file = new File([blob], doc.original_filename, {
        type: doc.content_type || 'application/pdf',
      });

      // Check for cached parse result
      const cachedResponse = await getLatestParseResult(
        selectedProject.id,
        doc.id,
        selectedParser
      );

      if (cachedResponse.cached && cachedResponse.result) {
        // Convert to ParseResponse format
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
        // No cached result, just load the file
        onDocumentLoad(file);
      }
    } catch (err) {
      console.error('Failed to load document:', err);
      setError('Failed to load document');
    } finally {
      setIsFetchingCached(false);
    }
  }, [selectedProject, selectedParser, onDocumentLoad]);

  // Handle file upload to project
  const handleUploadToProject = async (file: File) => {
    if (!selectedProject) {
      // No project selected, just use the file directly without saving
      onDocumentLoad(file);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const doc = await uploadDocument(selectedProject.id, file);
      setSelectedDocument(doc);
      setRefreshKey(prev => prev + 1); // Refresh document list
      onDocumentLoad(file);
    } catch (err) {
      console.error('Failed to upload document:', err);
      setError('Failed to upload document');
      // Still load the file locally even if upload fails
      onDocumentLoad(file);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle project change
  const handleProjectChange = (project: Project | null) => {
    setSelectedProject(project);
    setSelectedDocument(null);
    onClearDocument();
  };

  // If feature is not available, return null
  if (isAvailable === false) {
    return null;
  }

  // Loading state
  if (isAvailable === null) {
    return (
      <div className={`p-3 border-b ${theme.border}`}>
        <div className={`flex items-center gap-2 ${theme.textSubtle} text-sm`}>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Checking project storage...
        </div>
      </div>
    );
  }

  return (
    <div className={`border-b ${theme.border}`}>
      {/* Project selector header */}
      <div className={`flex items-center gap-3 px-4 py-2 border-b ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.4)' : 'rgba(248, 250, 252, 0.8)' }}>
        <ProjectSelector
          selectedProject={selectedProject}
          onProjectChange={handleProjectChange}
          disabled={isLoading || isUploading || isFetchingCached}
        />

        {selectedProject && (
          <label className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors ${
            isUploading ? 'opacity-50 cursor-not-allowed' : ''
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
                if (file) handleUploadToProject(file);
                e.target.value = ''; // Reset input
              }}
              disabled={isUploading || isLoading || isFetchingCached}
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
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className={`px-4 py-2 text-sm text-red-400 ${isDark ? 'bg-red-900/20' : 'bg-red-50'}`}>
          {error}
        </div>
      )}

      {/* Document list */}
      {selectedProject && (
        <div className="px-2 py-2 max-h-48 overflow-y-auto" style={{ background: isDark ? 'rgba(2, 6, 23, 0.3)' : 'rgba(248, 250, 252, 0.5)' }}>
          <DocumentList
            key={`${selectedProject.id}-${refreshKey}`}
            project={selectedProject}
            selectedDocument={selectedDocument}
            onDocumentSelect={handleDocumentSelect}
            onDocumentsChange={() => setRefreshKey(prev => prev + 1)}
          />
        </div>
      )}

      {/* Loading cached result indicator */}
      {isFetchingCached && (
        <div className={`px-4 py-2 flex items-center gap-2 text-sm ${theme.textSubtle} border-t ${theme.border}`}>
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading document...
        </div>
      )}

      {/* Info when no project selected */}
      {!selectedProject && (
        <div className={`px-4 py-3 text-xs ${theme.textSubtle}`}>
          Select a project to save and organize your documents, or upload directly without a project.
        </div>
      )}
    </div>
  );
}

// Export types for use in App.tsx
export type { Project, Document };

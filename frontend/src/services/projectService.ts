/**
 * API service for project and document management
 */
import { API_URL } from '../config';
import type {
  Project,
  ProjectListResponse,
  Document,
  DocumentListResponse,
  CachedParseResponse,
  ProjectUsageResponse,
  DocumentStatusListResponse
} from '../types/project';

/**
 * List all projects
 */
export async function listProjects(): Promise<ProjectListResponse> {
  const response = await fetch(`${API_URL}/api/projects`);
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  return response.json();
}

/**
 * Create a new project
 */
export async function createProject(name: string, description?: string): Promise<Project> {
  const response = await fetch(`${API_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description }),
  });
  if (!response.ok) {
    throw new Error('Failed to create project');
  }
  return response.json();
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }
}

/**
 * List documents in a project
 */
export async function listDocuments(projectId: string): Promise<DocumentListResponse> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/documents`);
  if (!response.ok) {
    throw new Error('Failed to fetch documents');
  }
  return response.json();
}

/**
 * Duplicate check response type
 */
export interface DuplicateCheckResponse {
  is_duplicate: boolean;
  existing_document?: Document;
  duplicate_type?: 'exact' | 'filename';
  message?: string;
}

/**
 * Check if a document would be a duplicate before uploading
 */
export async function checkDuplicateDocument(
  projectId: string,
  file: File
): Promise<DuplicateCheckResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/projects/${projectId}/documents/check-duplicate`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to check for duplicates');
  }
  return response.json();
}

/**
 * Upload a document to a project
 */
export async function uploadDocument(
  projectId: string,
  file: File,
  replaceExisting: boolean = false
): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);

  const url = new URL(`${API_URL}/api/projects/${projectId}/documents`);
  if (replaceExisting) {
    url.searchParams.set('replace_existing', 'true');
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    // Handle conflict error specially
    if (response.status === 409 && error.detail) {
      const err = new Error(error.detail.message || 'File already exists') as Error & {
        isConflict: boolean;
        existingDocumentId: string;
        uploadedAt: string;
      };
      err.isConflict = true;
      err.existingDocumentId = error.detail.existing_document_id;
      err.uploadedAt = error.detail.uploaded_at;
      throw err;
    }
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Failed to upload document');
  }
  return response.json();
}

/**
 * Delete a document
 */
export async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/documents/${documentId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete document');
  }
}

/**
 * Get the download URL for a document (returns the backend proxy URL, not S3 directly)
 */
export async function getDocumentDownloadUrl(projectId: string, documentId: string): Promise<string> {
  // Use the /file endpoint which proxies through the backend to avoid CORS issues
  return `${API_URL}/api/projects/${projectId}/documents/${documentId}/file`;
}

/**
 * Get the latest cached parse result for a document
 */
export async function getLatestParseResult(
  projectId: string,
  documentId: string,
  parser?: string
): Promise<CachedParseResponse> {
  const url = new URL(`${API_URL}/api/projects/${projectId}/documents/${documentId}/latest-parse`);
  if (parser) {
    url.searchParams.set('parser', parser);
  }
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch parse result');
  }
  return response.json();
}

/**
 * Check if projects feature is available (backend has DB configured)
 */
export async function checkProjectsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return data.database_configured === true;
  } catch {
    return false;
  }
}

const DEFAULT_PROJECT_NAME = 'Personal';

/**
 * Get the default "Personal" project, creating it if it doesn't exist
 */
export async function getOrCreateDefaultProject(): Promise<Project | null> {
  try {
    const { projects } = await listProjects();
    let defaultProject = projects.find(p => p.name === DEFAULT_PROJECT_NAME);

    if (!defaultProject) {
      defaultProject = await createProject(DEFAULT_PROJECT_NAME, 'Default project for personal documents');
    }

    return defaultProject;
  } catch {
    return null;
  }
}

/**
 * Get usage statistics for a project
 */
export async function getProjectUsage(projectId: string): Promise<ProjectUsageResponse> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/usage`);
  if (!response.ok) {
    throw new Error('Failed to fetch project usage');
  }
  return response.json();
}

/**
 * Get document status summaries for a project (for dashboard)
 */
export async function getProjectDocumentStatus(projectId: string): Promise<DocumentStatusListResponse> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/documents/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch document status');
  }
  return response.json();
}

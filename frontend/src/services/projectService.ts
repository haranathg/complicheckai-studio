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
  ProjectUsageResponse
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
 * Upload a document to a project
 */
export async function uploadDocument(projectId: string, file: File): Promise<Document> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/api/projects/${projectId}/documents`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to upload document');
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

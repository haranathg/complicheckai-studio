/**
 * API service for project and document management
 * Uses authenticated API client with Bearer token
 */
import { apiGet, apiPost, apiPatch, apiDelete, apiUpload, API_URL } from './apiClient';
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
  return apiGet<ProjectListResponse>('/api/projects');
}

/**
 * Create a new project
 */
export async function createProject(name: string, description?: string): Promise<Project> {
  return apiPost<Project>('/api/projects', { name, description });
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  return apiDelete(`/api/projects/${projectId}`);
}

/**
 * List documents in a project
 */
export async function listDocuments(projectId: string): Promise<DocumentListResponse> {
  return apiGet<DocumentListResponse>(`/api/projects/${projectId}/documents`);
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

  return apiUpload<DuplicateCheckResponse>(
    `/api/projects/${projectId}/documents/check-duplicate`,
    formData
  );
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

  const url = replaceExisting
    ? `/api/projects/${projectId}/documents?replace_existing=true`
    : `/api/projects/${projectId}/documents`;

  return apiUpload<Document>(url, formData);
}

/**
 * Delete a document
 */
export async function deleteDocument(projectId: string, documentId: string): Promise<void> {
  return apiDelete(`/api/projects/${projectId}/documents/${documentId}`);
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
  const url = parser
    ? `/api/projects/${projectId}/documents/${documentId}/latest-parse?parser=${parser}`
    : `/api/projects/${projectId}/documents/${documentId}/latest-parse`;
  return apiGet<CachedParseResponse>(url);
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
  return apiGet<ProjectUsageResponse>(`/api/projects/${projectId}/usage`);
}

/**
 * Get document status summaries for a project (for dashboard)
 */
export async function getProjectDocumentStatus(projectId: string): Promise<DocumentStatusListResponse> {
  const url = `/api/projects/${projectId}/documents/status`;
  console.log('[getProjectDocumentStatus] Fetching:', url);
  const data = await apiGet<DocumentStatusListResponse>(url);
  console.log('[getProjectDocumentStatus] Response data:', JSON.stringify(data).slice(0, 200));
  return data;
}

/**
 * Update the review status of a document
 */
export async function updateDocumentReview(
  projectId: string,
  documentId: string,
  reviewStatus: 'not_reviewed' | 'needs_info' | 'ok'
): Promise<{ status: string; review_status: string }> {
  return apiPatch(`/api/projects/${projectId}/documents/${documentId}/review`, {
    review_status: reviewStatus,
  });
}

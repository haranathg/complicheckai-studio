/**
 * API service for document annotations
 * Uses authenticated API client with Bearer token
 */
import { apiGet, apiPost, apiPatch, apiDelete } from './apiClient';
import type {
  Annotation,
  AnnotationCreate,
  AnnotationUpdate,
  AnnotationListResponse,
} from '../types/annotation';

/**
 * Create a new annotation in a project
 */
export async function createAnnotation(
  projectId: string,
  annotation: AnnotationCreate
): Promise<Annotation> {
  return apiPost<Annotation>(`/api/projects/${projectId}/annotations`, annotation);
}

/**
 * List annotations in a project with optional filters
 */
export async function listProjectAnnotations(
  projectId: string,
  options?: {
    level?: string;
    status?: string;
    document_id?: string;
    skip?: number;
    limit?: number;
  }
): Promise<AnnotationListResponse> {
  const params = new URLSearchParams();
  if (options?.level) params.set('level', options.level);
  if (options?.status) params.set('status', options.status);
  if (options?.document_id) params.set('document_id', options.document_id);
  if (options?.skip) params.set('skip', String(options.skip));
  if (options?.limit) params.set('limit', String(options.limit));

  const queryString = params.toString();
  const url = `/api/projects/${projectId}/annotations${queryString ? `?${queryString}` : ''}`;
  return apiGet<AnnotationListResponse>(url);
}

/**
 * List annotations for a specific document
 */
export async function listDocumentAnnotations(
  projectId: string,
  documentId: string,
  options?: {
    level?: string;
    status?: string;
    page_number?: number;
  }
): Promise<AnnotationListResponse> {
  const params = new URLSearchParams();
  if (options?.level) params.set('level', options.level);
  if (options?.status) params.set('status', options.status);
  if (options?.page_number !== undefined) params.set('page_number', String(options.page_number));

  const queryString = params.toString();
  const url = `/api/projects/${projectId}/documents/${documentId}/annotations${queryString ? `?${queryString}` : ''}`;
  return apiGet<AnnotationListResponse>(url);
}

/**
 * Get a specific annotation
 */
export async function getAnnotation(annotationId: string): Promise<Annotation> {
  return apiGet<Annotation>(`/api/projects/annotations/${annotationId}`);
}

/**
 * Update an annotation
 */
export async function updateAnnotation(
  annotationId: string,
  update: AnnotationUpdate
): Promise<Annotation> {
  return apiPatch<Annotation>(`/api/projects/annotations/${annotationId}`, update);
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(annotationId: string): Promise<void> {
  return apiDelete(`/api/projects/annotations/${annotationId}`);
}

/**
 * Mark an annotation as resolved
 */
export async function resolveAnnotation(annotationId: string): Promise<Annotation> {
  return apiPost<Annotation>(`/api/projects/annotations/${annotationId}/resolve`);
}

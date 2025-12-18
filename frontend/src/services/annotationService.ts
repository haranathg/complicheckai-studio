/**
 * API service for document annotations
 */
import { API_URL } from '../config';
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
  const response = await fetch(`${API_URL}/api/projects/${projectId}/annotations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(annotation),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create annotation' }));
    throw new Error(error.detail || 'Failed to create annotation');
  }
  return response.json();
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
  const url = new URL(`${API_URL}/api/projects/${projectId}/annotations`);
  if (options?.level) url.searchParams.set('level', options.level);
  if (options?.status) url.searchParams.set('status', options.status);
  if (options?.document_id) url.searchParams.set('document_id', options.document_id);
  if (options?.skip) url.searchParams.set('skip', String(options.skip));
  if (options?.limit) url.searchParams.set('limit', String(options.limit));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch annotations');
  }
  return response.json();
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
  const url = new URL(`${API_URL}/api/projects/${projectId}/documents/${documentId}/annotations`);
  if (options?.level) url.searchParams.set('level', options.level);
  if (options?.status) url.searchParams.set('status', options.status);
  if (options?.page_number !== undefined) url.searchParams.set('page_number', String(options.page_number));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch document annotations');
  }
  return response.json();
}

/**
 * Get a specific annotation
 */
export async function getAnnotation(annotationId: string): Promise<Annotation> {
  const response = await fetch(`${API_URL}/api/projects/annotations/${annotationId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch annotation');
  }
  return response.json();
}

/**
 * Update an annotation
 */
export async function updateAnnotation(
  annotationId: string,
  update: AnnotationUpdate
): Promise<Annotation> {
  const response = await fetch(`${API_URL}/api/projects/annotations/${annotationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(update),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update annotation' }));
    throw new Error(error.detail || 'Failed to update annotation');
  }
  return response.json();
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(annotationId: string): Promise<void> {
  const response = await fetch(`${API_URL}/api/projects/annotations/${annotationId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete annotation');
  }
}

/**
 * Mark an annotation as resolved
 */
export async function resolveAnnotation(annotationId: string): Promise<Annotation> {
  const response = await fetch(`${API_URL}/api/projects/annotations/${annotationId}/resolve`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to resolve annotation');
  }
  return response.json();
}

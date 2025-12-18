/**
 * API service for batch document processing
 */
import { API_URL } from '../config';
import type {
  BatchJob,
  BatchJobListResponse,
  BatchProcessRequest,
} from '../types/batch';

/**
 * Start a batch processing job for documents in a project
 */
export async function startBatchProcess(
  projectId: string,
  request: BatchProcessRequest
): Promise<BatchJob> {
  const response = await fetch(`${API_URL}/api/projects/${projectId}/batch/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to start batch processing' }));
    throw new Error(error.detail || 'Failed to start batch processing');
  }
  return response.json();
}

/**
 * List batch jobs for a project
 */
export async function listBatchJobs(
  projectId: string,
  options?: {
    status?: string;
    skip?: number;
    limit?: number;
  }
): Promise<BatchJobListResponse> {
  const url = new URL(`${API_URL}/api/projects/${projectId}/batch/jobs`);
  if (options?.status) url.searchParams.set('status', options.status);
  if (options?.skip) url.searchParams.set('skip', String(options.skip));
  if (options?.limit) url.searchParams.set('limit', String(options.limit));

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Failed to fetch batch jobs');
  }
  return response.json();
}

/**
 * Get a batch job with all its tasks
 */
export async function getBatchJob(jobId: string): Promise<BatchJob> {
  const response = await fetch(`${API_URL}/api/projects/batch/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error('Failed to fetch batch job');
  }
  return response.json();
}

/**
 * Cancel a batch job
 */
export async function cancelBatchJob(jobId: string): Promise<BatchJob> {
  const response = await fetch(`${API_URL}/api/projects/batch/jobs/${jobId}/cancel`, {
    method: 'POST',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to cancel batch job' }));
    throw new Error(error.detail || 'Failed to cancel batch job');
  }
  return response.json();
}

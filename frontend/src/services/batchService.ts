/**
 * API service for batch document processing
 * Uses authenticated API client with Bearer token
 */
import { apiGet, apiPost } from './apiClient';
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
  return apiPost<BatchJob>(`/api/projects/${projectId}/batch/process`, request);
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
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.skip) params.set('skip', String(options.skip));
  if (options?.limit) params.set('limit', String(options.limit));

  const queryString = params.toString();
  const url = `/api/projects/${projectId}/batch/jobs${queryString ? `?${queryString}` : ''}`;
  return apiGet<BatchJobListResponse>(url);
}

/**
 * Get a batch job with all its tasks
 */
export async function getBatchJob(jobId: string): Promise<BatchJob> {
  return apiGet<BatchJob>(`/api/projects/batch/jobs/${jobId}`);
}

/**
 * Cancel a batch job
 */
export async function cancelBatchJob(jobId: string): Promise<BatchJob> {
  return apiPost<BatchJob>(`/api/projects/batch/jobs/${jobId}/cancel`);
}

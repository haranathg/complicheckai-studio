/**
 * Types for batch document processing
 */

export type BatchJobStatus = 'pending' | 'processing' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
export type BatchTaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

export interface BatchTask {
  id: string;
  document_id: string;
  status: BatchTaskStatus;
  progress: number;
  parse_result_id?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
}

export interface BatchJob {
  id: string;
  project_id: string;
  parser: string;
  model?: string;
  status: BatchJobStatus;
  total_documents: number;
  completed_documents: number;
  failed_documents: number;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  tasks: BatchTask[];
}

export interface BatchJobListResponse {
  jobs: BatchJob[];
  total: number;
}

export interface BatchProcessRequest {
  document_ids?: string[];
  parser: string;
  model?: string;
  skip_already_parsed?: boolean;
}

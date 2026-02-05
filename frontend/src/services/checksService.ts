/**
 * Service for interacting with the v2 checks API
 * Uses authenticated API client with Bearer token
 */
import { apiGet, apiPost, apiPut } from './apiClient';
import type {
  DocumentCheckResult,
  CheckHistoryResponse,
  RunChecksResponse,
  BatchCheckRun,
  BatchCheckRequest,
  BatchRunsListResponse,
  ProjectSettings,
  ProjectSettingsUpdate,
  WorkTypesResponse,
  DocumentTypesResponse,
  DocumentClassification,
  ChecksConfig,
  RunChecksV3Request,
  RunChecksV3Response,
  DocumentCheckResultV3,
  PageClassificationsResponse,
} from '../types/checksV2';

// ============ DOCUMENT CHECKS ============

export async function runDocumentChecks(
  documentId: string,
  forceReclassify: boolean = false
): Promise<RunChecksResponse> {
  return apiPost<RunChecksResponse>(
    `/api/checks/documents/${documentId}/run`,
    { force_reclassify: forceReclassify }
  );
}

export async function getDocumentCheckHistory(
  documentId: string,
  limit: number = 10
): Promise<CheckHistoryResponse> {
  return apiGet<CheckHistoryResponse>(`/api/checks/documents/${documentId}/history?limit=${limit}`);
}

export async function getLatestCheckResults(
  documentId: string
): Promise<{ has_results: boolean } & Partial<DocumentCheckResult>> {
  return apiGet(`/api/checks/documents/${documentId}/results/latest`);
}

export async function getCheckResultById(resultId: string): Promise<DocumentCheckResult> {
  return apiGet<DocumentCheckResult>(`/api/checks/results/${resultId}`);
}

// ============ V3 PAGE-LEVEL CHECKS ============

export async function runDocumentChecksV3(
  documentId: string,
  options: RunChecksV3Request = {}
): Promise<RunChecksV3Response> {
  return apiPost<RunChecksV3Response>(
    `/api/checks/documents/${documentId}/run-v3`,
    options
  );
}

export async function getLatestCheckResultsV3(
  documentId: string
): Promise<{ has_results: boolean } & Partial<DocumentCheckResultV3>> {
  return apiGet(`/api/checks/documents/${documentId}/results/latest-v3`);
}

export async function getPageClassifications(
  parseResultId: string
): Promise<PageClassificationsResponse> {
  return apiGet<PageClassificationsResponse>(`/api/parse/${parseResultId}/page-classifications`);
}

export async function classifyPages(
  parseResultId: string,
  forceReclassify: boolean = false
): Promise<PageClassificationsResponse> {
  return apiPost<PageClassificationsResponse>(
    `/api/parse/${parseResultId}/classify-pages`,
    { force_reclassify: forceReclassify }
  );
}

// ============ BATCH CHECKS ============

export async function runBatchChecks(
  projectId: string,
  options: BatchCheckRequest = {}
): Promise<{ batch_run_id: string; status: string; total_documents: number; message: string }> {
  return apiPost(`/api/checks/projects/${projectId}/run-all`, options);
}

export async function getBatchRuns(projectId: string): Promise<BatchRunsListResponse> {
  return apiGet<BatchRunsListResponse>(`/api/checks/projects/${projectId}/batch-runs`);
}

export async function getBatchRunStatus(batchRunId: string): Promise<BatchCheckRun> {
  return apiGet<BatchCheckRun>(`/api/checks/batch-runs/${batchRunId}`);
}

// ============ PROJECT SETTINGS ============

export async function getWorkTypeTemplates(): Promise<WorkTypesResponse> {
  return apiGet<WorkTypesResponse>('/api/projects/templates');
}

export async function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  return apiGet<ProjectSettings>(`/api/projects/${projectId}/settings`);
}

export async function updateProjectSettings(
  projectId: string,
  settings: ProjectSettingsUpdate
): Promise<{ status: string; settings: ProjectSettings }> {
  return apiPut(`/api/projects/${projectId}/settings`, settings);
}

export async function getProjectChecksConfig(projectId: string): Promise<ChecksConfig> {
  return apiGet<ChecksConfig>(`/api/projects/${projectId}/checks-config`);
}

export async function updateProjectChecksConfig(
  projectId: string,
  config: ChecksConfig
): Promise<{ status: string }> {
  return apiPut(`/api/projects/${projectId}/checks-config`, config);
}

// ============ DOCUMENT CLASSIFICATION ============

export async function getDocumentTypes(): Promise<DocumentTypesResponse> {
  return apiGet<DocumentTypesResponse>('/api/projects/document-types');
}

export async function classifyDocument(
  projectId: string,
  documentId: string
): Promise<DocumentClassification> {
  return apiPost<DocumentClassification>(
    `/api/projects/${projectId}/documents/${documentId}/classify`
  );
}

export async function getDocumentClassification(
  projectId: string,
  documentId: string
): Promise<DocumentClassification> {
  return apiGet<DocumentClassification>(
    `/api/projects/${projectId}/documents/${documentId}/classification`
  );
}

export async function overrideDocumentClassification(
  projectId: string,
  documentId: string,
  documentType: string
): Promise<{ status: string; document_type: string }> {
  return apiPost(`/api/projects/${projectId}/documents/${documentId}/classification`, {
    document_type: documentType,
  });
}

// ============ REPORTS ============

export async function downloadDocumentReport(documentId: string): Promise<Blob> {
  // For blob downloads, we need to use fetch directly with auth
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const { AUTH_DISABLED } = await import('../config/amplify');
  const { API_URL } = await import('../config');

  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (!AUTH_DISABLED) {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Continue without auth
    }
  }

  const response = await fetch(`${API_URL}/api/reports/documents/${documentId}/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ include_details: true }),
  });

  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

export async function downloadProjectReport(projectId: string): Promise<Blob> {
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const { AUTH_DISABLED } = await import('../config/amplify');
  const { API_URL } = await import('../config');

  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (!AUTH_DISABLED) {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Continue without auth
    }
  }

  const response = await fetch(`${API_URL}/api/reports/projects/${projectId}/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ include_details: true }),
  });

  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

export async function downloadBatchReport(batchRunId: string): Promise<Blob> {
  const { fetchAuthSession } = await import('aws-amplify/auth');
  const { AUTH_DISABLED } = await import('../config/amplify');
  const { API_URL } = await import('../config');

  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  if (!AUTH_DISABLED) {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch {
      // Continue without auth
    }
  }

  const response = await fetch(`${API_URL}/api/reports/batch-runs/${batchRunId}/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ include_details: true }),
  });

  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

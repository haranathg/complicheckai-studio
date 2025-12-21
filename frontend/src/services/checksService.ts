/**
 * Service for interacting with the v2 checks API
 */
import { API_BASE } from '../config';
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
} from '../types/checksV2';

const CHECKS_API = `${API_BASE}/api/checks`;
const PROJECTS_API = `${API_BASE}/api/projects`;

// ============ DOCUMENT CHECKS ============

export async function runDocumentChecks(
  documentId: string,
  forceReclassify: boolean = false
): Promise<RunChecksResponse> {
  const response = await fetch(`${CHECKS_API}/documents/${documentId}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force_reclassify: forceReclassify }),
  });
  if (!response.ok) throw new Error('Failed to run checks');
  return response.json();
}

export async function getDocumentCheckHistory(
  documentId: string,
  limit: number = 10
): Promise<CheckHistoryResponse> {
  const response = await fetch(`${CHECKS_API}/documents/${documentId}/history?limit=${limit}`);
  if (!response.ok) throw new Error('Failed to get check history');
  return response.json();
}

export async function getLatestCheckResults(
  documentId: string
): Promise<{ has_results: boolean } & Partial<DocumentCheckResult>> {
  const response = await fetch(`${CHECKS_API}/documents/${documentId}/results/latest`);
  if (!response.ok) throw new Error('Failed to get latest results');
  return response.json();
}

export async function getCheckResultById(resultId: string): Promise<DocumentCheckResult> {
  const response = await fetch(`${CHECKS_API}/results/${resultId}`);
  if (!response.ok) throw new Error('Failed to get check result');
  return response.json();
}

// ============ BATCH CHECKS ============

export async function runBatchChecks(
  projectId: string,
  options: BatchCheckRequest = {}
): Promise<{ batch_run_id: string; status: string; total_documents: number; message: string }> {
  const response = await fetch(`${CHECKS_API}/projects/${projectId}/run-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  if (!response.ok) throw new Error('Failed to start batch check run');
  return response.json();
}

export async function getBatchRuns(projectId: string): Promise<BatchRunsListResponse> {
  const response = await fetch(`${CHECKS_API}/projects/${projectId}/batch-runs`);
  if (!response.ok) throw new Error('Failed to get batch runs');
  return response.json();
}

export async function getBatchRunStatus(batchRunId: string): Promise<BatchCheckRun> {
  const response = await fetch(`${CHECKS_API}/batch-runs/${batchRunId}`);
  if (!response.ok) throw new Error('Failed to get batch run status');
  return response.json();
}

// ============ PROJECT SETTINGS ============

export async function getWorkTypeTemplates(): Promise<WorkTypesResponse> {
  const response = await fetch(`${PROJECTS_API}/templates`);
  if (!response.ok) throw new Error('Failed to get work type templates');
  return response.json();
}

export async function getProjectSettings(projectId: string): Promise<ProjectSettings> {
  const response = await fetch(`${PROJECTS_API}/${projectId}/settings`);
  if (!response.ok) throw new Error('Failed to get project settings');
  return response.json();
}

export async function updateProjectSettings(
  projectId: string,
  settings: ProjectSettingsUpdate
): Promise<{ status: string; settings: ProjectSettings }> {
  const response = await fetch(`${PROJECTS_API}/${projectId}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error('Failed to update project settings');
  return response.json();
}

export async function getProjectChecksConfig(projectId: string): Promise<ChecksConfig> {
  const response = await fetch(`${PROJECTS_API}/${projectId}/checks-config`);
  if (!response.ok) throw new Error('Failed to get checks config');
  return response.json();
}

export async function updateProjectChecksConfig(
  projectId: string,
  config: ChecksConfig
): Promise<{ status: string }> {
  const response = await fetch(`${PROJECTS_API}/${projectId}/checks-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) throw new Error('Failed to update checks config');
  return response.json();
}

// ============ DOCUMENT CLASSIFICATION ============

export async function getDocumentTypes(): Promise<DocumentTypesResponse> {
  const response = await fetch(`${PROJECTS_API}/document-types`);
  if (!response.ok) throw new Error('Failed to get document types');
  return response.json();
}

export async function classifyDocument(
  projectId: string,
  documentId: string
): Promise<DocumentClassification> {
  const response = await fetch(
    `${PROJECTS_API}/${projectId}/documents/${documentId}/classify`,
    { method: 'POST' }
  );
  if (!response.ok) throw new Error('Failed to classify document');
  return response.json();
}

export async function getDocumentClassification(
  projectId: string,
  documentId: string
): Promise<DocumentClassification> {
  const response = await fetch(
    `${PROJECTS_API}/${projectId}/documents/${documentId}/classification`
  );
  if (!response.ok) throw new Error('Failed to get document classification');
  return response.json();
}

export async function overrideDocumentClassification(
  projectId: string,
  documentId: string,
  documentType: string
): Promise<{ status: string; document_type: string }> {
  const response = await fetch(
    `${PROJECTS_API}/${projectId}/documents/${documentId}/classification`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_type: documentType }),
    }
  );
  if (!response.ok) throw new Error('Failed to override classification');
  return response.json();
}

// ============ REPORTS ============

export async function downloadDocumentReport(documentId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/reports/documents/${documentId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_details: true }),
  });
  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

export async function downloadProjectReport(projectId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/reports/projects/${projectId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_details: true }),
  });
  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

export async function downloadBatchReport(batchRunId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/reports/batch-runs/${batchRunId}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ include_details: true }),
  });
  if (!response.ok) throw new Error('Failed to generate report');
  return response.blob();
}

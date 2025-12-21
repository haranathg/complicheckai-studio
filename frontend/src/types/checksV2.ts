/**
 * Types for the v2 compliance checks system
 * Including document classification, project settings, and batch checks
 */

// ============ DOCUMENT TYPES ============

export interface DocumentTypeConfig {
  id: string;
  name: string;
  description: string;
  upload_slot: string;
  classification_signals?: {
    keywords: string[];
    patterns?: string[];
    visual_cues?: string[];
  };
  completeness_checks: CompletenessCheck[];
  compliance_checks: ComplianceCheckV2[];
}

export interface CompletenessCheck {
  id: string;
  name: string;
  question: string;
  required: boolean;
  search_terms?: string[];
}

export interface ComplianceCheckV2 {
  id: string;
  name: string;
  question: string;
  rule_reference?: string;
  validation_type?: string;
  threshold?: {
    max_percentage?: number;
    max_metres?: number;
    min_metres?: number;
    max_days?: number;
    max_emissions_g_kg?: number;
    min_efficiency_percent?: number;
  };
  applies_to?: string[];
}

// ============ WORK TYPES ============

export interface WorkTypeTemplate {
  id: string;
  name: string;
  description: string;
  required_documents: string[];
  optional_documents: string[];
  default_settings: {
    vision_parser: string;
    chat_model: string;
    compliance_model: string;
  };
}

// ============ PROJECT SETTINGS ============

export interface ProjectSettings {
  work_type: string;
  vision_parser: string;
  vision_model?: string;
  chat_model: string;
  compliance_model: string;
  checks_config?: ChecksConfig;
  usage: {
    total_parse_credits: number;
    total_input_tokens: number;
    total_output_tokens: number;
  };
  required_documents: string[];
  optional_documents: string[];
}

export interface ProjectSettingsUpdate {
  work_type?: string;
  vision_parser?: string;
  vision_model?: string;
  chat_model?: string;
  compliance_model?: string;
}

// ============ CHECKS CONFIG ============

export interface ChecksConfig {
  version: string;
  description: string;
  document_types: Record<string, DocumentTypeConfig>;
  work_types: Record<string, WorkTypeTemplate>;
  upload_slots?: {
    description: string;
    slots: UploadSlot[];
  };
}

export interface UploadSlot {
  id: string;
  name: string;
  required: boolean;
  document_types: string[];
}

// ============ DOCUMENT CLASSIFICATION ============

export interface DocumentClassification {
  document_type: string;
  confidence: number;
  signals_found: string[];
  is_override?: boolean;
  model?: string;
}

// ============ CHECK RESULTS ============

export interface CheckResultItem {
  check_id: string;
  check_name: string;
  check_type: 'completeness' | 'compliance';
  status: 'pass' | 'fail' | 'needs_review' | 'na';
  confidence: number;
  found_value?: string | null;
  notes: string;
  rule_reference?: string;
  chunk_ids: string[];
}

export interface CheckResultSummary {
  total_checks: number;
  passed: number;
  failed: number;
  needs_review: number;
  na: number;
}

export interface DocumentCheckResult {
  id: string;
  run_number: number;
  document_type: string;
  completeness_results: CheckResultItem[];
  compliance_results: CheckResultItem[];
  summary: CheckResultSummary;
  checks_config?: {
    document_type: string;
    completeness_checks: CompletenessCheck[];
    compliance_checks: ComplianceCheckV2[];
  };
  usage?: {
    model: string;
    input_tokens: number;
    output_tokens: number;
  };
  checked_at: string;
  processing_time_ms?: number;
}

export interface CheckHistoryItem {
  id: string;
  run_number: number;
  document_type: string;
  summary: CheckResultSummary;
  model: string;
  batch_run_id?: string;
  created_at: string;
  processing_time_ms?: number;
}

export interface CheckHistoryResponse {
  document_id: string;
  total_runs: number;
  history: CheckHistoryItem[];
}

// ============ BATCH CHECK RUNS ============

export interface BatchCheckRequest {
  force_rerun?: boolean;
  skip_unparsed?: boolean;
}

export interface BatchCheckRun {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    percent: number;
  };
  summary: {
    total_passed: number;
    total_failed: number;
    total_needs_review: number;
  };
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  results?: BatchCheckResultItem[];
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface BatchCheckResultItem {
  document_id: string;
  document_type: string;
  status: string;
  summary: CheckResultSummary;
}

export interface BatchRunsListResponse {
  runs: BatchCheckRunSummary[];
}

export interface BatchCheckRunSummary {
  id: string;
  status: string;
  total_documents: number;
  completed_documents: number;
  failed_documents: number;
  skipped_documents: number;
  total_passed: number;
  total_failed: number;
  total_needs_review: number;
  created_at: string;
  completed_at?: string;
}

// ============ API RESPONSES ============

export interface DocumentTypesResponse {
  document_types: Array<{
    id: string;
    name: string;
    description: string;
    upload_slot: string;
  }>;
}

export interface WorkTypesResponse {
  templates: WorkTypeTemplate[];
}

export interface RunChecksResponse {
  id: string;
  run_number: number;
  document_type: string;
  completeness_results: CheckResultItem[];
  compliance_results: CheckResultItem[];
  summary: CheckResultSummary;
  checked_at: string;
  usage?: {
    model: string;
    input_tokens: number;
    output_tokens: number;
  };
}

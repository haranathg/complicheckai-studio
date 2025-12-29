/**
 * Types for project and document management
 */

export interface Project {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  created_by?: string;
  document_count: number;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

export interface ParseResultSummary {
  id: string;
  parser: string;
  model?: string;
  status: string;
  chunk_count?: number;
  page_count?: number;
  credit_usage?: number;
  input_tokens?: number;
  output_tokens?: number;
  created_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  filename: string;
  original_filename: string;
  content_type?: string;
  file_size?: number;
  page_count?: number;
  created_at: string;
  uploaded_by?: string;
  parse_results: ParseResultSummary[];
  has_cached_result: boolean;
  latest_parser?: string;
  // Classification fields (v2)
  document_type?: string;
  classification_confidence?: number;
  classification_signals?: string[];
  classification_override?: boolean;
  classification_model?: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

export interface CachedParseResponse {
  cached: boolean;
  result?: {
    markdown: string;
    chunks: Array<{
      id: string;
      markdown: string;
      type: string;
      grounding?: {
        box: {
          left: number;
          top: number;
          right: number;
          bottom: number;
        };
        page: number;
      };
    }>;
    metadata: {
      page_count?: number;
      credit_usage?: number;
      parser?: string;
      model?: string;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        model?: string;
      };
    };
    parse_result_id?: string;
  };
}

export interface UsageByParser {
  parser: string;
  parse_count: number;
  input_tokens: number;
  output_tokens: number;
  credit_usage: number;
  estimated_cost: number;
}

export interface CheckUsage {
  total_checks: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
}

export interface ProjectUsageResponse {
  project_id: string;
  project_name: string;
  document_count: number;
  total_parses: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_credit_usage: number;
  estimated_total_cost: number;
  usage_by_parser: UsageByParser[];
  check_usage?: CheckUsage;
}

// Document status summary types for dashboard
export interface AnnotationSummary {
  total: number;
  open: number;
  resolved: number;
  last_updated_at?: string;
  last_comment_preview?: string;
}

export interface CheckSummary {
  total: number;
  passed: number;
  failed: number;
  needs_review: number;
  checked_at?: string;
}

export interface DocumentStatusSummary {
  id: string;
  project_id: string;
  original_filename: string;
  content_type?: string;
  file_size?: number;
  page_count?: number;
  created_at: string;
  processed_at?: string;
  parser?: string;
  parser_model?: string;
  uploaded_by?: string;
  annotations: AnnotationSummary;
  // V2 Classification fields
  document_type?: string;
  classification_confidence?: number;
  classification_override?: boolean;
  // V2 Check results summary
  check_summary?: CheckSummary;
}

export interface DocumentStatusListResponse {
  documents: DocumentStatusSummary[];
  total: number;
}

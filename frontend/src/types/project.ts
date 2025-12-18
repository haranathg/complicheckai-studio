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

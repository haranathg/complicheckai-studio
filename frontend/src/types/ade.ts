export interface BoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Grounding {
  box: BoundingBox;
  page: number;
}

export interface Chunk {
  id: string;
  markdown: string;
  type: string;
  grounding: Grounding | null;
}

export interface PageClassificationInfo {
  page: number;
  page_type: string;
  confidence: number;
  signals?: string[];
  classification_model?: string;
  classified_at?: string;
}

export interface ParseResponse {
  markdown: string;
  chunks: Chunk[];
  metadata: {
    page_count: number | null;
    credit_usage: number | null;
    parser?: string;
    model?: string;
    parsed_at?: string;
    parsed_by?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      model?: string;
    };
  };
  file_id?: string;
  parse_result_id?: string;
  page_classifications?: PageClassificationInfo[];
}

export interface ExtractResponse {
  extraction: Record<string, unknown>;
  extraction_metadata: Record<string, unknown>;
}

// Chunk reference with stable identifiers for cross-document navigation
export interface ChunkReference {
  id: string;
  page?: number;  // 0-indexed page number
  bbox?: BoundingBox;  // Bounding box for position matching
  type?: string;  // Chunk type (text, table, figure, etc.)
}

// Source from a specific document in multi-doc chat
export interface DocumentSource {
  document_id: string;
  document_name: string;
  chunk_ids: string[];  // Keep for backwards compatibility
  chunks?: ChunkReference[];  // New: detailed chunk info for stable matching
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  chunk_ids?: string[];
  document_sources?: DocumentSource[]; // For multi-document chat
  usage?: {
    input_tokens: number;
    output_tokens: number;
    model?: string;
  };
}

export interface ChatResponse {
  answer: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    model?: string;
  };
}

export type TabType = 'parse' | 'review' | 'chat' | 'compliance';

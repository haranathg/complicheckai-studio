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

export interface ParseResponse {
  markdown: string;
  chunks: Chunk[];
  metadata: {
    page_count: number | null;
    credit_usage: number | null;
    parser?: string;
    model?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      model?: string;
    };
  };
  file_id?: string;
}

export interface ExtractResponse {
  extraction: Record<string, unknown>;
  extraction_metadata: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  chunk_ids?: string[];
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

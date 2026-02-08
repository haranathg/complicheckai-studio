/**
 * Chat history persistence service.
 * Saves and loads chat sessions per document.
 */
import { apiGet, apiPost, apiDelete } from './apiClient';
import type { ChatMessage, BoundingBox } from '../types/ade';

interface ChatMessageResponse {
  id: string;
  session_id: string;
  role: string;
  content: string;
  chunk_ids?: string[];
  document_sources?: Array<{
    document_id: string;
    document_name: string;
    chunk_ids: string[];
    chunks?: Array<{ id: string; page?: number; bbox?: BoundingBox; type?: string }>;
  }>;
  input_tokens?: number;
  output_tokens?: number;
  model?: string;
  created_at: string;
}

interface ChatSessionResponse {
  id: string;
  document_id: string;
  created_at: string;
  updated_at: string;
  total_input_tokens: number;
  total_output_tokens: number;
  messages: ChatMessageResponse[];
}

export async function loadChatSession(documentId: string): Promise<ChatMessage[] | null> {
  try {
    const session = await apiGet<ChatSessionResponse | null>(
      `/api/chat-history/${documentId}`
    );
    if (!session || !session.messages || session.messages.length === 0) {
      return null;
    }
    return session.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      chunk_ids: m.chunk_ids,
      document_sources: m.document_sources,
      usage: m.input_tokens != null ? {
        input_tokens: m.input_tokens,
        output_tokens: m.output_tokens || 0,
        model: m.model,
      } : undefined,
    }));
  } catch (err) {
    console.error('Failed to load chat session:', err);
    return null;
  }
}

export async function saveChatMessages(
  documentId: string,
  messages: ChatMessage[]
): Promise<void> {
  try {
    await apiPost(`/api/chat-history/${documentId}/messages`, {
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        chunk_ids: m.chunk_ids || null,
        document_sources: m.document_sources || null,
        input_tokens: m.usage?.input_tokens || null,
        output_tokens: m.usage?.output_tokens || null,
        model: m.usage?.model || null,
      })),
    });
  } catch (err) {
    console.error('Failed to save chat messages:', err);
  }
}

export async function clearChatSession(documentId: string): Promise<void> {
  try {
    await apiDelete(`/api/chat-history/${documentId}`);
  } catch (err) {
    console.error('Failed to clear chat session:', err);
  }
}

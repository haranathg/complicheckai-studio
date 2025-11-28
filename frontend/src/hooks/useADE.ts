import { useState, useCallback } from 'react';
import type { ParseResponse, ExtractResponse, ChatMessage, ChatResponse, Chunk } from '../types/ade';

const API_BASE = 'http://localhost:8000/api';

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required: boolean;
}

export function useADE() {
  const [isParseLoading, setIsParseLoading] = useState(false);
  const [isExtractLoading, setIsExtractLoading] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const parseDocument = useCallback(async (file: File): Promise<ParseResponse | null> => {
    setIsParseLoading(true);
    setParseError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Parse failed');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setParseError(message);
      return null;
    } finally {
      setIsParseLoading(false);
    }
  }, []);

  const extractData = useCallback(async (
    markdown: string,
    fields: SchemaField[]
  ): Promise<ExtractResponse | null> => {
    setIsExtractLoading(true);
    setExtractError(null);

    // Build JSON schema from fields
    const properties: Record<string, { type: string; description: string }> = {};
    const required: string[] = [];

    fields.forEach(field => {
      if (field.name) {
        properties[field.name] = {
          type: field.type,
          description: field.description,
        };
        if (field.required) {
          required.push(field.name);
        }
      }
    });

    const schema = {
      type: 'object',
      properties,
      required,
    };

    try {
      const response = await fetch(`${API_BASE}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          schema_def: schema,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Extract failed');
      }

      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setExtractError(message);
      return null;
    } finally {
      setIsExtractLoading(false);
    }
  }, []);

  const sendChatMessage = useCallback(async (
    question: string,
    markdown: string,
    chunks: Chunk[],
    history: ChatMessage[]
  ): Promise<ChatResponse | null> => {
    setIsChatLoading(true);
    setChatError(null);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          markdown,
          chunks,
          history,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Chat failed');
      }

      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setChatError(message);
      return null;
    } finally {
      setIsChatLoading(false);
    }
  }, []);

  return {
    parseDocument,
    extractData,
    sendChatMessage,
    isParseLoading,
    isExtractLoading,
    isChatLoading,
    parseError,
    extractError,
    chatError,
  };
}

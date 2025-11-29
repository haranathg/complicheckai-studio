import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Chunk, ChatMessage } from '../types/ade';
import { API_URL } from '../config';
import { formatTokensWithCost } from '../utils/tokenCost';

interface ChatPanelProps {
  markdown: string;
  chunks: Chunk[];
  disabled: boolean;
  onChunkSelect: (chunkIds: string[], pageNumber?: number) => void;
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  selectedModel: string;
}

export default function ChatPanel({ markdown, chunks, disabled, onChunkSelect, messages, onMessagesChange, selectedModel }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    onMessagesChange(updatedMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: input,
          markdown,
          chunks,
          history: messages,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Chat failed');
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.answer,
        chunk_ids: data.chunk_ids || [],
        usage: data.usage
      };
      onMessagesChange([...updatedMessages, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      // Remove the user message if there was an error
      onMessagesChange(messages);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Calculate cumulative token usage from all assistant messages and track model
  const tokenUsage = messages.reduce(
    (acc, msg) => {
      if (msg.usage) {
        return {
          input: acc.input + msg.usage.input_tokens,
          output: acc.output + msg.usage.output_tokens,
          model: msg.usage.model || acc.model,
        };
      }
      return acc;
    },
    { input: 0, output: 0, model: undefined as string | undefined }
  );

  const clearChat = () => {
    onMessagesChange([]);
    setError(null);
  };

  if (disabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p>Parse a document first to chat with it</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium text-gray-700">Chat with your document</h4>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-4">Ask questions about your document</p>
            <div className="space-y-2">
              <p className="text-sm text-gray-500">Try asking:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What is this document about?',
                  'Summarize the key points',
                  'What are the main figures or tables?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const relevantChunks = msg.chunk_ids
              ? chunks.filter(c => msg.chunk_ids?.includes(c.id))
              : [];

            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {relevantChunks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-500 mb-2">
                            Sources ({relevantChunks.length}) — click to view:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {relevantChunks.map((chunk) => {
                              const pageNum = chunk.grounding?.page !== undefined ? chunk.grounding.page + 1 : null;
                              return (
                                <button
                                  key={chunk.id}
                                  onClick={() => onChunkSelect([chunk.id], pageNum || undefined)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border rounded hover:border-blue-400 hover:bg-blue-50 transition-colors"
                                >
                                  {pageNum && <span className="text-gray-400">p.{pageNum}</span>}
                                  <span className="capitalize text-gray-600">{chunk.type}</span>
                                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question about the document..."
          rows={1}
          className="flex-1 border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>

      {/* Token usage footer */}
      {(tokenUsage.input > 0 || tokenUsage.output > 0) && (
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-2">
          <span>Chat: {formatTokensWithCost(tokenUsage.input, tokenUsage.output, tokenUsage.model)}</span>
          {tokenUsage.model && (
            <span className="text-gray-300">•</span>
          )}
          {tokenUsage.model && (
            <span>{tokenUsage.model.replace('claude-', '').replace('-20250514', '')}</span>
          )}
        </div>
      )}
    </div>
  );
}

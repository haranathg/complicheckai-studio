import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Chunk, ChatMessage } from '../types/ade';
import { API_URL } from '../config';
import { useTheme } from '../contexts/ThemeContext';

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
  const { isDark } = useTheme();
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

  const clearChat = () => {
    onMessagesChange([]);
    setError(null);
  };

  if (disabled) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className={isDark ? 'text-gray-400' : 'text-slate-500'}>Parse a document first to chat with it</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Messages Header */}
      <div className="flex items-center justify-between mb-4">
        <h4 className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>Chat with your document</h4>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className={`text-sm ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <p className={`${isDark ? 'text-gray-400' : 'text-slate-500'} mb-4`}>Ask questions about your document</p>
            <div className="space-y-2">
              <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>Try asking:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {[
                  'What is this document about?',
                  'Summarize the key points',
                  'What are the main figures or tables?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors border ${
                      isDark
                        ? 'bg-slate-700/50 hover:bg-slate-600/50 text-gray-300 border-slate-600/50'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                    }`}
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
                  className={`max-w-[85%] p-3 rounded-xl ${
                    msg.role === 'user'
                      ? 'text-white'
                      : isDark
                        ? 'text-gray-200 border border-slate-700/40'
                        : 'text-slate-800 border border-slate-200'
                  }`}
                  style={msg.role === 'user'
                    ? { background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)' }
                    : { background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(248, 250, 252, 0.9)' }
                  }
                >
                  {msg.role === 'assistant' ? (
                    <>
                      <div className={`prose prose-sm max-w-none ${isDark ? 'prose-invert' : ''}`}>
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                      {relevantChunks.length > 0 && (
                        <div className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
                          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'} mb-2`}>
                            Sources ({relevantChunks.length}) — click to view:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {relevantChunks.map((chunk) => {
                              const pageNum = chunk.grounding?.page !== undefined ? chunk.grounding.page + 1 : null;
                              return (
                                <button
                                  key={chunk.id}
                                  onClick={() => onChunkSelect([chunk.id], pageNum || undefined)}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                                    isDark
                                      ? 'bg-slate-800/50 border border-slate-600/50 hover:border-sky-400 hover:bg-sky-900/30'
                                      : 'bg-slate-100 border border-slate-300 hover:border-sky-500 hover:bg-sky-50'
                                  }`}
                                >
                                  {pageNum && <span className={isDark ? 'text-gray-500' : 'text-slate-500'}>p.{pageNum}</span>}
                                  <span className={`capitalize ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>{chunk.type}</span>
                                  <svg className={`w-3 h-3 ${isDark ? 'text-gray-500' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div
              className={`p-3 rounded-xl border ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}
              style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(248, 250, 252, 0.9)' }}
            >
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-400"></div>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-slate-600'}`}>Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${
          isDark
            ? 'bg-red-900/30 border border-red-700/50 text-red-400'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
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
          className={`flex-1 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none ${
            isDark
              ? 'bg-slate-800/60 border border-slate-600/50 text-white placeholder-gray-500'
              : 'bg-white border border-slate-300 text-slate-800 placeholder-slate-400'
          }`}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="text-white px-4 py-2.5 rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          style={{
            background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
            boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
            border: '1px solid rgba(191, 219, 254, 0.3)'
          }}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

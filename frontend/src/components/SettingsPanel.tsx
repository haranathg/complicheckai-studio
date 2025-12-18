import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ModelSelector from './ModelSelector';
import ParserSelector from './ParserSelector';
import ComplianceChecksManager from './ComplianceChecksManager';
import { formatTokensWithCost } from '../utils/tokenCost';
import type { ComplianceCheck } from '../types/compliance';

type SettingsTab = 'general' | 'checks' | 'usage';

interface UsageData {
  input_tokens: number;
  output_tokens: number;
  model?: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  selectedParser: string;
  onParserChange: (parser: string) => void;
  completenessChecks: ComplianceCheck[];
  complianceChecks: ComplianceCheck[];
  onCompletenessChecksChange: (checks: ComplianceCheck[]) => void;
  onComplianceChecksChange: (checks: ComplianceCheck[]) => void;
  chatUsage?: UsageData;
  complianceUsage?: UsageData;
  parseCredits?: number | null;
  parseUsage?: UsageData | null;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  selectedModel,
  onModelChange,
  selectedParser,
  onParserChange,
  completenessChecks,
  complianceChecks,
  onCompletenessChecksChange,
  onComplianceChecksChange,
  chatUsage,
  complianceUsage,
  parseCredits,
  parseUsage,
}: SettingsPanelProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs: { id: SettingsTab; label: string; icon: ReactNode }[] = [
    {
      id: 'general',
      label: 'General',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'checks',
      label: 'Compliance Checks',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'usage',
      label: 'Usage',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] z-50 shadow-2xl transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ background: isDark ? '#0f172a' : '#f8fafc' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.border}`}>
          <h2 className={`text-lg font-semibold ${theme.textPrimary}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg ${theme.buttonBg} ${theme.buttonHover} transition-colors`}
          >
            <svg className={`w-5 h-5 ${theme.textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${theme.border} px-4`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? `border-sky-500 ${theme.textPrimary}`
                  : `border-transparent ${theme.textMuted} hover:${theme.textSecondary}`
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6" style={{ height: 'calc(100% - 120px)' }}>
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Parser Settings */}
              <div>
                <h3 className={`text-sm font-medium ${theme.textSecondary} mb-3`}>Document Parser</h3>
                <div className={`p-4 rounded-xl border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${theme.textMuted} w-20`}>Parser:</span>
                    <ParserSelector
                      selectedParser={selectedParser}
                      onParserChange={onParserChange}
                    />
                  </div>
                  <p className={`text-xs ${theme.textSubtle} mt-2`}>
                    Used for extracting text and structure from uploaded documents.
                  </p>
                </div>
              </div>

              {/* Model Settings */}
              <div>
                <h3 className={`text-sm font-medium ${theme.textSecondary} mb-3`}>AI Model</h3>
                <div className={`p-4 rounded-xl border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm ${theme.textMuted} w-20`}>Model:</span>
                    <ModelSelector
                      selectedModel={selectedModel}
                      onModelChange={onModelChange}
                      parser="bedrock_claude"
                    />
                  </div>
                  <p className={`text-xs ${theme.textSubtle} mt-2`}>
                    Used for Chat and Compliance checking features.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'checks' && (
            <ComplianceChecksManager
              completenessChecks={completenessChecks}
              complianceChecks={complianceChecks}
              onCompletenessChecksChange={onCompletenessChecksChange}
              onComplianceChecksChange={onComplianceChecksChange}
            />
          )}

          {activeTab === 'usage' && (
            <div className="space-y-4">
              <h3 className={`text-sm font-medium ${theme.textSecondary} mb-3`}>Token Usage</h3>

              {!(parseCredits || parseUsage || chatUsage || complianceUsage) ? (
                <div className={`text-center py-8 ${theme.textSubtle}`}>
                  <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <p className="text-sm">No usage data yet. Process a document to see usage statistics.</p>
                </div>
              ) : (
                <div className={`p-4 rounded-xl border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                  <div className="space-y-3">
                    {parseCredits != null && parseCredits > 0 && (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${theme.textMuted}`}>Parse (Landing AI)</span>
                        <span className={`text-sm font-mono ${theme.textSecondary}`}>{parseCredits} credits</span>
                      </div>
                    )}
                    {parseUsage && parseUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${theme.textMuted}`}>Parse (Claude Vision)</span>
                        <span className={`text-sm font-mono ${theme.textSecondary}`}>
                          {formatTokensWithCost(parseUsage.input_tokens, parseUsage.output_tokens, parseUsage.model)}
                        </span>
                      </div>
                    )}
                    {chatUsage && chatUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${theme.textMuted}`}>Chat</span>
                        <span className={`text-sm font-mono ${theme.textSecondary}`}>
                          {formatTokensWithCost(chatUsage.input_tokens, chatUsage.output_tokens, chatUsage.model)}
                        </span>
                      </div>
                    )}
                    {complianceUsage && complianceUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${theme.textMuted}`}>Compliance</span>
                        <span className={`text-sm font-mono ${theme.textSecondary}`}>
                          {formatTokensWithCost(complianceUsage.input_tokens, complianceUsage.output_tokens, complianceUsage.model)}
                        </span>
                      </div>
                    )}

                    {/* Total */}
                    {(() => {
                      const totalInput = (parseUsage?.input_tokens || 0) + (chatUsage?.input_tokens || 0) + (complianceUsage?.input_tokens || 0);
                      const totalOutput = (parseUsage?.output_tokens || 0) + (chatUsage?.output_tokens || 0) + (complianceUsage?.output_tokens || 0);
                      const model = parseUsage?.model || chatUsage?.model || complianceUsage?.model;
                      if (totalInput > 0) {
                        return (
                          <div className={`flex items-center justify-between pt-3 mt-3 border-t ${theme.border}`}>
                            <span className={`text-sm font-medium ${theme.textSecondary}`}>Total</span>
                            <span className={`text-sm font-mono font-medium ${theme.textPrimary}`}>
                              {formatTokensWithCost(totalInput, totalOutput, model)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

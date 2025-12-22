import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ModelSelector from './ModelSelector';
import ParserSelector from './ParserSelector';
import ComplianceChecksManager from './ComplianceChecksManager';
import { formatTokensWithCost } from '../utils/tokenCost';
import type { ComplianceCheck } from '../types/compliance';
import type { Project, ProjectUsageResponse } from '../types/project';
import { getProjectUsage } from '../services/projectService';

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
  currentProject?: Project | null;
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
  currentProject,
}: SettingsPanelProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [projectUsage, setProjectUsage] = useState<ProjectUsageResponse | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Handle mount/unmount with animation
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      // Allow one frame for the element to render in closed position before animating
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  // Handle animation end for closing
  const handleTransitionEnd = () => {
    if (!isOpen && !isVisible) {
      setShouldRender(false);
    }
  };

  // Fetch project usage when project changes or tab switches to usage
  useEffect(() => {
    if (currentProject && activeTab === 'usage') {
      setIsLoadingUsage(true);
      getProjectUsage(currentProject.id)
        .then(setProjectUsage)
        .catch(console.error)
        .finally(() => setIsLoadingUsage(false));
    }
  }, [currentProject, activeTab]);

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

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[480px] z-50 shadow-2xl transform transition-transform duration-300 ease-out ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ background: isDark ? '#0f172a' : '#f8fafc' }}
        onTransitionEnd={handleTransitionEnd}
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
            <div className="space-y-6">
              {/* Project Usage Section */}
              {currentProject && (
                <div>
                  <h3 className={`text-sm font-medium ${theme.textSecondary} mb-3`}>
                    Project Usage: {currentProject.name}
                  </h3>
                  {isLoadingUsage ? (
                    <div className={`flex items-center justify-center py-8 ${theme.textSubtle}`}>
                      <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Loading usage data...
                    </div>
                  ) : projectUsage ? (
                    <div className={`p-4 rounded-xl border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                      <div className="space-y-4">
                        {/* Summary stats */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                            <div className={`text-xs ${theme.textSubtle}`}>Documents</div>
                            <div className={`text-lg font-semibold ${theme.textPrimary}`}>{projectUsage.document_count}</div>
                          </div>
                          <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                            <div className={`text-xs ${theme.textSubtle}`}>Parses</div>
                            <div className={`text-lg font-semibold ${theme.textPrimary}`}>{projectUsage.total_parses}</div>
                          </div>
                          <div className={`p-3 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                            <div className={`text-xs ${theme.textSubtle}`}>Checks</div>
                            <div className={`text-lg font-semibold ${theme.textPrimary}`}>{projectUsage.check_usage?.total_checks || 0}</div>
                          </div>
                        </div>

                        {/* Usage by parser */}
                        {projectUsage.usage_by_parser.length > 0 && (
                          <div className="space-y-2">
                            <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wider`}>Parsing</div>
                            {projectUsage.usage_by_parser.map((usage) => (
                              <div key={usage.parser} className={`flex items-center justify-between py-2 border-b ${theme.border} last:border-0`}>
                                <div>
                                  <span className={`text-sm ${theme.textSecondary}`}>
                                    {usage.parser === 'landing_ai' ? 'Landing AI' :
                                     usage.parser === 'bedrock_claude' ? 'Bedrock Claude' :
                                     usage.parser === 'claude_vision' ? 'Claude Vision' :
                                     usage.parser === 'gemini_vision' ? 'Gemini Vision' : usage.parser}
                                  </span>
                                  <div className={`text-xs ${theme.textSubtle}`}>
                                    {usage.parse_count} parse{usage.parse_count !== 1 ? 's' : ''}
                                    {usage.credit_usage > 0 && ` · ${usage.credit_usage} credits`}
                                    {usage.input_tokens > 0 && ` · ${(usage.input_tokens / 1000).toFixed(1)}k tokens`}
                                  </div>
                                </div>
                                <span className={`text-sm font-mono ${theme.textPrimary}`}>
                                  ${usage.estimated_cost.toFixed(4)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Check usage */}
                        {projectUsage.check_usage && projectUsage.check_usage.total_checks > 0 && (
                          <div className="space-y-2">
                            <div className={`text-xs font-medium ${theme.textMuted} uppercase tracking-wider`}>Compliance Checks</div>
                            <div className={`flex items-center justify-between py-2`}>
                              <div>
                                <span className={`text-sm ${theme.textSecondary}`}>Check Runs</span>
                                <div className={`text-xs ${theme.textSubtle}`}>
                                  {projectUsage.check_usage.total_checks} run{projectUsage.check_usage.total_checks !== 1 ? 's' : ''}
                                  {projectUsage.check_usage.input_tokens > 0 && ` · ${((projectUsage.check_usage.input_tokens + projectUsage.check_usage.output_tokens) / 1000).toFixed(1)}k tokens`}
                                </div>
                              </div>
                              <span className={`text-sm font-mono ${theme.textPrimary}`}>
                                ${projectUsage.check_usage.estimated_cost.toFixed(4)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Total cost */}
                        <div className={`flex items-center justify-between pt-3 border-t ${theme.border}`}>
                          <span className={`text-sm font-medium ${theme.textSecondary}`}>Estimated Total Cost</span>
                          <span className={`text-lg font-mono font-bold bg-gradient-to-r from-sky-400 to-purple-500 bg-clip-text text-transparent`}>
                            ${projectUsage.estimated_total_cost.toFixed(4)}
                          </span>
                        </div>

                        {/* Token totals */}
                        {(projectUsage.total_input_tokens > 0 || projectUsage.total_credit_usage > 0) && (
                          <div className={`text-xs ${theme.textSubtle} pt-2`}>
                            {projectUsage.total_credit_usage > 0 && (
                              <span>Total credits: {projectUsage.total_credit_usage} · </span>
                            )}
                            {projectUsage.total_input_tokens > 0 && (
                              <span>Total tokens: {((projectUsage.total_input_tokens + projectUsage.total_output_tokens) / 1000).toFixed(1)}k</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className={`text-center py-6 ${theme.textSubtle}`}>
                      <p className="text-sm">No usage data for this project yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Current Session Usage */}
              <div>
                <h3 className={`text-sm font-medium ${theme.textSecondary} mb-3`}>Current Session Usage</h3>

                {!(parseCredits || parseUsage || chatUsage || complianceUsage) ? (
                  <div className={`text-center py-8 ${theme.textSubtle}`}>
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm">No session usage yet. Process a document to see usage statistics.</p>
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}

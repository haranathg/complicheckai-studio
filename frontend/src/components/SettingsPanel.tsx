import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ModelSelector from './ModelSelector';
import ParserSelector from './ParserSelector';
import V3ComplianceChecksViewer from './V3ComplianceChecksViewer';
import { formatTokensWithCost } from '../utils/tokenCost';
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'checks',
      label: 'Compliance Checks',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      ),
    },
    {
      id: 'usage',
      label: 'Usage',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 z-40 
          transition-all duration-300 ease-out
          ${isVisible ? 'bg-black/50 backdrop-blur-sm' : 'bg-black/0'}
        `}
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div
        className={`
          fixed top-0 right-0 h-full w-[500px] z-50 
          border-l ${theme.border}
          transform transition-transform duration-300 ease-out
          ${isVisible ? 'translate-x-0' : 'translate-x-full'}
        `}
        style={{ 
          background: isDark 
            ? 'linear-gradient(180deg, #0f172a 0%, #030712 100%)' 
            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          boxShadow: isDark 
            ? '-8px 0 32px rgba(0, 0, 0, 0.5)' 
            : '-8px 0 32px rgba(0, 0, 0, 0.1)'
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-5 border-b ${theme.border}`}>
          <div className="flex items-center gap-3">
            <div 
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
              }}
            >
              <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className={`text-lg font-semibold ${theme.textPrimary}`}>Settings</h2>
          </div>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-xl transition-all duration-150
              ${isDark 
                ? 'hover:bg-slate-800/60 text-slate-400 hover:text-slate-200' 
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}
            `}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={`flex gap-1 px-4 py-3 border-b ${theme.border}`}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl
                transition-all duration-150 ease-out
                ${activeTab === tab.id
                  ? isDark
                    ? 'bg-slate-800/80 text-white shadow-sm'
                    : 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : isDark
                    ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }
              `}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto h-[calc(100vh-140px)]">
          {activeTab === 'general' && (
            <div className="space-y-6">
              {/* Model Selection */}
              <div className={`p-5 rounded-xl border ${theme.border}`} 
                style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-4 flex items-center gap-2`}>
                  <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  AI Model
                </h3>
                <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} />
                <p className={`text-xs ${theme.textSubtle} mt-3`}>
                  Used for document chat and compliance checking.
                </p>
              </div>

              {/* Parser Selection */}
              <div className={`p-5 rounded-xl border ${theme.border}`}
                style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-4 flex items-center gap-2`}>
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  AI Vision Model (Doc Parser)
                </h3>
                <ParserSelector selectedParser={selectedParser} onParserChange={onParserChange} />
                <p className={`text-xs ${theme.textSubtle} mt-3`}>
                  Vision model used for document processing and extraction.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'checks' && (
            <div className="space-y-6">
              <V3ComplianceChecksViewer />
            </div>
          )}

          {activeTab === 'usage' && (
            <div className="space-y-6">
              {/* Project Usage */}
              {currentProject && (
                <div className={`p-5 rounded-xl border ${theme.border}`}
                  style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                  <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-4 flex items-center gap-2`}>
                    <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    Project: {currentProject.name}
                  </h3>
                  
                  {isLoadingUsage ? (
                    <div className="flex items-center justify-center py-8">
                      <svg className="animate-spin h-6 w-6 text-sky-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    </div>
                  ) : projectUsage && projectUsage.document_count > 0 ? (
                    <div className="space-y-4">
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                          <div className={`text-xs font-medium ${theme.textSubtle} uppercase tracking-wider`}>Documents</div>
                          <div className={`text-2xl font-bold ${theme.textPrimary} mt-1`}>{projectUsage.document_count}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                          <div className={`text-xs font-medium ${theme.textSubtle} uppercase tracking-wider`}>Parses</div>
                          <div className={`text-2xl font-bold ${theme.textPrimary} mt-1`}>{projectUsage.total_parses}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                          <div className={`text-xs font-medium ${theme.textSubtle} uppercase tracking-wider`}>Checks</div>
                          <div className={`text-2xl font-bold ${theme.textPrimary} mt-1`}>{projectUsage.check_usage?.total_checks || 0}</div>
                        </div>
                        <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
                          <div className={`text-xs font-medium ${theme.textSubtle} uppercase tracking-wider`}>Total Cost</div>
                          <div className={`text-2xl font-bold text-gradient mt-1`}>
                            ${projectUsage.estimated_total_cost.toFixed(4)}
                          </div>
                        </div>
                      </div>

                      {/* Usage by parser */}
                      {projectUsage.usage_by_parser.length > 0 && (
                        <div className="space-y-2">
                          <div className={`text-xs font-semibold ${theme.textMuted} uppercase tracking-wider`}>Parser Usage</div>
                          {projectUsage.usage_by_parser.map((usage) => (
                            <div key={usage.parser} className={`flex items-center justify-between py-3 border-b ${theme.border} last:border-0`}>
                              <div>
                                <span className={`text-sm font-medium ${theme.textSecondary}`}>
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
                              <span className={`text-sm font-mono font-semibold ${theme.textPrimary}`}>
                                ${usage.estimated_cost.toFixed(4)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Check usage */}
                      {projectUsage.check_usage && projectUsage.check_usage.total_checks > 0 && (
                        <div className="space-y-2">
                          <div className={`text-xs font-semibold ${theme.textMuted} uppercase tracking-wider`}>Compliance Checks</div>
                          <div className={`flex items-center justify-between py-3`}>
                            <div>
                              <span className={`text-sm font-medium ${theme.textSecondary}`}>Check Runs</span>
                              <div className={`text-xs ${theme.textSubtle}`}>
                                {projectUsage.check_usage.total_checks} run{projectUsage.check_usage.total_checks !== 1 ? 's' : ''}
                                {projectUsage.check_usage.input_tokens > 0 && ` · ${((projectUsage.check_usage.input_tokens + projectUsage.check_usage.output_tokens) / 1000).toFixed(1)}k tokens`}
                              </div>
                            </div>
                            <span className={`text-sm font-mono font-semibold ${theme.textPrimary}`}>
                              ${projectUsage.check_usage.estimated_cost.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`text-center py-8 ${theme.textSubtle}`}>
                      <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                      <p className="text-sm">No usage data for this project yet.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Current Session Usage */}
              <div className={`p-5 rounded-xl border ${theme.border}`}
                style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
                <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-4 flex items-center gap-2`}>
                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Current Session
                </h3>

                {!(parseCredits || parseUsage || chatUsage || complianceUsage) ? (
                  <div className={`text-center py-8 ${theme.textSubtle}`}>
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <p className="text-sm">No session usage yet.</p>
                    <p className="text-xs mt-1">Process a document to see usage statistics.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {parseCredits != null && parseCredits > 0 && (
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-sm ${theme.textMuted}`}>Parse (Landing AI)</span>
                        <span className={`text-sm font-mono font-medium ${theme.textSecondary}`}>{parseCredits} credits</span>
                      </div>
                    )}
                    {parseUsage && parseUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-sm ${theme.textMuted}`}>Parse (Claude Vision)</span>
                        <span className={`text-sm font-mono font-medium ${theme.textSecondary}`}>
                          {formatTokensWithCost(parseUsage.input_tokens, parseUsage.output_tokens, parseUsage.model)}
                        </span>
                      </div>
                    )}
                    {chatUsage && chatUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-sm ${theme.textMuted}`}>Chat</span>
                        <span className={`text-sm font-mono font-medium ${theme.textSecondary}`}>
                          {formatTokensWithCost(chatUsage.input_tokens, chatUsage.output_tokens, chatUsage.model)}
                        </span>
                      </div>
                    )}
                    {complianceUsage && complianceUsage.input_tokens > 0 && (
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-sm ${theme.textMuted}`}>Compliance</span>
                        <span className={`text-sm font-mono font-medium ${theme.textSecondary}`}>
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
                            <span className={`text-sm font-semibold ${theme.textSecondary}`}>Total</span>
                            <span className={`text-sm font-mono font-bold text-gradient`}>
                              {formatTokensWithCost(totalInput, totalOutput, model)}
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
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

/**
 * ChecksHelpModal - Full-screen overlay showing the Checks Reference documentation.
 *
 * Fetches check configuration from the backend and displays:
 * - Page types overview grid with color-coded cards
 * - Detailed check listings grouped by page type and category
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import { apiGet } from '../services/apiClient';

// ------- Types -------

interface PageTypeConfig {
  name: string;
  description: string;
  classification_signals?: string[];
}

interface CheckConfig {
  id: string;
  name: string;
  prompt: string;
  category: 'completeness' | 'compliance';
  applies_to: string[];
  required: boolean;
  rule_reference?: string;
}

interface ChecksConfigResponse {
  page_types: Record<string, PageTypeConfig>;
  checks: CheckConfig[];
}

// ------- Constants -------

const PAGE_TYPE_COLORS: Record<string, string> = {
  floor_plan: '#6366f1',
  site_plan: '#22c55e',
  elevation: '#f59e0b',
  section: '#ef4444',
  detail: '#ec4899',
  schedule: '#8b5cf6',
  cover_sheet: '#06b6d4',
  form: '#f97316',
  certificate: '#14b8a6',
  letter: '#84cc16',
  report: '#a855f7',
  photo: '#64748b',
  table: '#0ea5e9',
  specification: '#22c55e',
  unknown: '#94a3b8',
};

function formatPageType(pt: string): string {
  return pt
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ------- Props -------

interface ChecksHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// ------- Component -------

export default function ChecksHelpModal({ isOpen, onClose }: ChecksHelpModalProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [config, setConfig] = useState<ChecksConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch config when opened
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    apiGet<ChecksConfigResponse>('/api/checks/config')
      .then(setConfig)
      .catch((err) => setError(err.message || 'Failed to load checks config'))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Derive helper data
  const pageTypes = config?.page_types ?? {};
  const checks = config?.checks ?? [];

  // Count checks per page type
  const checkCountByPageType: Record<string, number> = {};
  for (const c of checks) {
    for (const pt of c.applies_to) {
      checkCountByPageType[pt] = (checkCountByPageType[pt] || 0) + 1;
    }
  }

  // Page types that have at least one check
  const pageTypesWithChecks = Object.keys(pageTypes).filter(
    (pt) => (checkCountByPageType[pt] || 0) > 0
  );

  // Group checks by page type then by category
  function getChecksForPageType(pt: string): { completeness: CheckConfig[]; compliance: CheckConfig[] } {
    const ptChecks = checks.filter((c) => c.applies_to.includes(pt));
    return {
      completeness: ptChecks.filter((c) => c.category === 'completeness'),
      compliance: ptChecks.filter((c) => c.category === 'compliance'),
    };
  }

  function scrollToSection(pt: string) {
    const el = document.getElementById(`pt-${pt}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div
        className="fixed inset-0 z-[201] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className={`
            relative w-full max-w-5xl max-h-[90vh] rounded-2xl border overflow-hidden flex flex-col
            ${theme.border}
          `}
          style={{
            background: isDark
              ? 'linear-gradient(180deg, #0f172a 0%, #030712 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: isDark
              ? '0 24px 64px rgba(0, 0, 0, 0.6)'
              : '0 24px 64px rgba(0, 0, 0, 0.15)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ---- Header ---- */}
          <div className={`flex items-center justify-between px-6 py-5 border-b ${theme.border} shrink-0`}>
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)',
                }}
              >
                <svg className="w-5 h-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.75}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <h2 className={`text-lg font-semibold ${theme.textPrimary}`}>Checks Reference</h2>
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

          {/* ---- Scrollable Body ---- */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {loading && (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin h-8 w-8 text-sky-500" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {error && (
              <div className={`p-4 rounded-xl border ${isDark ? 'border-red-500/30 bg-red-500/10 text-red-400' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {error}
              </div>
            )}

            {config && !loading && (
              <>
                {/* ---- Page Types Overview Grid ---- */}
                <section>
                  <h3 className={`text-sm font-semibold ${theme.textPrimary} mb-4 uppercase tracking-wider`}>
                    Page Types Overview
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(pageTypes).map(([ptId, pt]) => {
                      const count = checkCountByPageType[ptId] || 0;
                      const color = PAGE_TYPE_COLORS[ptId] || '#94a3b8';
                      return (
                        <button
                          key={ptId}
                          onClick={() => count > 0 && scrollToSection(ptId)}
                          disabled={count === 0}
                          className={`
                            text-left p-4 rounded-xl border transition-all duration-150
                            ${theme.border}
                            ${count > 0
                              ? isDark
                                ? 'hover:bg-slate-800/60 cursor-pointer'
                                : 'hover:bg-slate-50 cursor-pointer'
                              : 'opacity-50 cursor-default'
                            }
                          `}
                          style={{
                            borderLeftWidth: '4px',
                            borderLeftColor: color,
                            background: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.8)',
                          }}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-sm font-semibold ${theme.textPrimary}`}>
                              {pt.name || formatPageType(ptId)}
                            </span>
                            {count > 0 && (
                              <span
                                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                style={{ backgroundColor: color }}
                              >
                                {count}
                              </span>
                            )}
                          </div>
                          <p className={`text-xs ${theme.textMuted} line-clamp-2`}>
                            {pt.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* ---- Detail Sections ---- */}
                <section className="space-y-6">
                  <h3 className={`text-sm font-semibold ${theme.textPrimary} uppercase tracking-wider`}>
                    Checks by Page Type
                  </h3>

                  {pageTypesWithChecks.map((ptId) => {
                    const pt = pageTypes[ptId];
                    const color = PAGE_TYPE_COLORS[ptId] || '#94a3b8';
                    const { completeness, compliance } = getChecksForPageType(ptId);

                    return (
                      <div
                        key={ptId}
                        id={`pt-${ptId}`}
                        className={`rounded-xl border overflow-hidden ${theme.border}`}
                        style={{
                          background: isDark ? 'rgba(15, 23, 42, 0.4)' : 'rgba(255, 255, 255, 0.8)',
                        }}
                      >
                        {/* Page type header */}
                        <div
                          className="px-5 py-4"
                          style={{
                            borderLeft: `4px solid ${color}`,
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-3 h-3 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <h4 className={`text-base font-semibold ${theme.textPrimary}`}>
                              {pt?.name || formatPageType(ptId)}
                            </h4>
                          </div>
                          {pt?.description && (
                            <p className={`text-xs ${theme.textMuted} mt-1 ml-6`}>{pt.description}</p>
                          )}
                        </div>

                        {/* Completeness checks */}
                        {completeness.length > 0 && (
                          <div className={`border-t ${theme.border}`}>
                            <div className={`px-5 py-2.5 ${isDark ? 'bg-sky-500/5' : 'bg-sky-50/50'}`}>
                              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-sky-400' : 'text-sky-700'}`}>
                                Completeness ({completeness.length})
                              </span>
                            </div>
                            {completeness.map((check, idx) => (
                              <div
                                key={check.id}
                                className={`px-5 py-3 flex items-center justify-between ${
                                  idx !== completeness.length - 1 ? `border-b ${theme.border}` : ''
                                } ${isDark ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50/50'}`}
                              >
                                <span className={`text-sm ${theme.textPrimary}`}>{check.name}</span>
                                {check.required ? (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                    required
                                  </span>
                                ) : (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                                    optional
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Compliance checks */}
                        {compliance.length > 0 && (
                          <div className={`border-t ${theme.border}`}>
                            <div className={`px-5 py-2.5 ${isDark ? 'bg-purple-500/5' : 'bg-purple-50/50'}`}>
                              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                                Compliance ({compliance.length})
                              </span>
                            </div>
                            {compliance.map((check, idx) => (
                              <div
                                key={check.id}
                                className={`px-5 py-3 flex items-center justify-between gap-4 ${
                                  idx !== compliance.length - 1 ? `border-b ${theme.border}` : ''
                                } ${isDark ? 'hover:bg-slate-800/20' : 'hover:bg-slate-50/50'}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <span className={`text-sm ${theme.textPrimary}`}>{check.name}</span>
                                  {check.rule_reference && (
                                    <span className={`ml-2 text-xs ${theme.textMuted}`}>
                                      ({check.rule_reference})
                                    </span>
                                  )}
                                </div>
                                {check.required ? (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                    required
                                  </span>
                                ) : (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                                    optional
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

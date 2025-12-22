import { useState, useMemo } from 'react';
import type { Chunk } from '../types/ade';
import type { CheckResult, ComplianceReport, ComplianceCheck } from '../types/compliance';
import { API_URL } from '../config';
import { getMarkdownPreview } from '../utils/cleanMarkdown';
import { useTheme } from '../contexts/ThemeContext';
import { downloadDocumentReport } from '../services/checksService';

interface CompliancePanelProps {
  markdown: string;
  chunks: Chunk[];
  disabled: boolean;
  report: ComplianceReport | null;
  onReportChange: (report: ComplianceReport | null) => void;
  onChunkSelect: (chunkIds: string[], pageNumber?: number) => void;
  selectedModel: string;
  completenessChecks: ComplianceCheck[];
  complianceChecks: ComplianceCheck[];
  documentId?: string; // Optional document ID for PDF export
}

type StatusFilter = 'all' | 'pass' | 'fail' | 'needs_review' | 'na';

const getStatusConfig = (isDark: boolean) => ({
  pass: {
    bg: isDark ? 'bg-green-900/30' : 'bg-green-50',
    border: isDark ? 'border-green-700/50' : 'border-green-200',
    text: isDark ? 'text-green-400' : 'text-green-600',
    icon: '✓',
    iconBg: isDark ? 'bg-green-900/50' : 'bg-green-100',
    label: 'Pass',
  },
  fail: {
    bg: isDark ? 'bg-red-900/30' : 'bg-red-50',
    border: isDark ? 'border-red-700/50' : 'border-red-200',
    text: isDark ? 'text-red-400' : 'text-red-600',
    icon: '✗',
    iconBg: isDark ? 'bg-red-900/50' : 'bg-red-100',
    label: 'Fail',
  },
  needs_review: {
    bg: isDark ? 'bg-yellow-900/30' : 'bg-yellow-50',
    border: isDark ? 'border-yellow-700/50' : 'border-yellow-200',
    text: isDark ? 'text-yellow-400' : 'text-yellow-600',
    icon: '⚠',
    iconBg: isDark ? 'bg-yellow-900/50' : 'bg-yellow-100',
    label: 'Review',
  },
  na: {
    bg: isDark ? 'bg-slate-800/50' : 'bg-slate-100',
    border: isDark ? 'border-slate-700/50' : 'border-slate-200',
    text: isDark ? 'text-gray-500' : 'text-slate-500',
    icon: '—',
    iconBg: isDark ? 'bg-slate-700/50' : 'bg-slate-200',
    label: 'N/A',
  },
  pending: {
    bg: isDark ? 'bg-slate-800/50' : 'bg-slate-100',
    border: isDark ? 'border-slate-700/50' : 'border-slate-200',
    text: isDark ? 'text-gray-500' : 'text-slate-500',
    icon: '○',
    iconBg: isDark ? 'bg-slate-700/50' : 'bg-slate-200',
    label: 'Pending',
  },
});

// Create pending check results from config for display before running
function createPendingResults(checks: ComplianceCheck[], checkType: 'completeness' | 'compliance'): CheckResult[] {
  return checks.map(check => ({
    check_id: check.id,
    check_name: check.name,
    check_type: checkType,
    status: 'pending' as never, // We'll handle this specially
    confidence: 0,
    found_value: null,
    expected: null,
    notes: check.description,
    category: check.category,
    chunk_ids: [],
  }));
}

export default function CompliancePanel({
  markdown,
  chunks,
  disabled,
  report,
  onReportChange,
  onChunkSelect,
  selectedModel,
  completenessChecks,
  complianceChecks,
  documentId,
}: CompliancePanelProps) {
  const { isDark } = useTheme();
  const statusConfig = getStatusConfig(isDark);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'completeness' | 'compliance'>('completeness');
  const [error, setError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<CheckResult | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Pre-populated check lists from props
  const pendingCompletenessResults = useMemo(() =>
    createPendingResults(completenessChecks, 'completeness'),
    [completenessChecks]
  );
  const pendingComplianceResults = useMemo(() =>
    createPendingResults(complianceChecks, 'compliance'),
    [complianceChecks]
  );

  const runChecks = async () => {
    if (!markdown) return;

    setIsLoading(true);
    setError(null);
    setSelectedResult(null);

    try {
      const response = await fetch(`${API_URL}/api/compliance/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          chunks,
          completeness_checks: completenessChecks,
          compliance_checks: complianceChecks,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Compliance check failed');
      }

      const data = await response.json();
      onReportChange(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run compliance checks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRowClick = (result: CheckResult) => {
    // Don't allow selection of pending items
    if ((result.status as string) === 'pending') return;

    setSelectedResult(selectedResult?.check_id === result.check_id ? null : result);

    if (result.chunk_ids.length > 0) {
      // Find the page number from the first chunk
      const firstChunk = chunks.find(c => result.chunk_ids.includes(c.id));
      const pageNumber = firstChunk?.grounding?.page;
      onChunkSelect(result.chunk_ids, pageNumber !== undefined ? pageNumber + 1 : undefined);
    }
  };

  const renderStatusIcon = (status: CheckResult['status'] | 'pending') => {
    const config = statusConfig[status] || statusConfig.pending;
    return (
      <span className={`
        inline-flex items-center justify-center w-6 h-6 rounded-full
        ${config.iconBg} ${config.text} font-bold text-xs
      `}>
        {config.icon}
      </span>
    );
  };

  // Get filtered results based on status filter
  const getFilteredResults = (results: CheckResult[]) => {
    if (statusFilter === 'all') return results;
    return results.filter(r => r.status === statusFilter);
  };

  // Get the results to display (either from report or pending)
  const displayResults = useMemo(() => {
    if (report) {
      const results = activeTab === 'completeness'
        ? report.completeness_results
        : report.compliance_results;
      return getFilteredResults(results);
    }
    return activeTab === 'completeness'
      ? pendingCompletenessResults
      : pendingComplianceResults;
  }, [report, activeTab, statusFilter, pendingCompletenessResults, pendingComplianceResults]);

  const renderTable = (results: CheckResult[]) => {
    const isPending = !report;

    return (
      <div
        className={`border rounded-xl overflow-hidden ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}
        style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(248, 250, 252, 0.9)' }}
      >
        <table className="w-full text-sm">
          <thead
            className={`border-b ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}
            style={{ background: isDark ? 'rgba(2, 6, 23, 0.8)' : 'rgba(241, 245, 249, 0.9)' }}
          >
            <tr>
              <th className={`px-3 py-2 text-left font-medium w-10 ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>Status</th>
              <th className={`px-3 py-2 text-left font-medium ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>Check</th>
              <th className={`px-3 py-2 text-left font-medium w-16 ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>Source</th>
              <th className={`px-3 py-2 text-left font-medium w-20 ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>Confidence</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-slate-700/40' : 'divide-slate-200'}`}>
            {results.map((result) => {
              const status = (result.status as string) === 'pending' ? 'pending' : result.status;
              const config = statusConfig[status] || statusConfig.pending;
              const isSelected = selectedResult?.check_id === result.check_id;
              const hasChunks = result.chunk_ids.length > 0;

              return (
                <tr
                  key={result.check_id}
                  onClick={() => handleRowClick(result)}
                  className={`
                    transition-colors
                    ${isPending ? 'cursor-default' : 'cursor-pointer'}
                    ${isSelected ? (isDark ? 'bg-sky-900/30' : 'bg-sky-50') : isPending ? '' : (isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50')}
                    ${hasChunks || isPending ? '' : 'opacity-75'}
                  `}
                >
                  <td className="px-3 py-2">
                    {renderStatusIcon(status)}
                  </td>
                  <td className="px-3 py-2">
                    <div className={`font-medium ${isPending ? (isDark ? 'text-gray-500' : 'text-slate-400') : (isDark ? 'text-gray-200' : 'text-slate-800')}`}>
                      {result.check_name}
                    </div>
                    {isPending ? (
                      <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-400'}`}>{result.notes}</div>
                    ) : result.found_value ? (
                      <div className={`text-xs ${config.text}`}>
                        Found: {result.found_value}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {!isPending && hasChunks ? (
                      <span className="inline-flex items-center gap-1 text-xs text-sky-400 font-medium">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {result.chunk_ids.length}
                      </span>
                    ) : (
                      <span className={isDark ? 'text-gray-500' : 'text-slate-400'}>—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
                    {isPending ? '—' : result.confidence > 0 ? `${result.confidence}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDetailPanel = () => {
    if (!selectedResult) {
      return (
        <div
          className={`text-center py-6 border rounded-xl ${isDark ? 'text-gray-500 border-slate-700/40' : 'text-slate-500 border-slate-200'}`}
          style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(248, 250, 252, 0.9)' }}
        >
          <p className="text-sm">Select a check to view details and source components</p>
        </div>
      );
    }

    const config = statusConfig[selectedResult.status];
    const relevantChunks = chunks.filter(c => selectedResult.chunk_ids.includes(c.id));

    return (
      <div className={`p-4 rounded-xl border ${config.bg} ${config.border}`}>
        <div className="flex items-start gap-3 mb-3">
          {renderStatusIcon(selectedResult.status)}
          <div className="flex-1">
            <h4 className={`font-semibold ${config.text}`}>{selectedResult.check_name}</h4>
            <span className={`text-xs px-2 py-0.5 rounded-full ${config.iconBg} ${config.text}`}>
              {config.label}
            </span>
          </div>
          {selectedResult.confidence > 0 && (
            <span className={`text-sm ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{selectedResult.confidence}% confidence</span>
          )}
        </div>

        {selectedResult.found_value && (
          <div className="mb-2">
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>Found: </span>
            <span className={`text-sm font-medium ${config.text}`}>{selectedResult.found_value}</span>
          </div>
        )}

        {selectedResult.expected && (
          <div className="mb-2">
            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>Expected: </span>
            <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-slate-700'}`}>{selectedResult.expected}</span>
          </div>
        )}

        {selectedResult.notes && (
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-slate-600'} mb-3`}>{selectedResult.notes}</p>
        )}

        {relevantChunks.length > 0 && (
          <div className={`mt-3 pt-3 border-t ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'} mb-2`}>
              Source components ({relevantChunks.length}) — click to view in document:
            </p>
            <div className="space-y-2 max-h-40 overflow-auto">
              {relevantChunks.map((chunk) => {
                const pageNum = chunk.grounding?.page !== undefined ? chunk.grounding.page + 1 : null;
                return (
                  <div
                    key={chunk.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChunkSelect([chunk.id], pageNum || undefined);
                    }}
                    className={`p-2 rounded-lg border text-xs cursor-pointer transition-colors group ${
                      isDark
                        ? 'bg-slate-800/50 border-slate-700/40 text-gray-300 hover:border-sky-500/50 hover:bg-sky-900/30'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-sky-400 hover:bg-sky-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 flex-1">{getMarkdownPreview(chunk.markdown, 150)}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {pageNum && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            isDark
                              ? 'bg-slate-700/50 text-gray-500 group-hover:bg-sky-900/50 group-hover:text-sky-400'
                              : 'bg-slate-200 text-slate-500 group-hover:bg-sky-100 group-hover:text-sky-600'
                          }`}>
                            p.{pageNum}
                          </span>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded capitalize ${
                          isDark
                            ? 'bg-slate-700/50 text-gray-500 group-hover:bg-sky-900/50 group-hover:text-sky-400'
                            : 'bg-slate-200 text-slate-500 group-hover:bg-sky-100 group-hover:text-sky-600'
                        }`}>
                          {chunk.type}
                        </span>
                        <svg className={`w-3 h-3 ${isDark ? 'text-gray-500 group-hover:text-sky-400' : 'text-slate-400 group-hover:text-sky-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleFilterClick = (filter: StatusFilter) => {
    setStatusFilter(statusFilter === filter ? 'all' : filter);
    setSelectedResult(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-slate-800'}`}>Compliance Checks</h3>
        <button
          onClick={runChecks}
          disabled={disabled || isLoading}
          className="px-4 py-2 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          style={{
            background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
            boxShadow: '0 8px 20px rgba(56, 189, 248, 0.25)',
            border: '1px solid rgba(191, 219, 254, 0.3)'
          }}
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Analyzing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {report ? 'Re-run Checks' : 'Run All Checks'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className={`mb-3 p-3 rounded-xl text-sm ${
          isDark
            ? 'bg-red-900/30 border border-red-700/50 text-red-400'
            : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {error}
        </div>
      )}

      {/* Summary cards - clickable as filters */}
      {report && (
        <div className="grid grid-cols-5 gap-2 mb-3">
          <div
            onClick={() => handleFilterClick('all')}
            className={`rounded-xl p-2 text-center cursor-pointer transition-all ${
              statusFilter === 'all'
                ? (isDark ? 'bg-sky-900/40 border-2 border-sky-500' : 'bg-sky-100 border-2 border-sky-400')
                : (isDark ? 'bg-sky-900/20 border border-sky-700/50 hover:border-sky-600' : 'bg-sky-50 border border-sky-200 hover:border-sky-300')
            }`}
          >
            <div className={`text-xl font-bold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
              {report.summary.completeness_score}%
            </div>
            <div className={`text-xs ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>Complete</div>
          </div>
          <div
            onClick={() => handleFilterClick('pass')}
            className={`rounded-xl p-2 text-center cursor-pointer transition-all ${
              statusFilter === 'pass'
                ? (isDark ? 'bg-green-900/40 border-2 border-green-500' : 'bg-green-100 border-2 border-green-400')
                : (isDark ? 'bg-green-900/20 border border-green-700/50 hover:border-green-600' : 'bg-green-50 border border-green-200 hover:border-green-300')
            }`}
          >
            <div className={`text-xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              {report.summary.passed}
            </div>
            <div className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>Passed</div>
          </div>
          <div
            onClick={() => handleFilterClick('fail')}
            className={`rounded-xl p-2 text-center cursor-pointer transition-all ${
              statusFilter === 'fail'
                ? (isDark ? 'bg-red-900/40 border-2 border-red-500' : 'bg-red-100 border-2 border-red-400')
                : (isDark ? 'bg-red-900/20 border border-red-700/50 hover:border-red-600' : 'bg-red-50 border border-red-200 hover:border-red-300')
            }`}
          >
            <div className={`text-xl font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              {report.summary.failed}
            </div>
            <div className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>Failed</div>
          </div>
          <div
            onClick={() => handleFilterClick('needs_review')}
            className={`rounded-xl p-2 text-center cursor-pointer transition-all ${
              statusFilter === 'needs_review'
                ? (isDark ? 'bg-yellow-900/40 border-2 border-yellow-500' : 'bg-yellow-100 border-2 border-yellow-400')
                : (isDark ? 'bg-yellow-900/20 border border-yellow-700/50 hover:border-yellow-600' : 'bg-yellow-50 border border-yellow-200 hover:border-yellow-300')
            }`}
          >
            <div className={`text-xl font-bold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
              {report.summary.needs_review}
            </div>
            <div className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>Review</div>
          </div>
          <div
            onClick={() => handleFilterClick('na')}
            className={`rounded-xl p-2 text-center cursor-pointer transition-all ${
              statusFilter === 'na'
                ? (isDark ? 'bg-slate-700/50 border-2 border-slate-500' : 'bg-slate-200 border-2 border-slate-400')
                : (isDark ? 'bg-slate-800/50 border border-slate-700/50 hover:border-slate-600' : 'bg-slate-100 border border-slate-200 hover:border-slate-300')
            }`}
          >
            <div className={`text-xl font-bold ${isDark ? 'text-gray-400' : 'text-slate-600'}`}>
              {report.summary.na || 0}
            </div>
            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>N/A</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className={`flex border-b mb-3 ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
        <button
          onClick={() => { setActiveTab('completeness'); setSelectedResult(null); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'completeness'
              ? 'border-sky-400 text-sky-400'
              : (isDark ? 'border-transparent text-gray-500 hover:text-gray-300' : 'border-transparent text-slate-500 hover:text-slate-700')
          }`}
        >
          Completeness ({report ? report.completeness_results.length : completenessChecks.length})
        </button>
        <button
          onClick={() => { setActiveTab('compliance'); setSelectedResult(null); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'compliance'
              ? 'border-sky-400 text-sky-400'
              : (isDark ? 'border-transparent text-gray-500 hover:text-gray-300' : 'border-transparent text-slate-500 hover:text-slate-700')
          }`}
        >
          Compliance ({report ? report.compliance_results.length : complianceChecks.length})
        </button>
      </div>

      {/* Split view: Table on top, Details below */}
      <div className="flex-1 flex flex-col min-h-0 gap-3">
        {/* Table section - scrollable */}
        <div className="flex-1 overflow-auto min-h-[200px]">
          {renderTable(displayResults)}
          {report && displayResults.length === 0 && (
            <div className={`text-center py-8 ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
              <p className="text-sm">No {statusFilter === 'all' ? '' : statusFilter.replace('_', ' ')} checks found</p>
            </div>
          )}
        </div>

        {/* Detail panel - always visible */}
        <div className="flex-shrink-0">
          {renderDetailPanel()}
        </div>
      </div>

      {/* Footer */}
      {report && (
        <div className={`mt-3 pt-3 border-t flex items-center justify-between ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-sky-400 hover:text-sky-300 mr-2"
              >
                Clear filter
              </button>
            )}
            Click on a row to see details
          </p>
          <div className="flex items-center gap-3">
            {documentId && (
              <button
                onClick={async () => {
                  setIsExportingPdf(true);
                  try {
                    const blob = await downloadDocumentReport(documentId);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('Failed to download PDF:', err);
                  } finally {
                    setIsExportingPdf(false);
                  }
                }}
                disabled={isExportingPdf}
                className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1 disabled:opacity-50"
              >
                {isExportingPdf ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-400"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                PDF
              </button>
            )}
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
              }}
              className="text-sm text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

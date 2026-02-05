/**
 * Compliance Tab - Shows page-level check results with smart batching
 * Uses V3 page-level checks exclusively
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { DocumentCheckResult, CheckResultItem, CheckResultItemV3, PageClassification } from '../types/checksV2';
import type { Project, Document } from '../types/project';
import type { Chunk } from '../types/ade';
import { downloadDocumentReport, runDocumentChecksV3, getLatestCheckResultsV3 } from '../services/checksService';

// Page type display config
const PAGE_TYPE_COLORS: Record<string, string> = {
  floor_plan: '#3b82f6',
  site_plan: '#10b981',
  elevation: '#8b5cf6',
  section: '#f59e0b',
  detail: '#ec4899',
  schedule: '#06b6d4',
  cover_sheet: '#6366f1',
  form: '#84cc16',
  letter: '#14b8a6',
  certificate: '#f97316',
  report: '#a855f7',
  photo: '#64748b',
  table: '#0ea5e9',
  specification: '#22c55e',
  unknown: '#94a3b8',
};

interface ComplianceTabV2Props {
  project: Project | null;
  document: Document | null;
  chunks?: Chunk[];
  onChunkSelect?: (chunkIds: string[], pageNumber?: number) => void;
}

const STATUS_CONFIG = {
  pass: { icon: '✓', color: 'text-green-500', bgColor: 'bg-green-100 dark:bg-green-900/30', label: 'Pass' },
  fail: { icon: '✗', color: 'text-red-500', bgColor: 'bg-red-100 dark:bg-red-900/30', label: 'Fail' },
  needs_review: { icon: '?', color: 'text-amber-500', bgColor: 'bg-amber-100 dark:bg-amber-900/30', label: 'Review' },
  na: { icon: '—', color: 'text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800/50', label: 'N/A' },
};

export default function ComplianceTabV2({
  project: _project,
  document,
  chunks,
  onChunkSelect,
}: ComplianceTabV2Props) {
  // Note: project is kept in props for future use (e.g., project-specific check configs)
  void _project;
  const { isDark } = useTheme();
  const [results, setResults] = useState<DocumentCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'completeness' | 'compliance'>('completeness');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [showFindings, setShowFindings] = useState(true);
  const [pageClassifications, setPageClassifications] = useState<PageClassification[]>([]);
  const [pageFilter, setPageFilter] = useState<number | null>(null);

  // Load check results when document changes
  const loadResults = useCallback(async () => {
    if (!document) {
      setResults(null);
      setPageClassifications([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getLatestCheckResultsV3(document.id);
      if (response.has_results && response.id) {
        const v3Results = response as any;
        setResults({
          id: v3Results.id,
          run_number: v3Results.run_number,
          document_type: v3Results.document_type || 'mixed',
          completeness_results: v3Results.completeness_results || [],
          compliance_results: v3Results.compliance_results || [],
          summary: v3Results.summary,
          usage: v3Results.usage,
          checked_at: v3Results.checked_at,
        });
        // Map page_number (from API) to page (used by frontend)
        const mappedClassifications = (v3Results.page_classifications || [])
          .map((c: { page_number?: number; page?: number; page_type: string; confidence?: number }) => ({
            page: c.page_number ?? c.page ?? 0,
            page_type: c.page_type as PageClassification['page_type'],
            confidence: c.confidence ?? 0,
          }))
          .filter((c: { page: number }) => c.page > 0) as PageClassification[];
        setPageClassifications(mappedClassifications);
      } else {
        setResults(null);
        setPageClassifications([]);
      }
    } catch (err) {
      console.error('Failed to load check results:', err);
      setError('Failed to load check results');
    } finally {
      setIsLoading(false);
    }
  }, [document]);

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // Run checks for this document
  const handleRunChecks = async () => {
    if (!document) return;

    setIsRunning(true);
    setError(null);

    try {
      const response = await runDocumentChecksV3(document.id, { use_v3_checks: true });
      // Map V3 results to display format
      const mapV3ToV2 = (items: CheckResultItemV3[]): CheckResultItem[] =>
        items.map(item => ({
          ...item,
          check_type: item.category as 'completeness' | 'compliance',
        }));
      setResults({
        id: response.id,
        run_number: response.run_number,
        document_type: 'mixed',
        completeness_results: mapV3ToV2(response.completeness_results),
        compliance_results: mapV3ToV2(response.compliance_results),
        summary: response.summary,
        usage: response.usage,
        checked_at: response.checked_at,
      });
      // Map page_number (from API) to page (used by frontend)
      const mappedClassifications = (response.page_classifications || [])
        .map((c: { page_number?: number; page?: number; page_type: string; confidence?: number }) => ({
          page: c.page_number ?? c.page ?? 0,
          page_type: c.page_type as PageClassification['page_type'],
          confidence: c.confidence ?? 0,
        }))
        .filter((c: { page: number }) => c.page > 0) as PageClassification[];
      setPageClassifications(mappedClassifications);
    } catch (err) {
      console.error('Failed to run checks:', err);
      setError('Failed to run checks. Make sure the document has been processed first.');
    } finally {
      setIsRunning(false);
    }
  };

  // Handle export to PDF
  const handleExportPdf = async () => {
    if (!document) return;

    setIsExportingPdf(true);
    try {
      const blob = await downloadDocumentReport(document.id);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `compliance-report-${document.original_filename.replace(/\.[^/.]+$/, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setError('Failed to export PDF report');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Toggle check expansion
  const toggleCheck = (checkId: string) => {
    setExpandedChecks(prev => {
      const next = new Set(prev);
      if (next.has(checkId)) {
        next.delete(checkId);
      } else {
        next.add(checkId);
      }
      return next;
    });
  };

  // Handle clicking on source chunks
  const handleChunkClick = (check: CheckResultItem) => {
    if (!check.chunk_ids?.length || !onChunkSelect || !chunks) return;

    // Find the page number from the first chunk
    const firstChunk = chunks.find(c => check.chunk_ids.includes(c.id));
    const pageNumber = firstChunk?.grounding?.page;
    onChunkSelect(check.chunk_ids, pageNumber !== undefined ? pageNumber + 1 : undefined);
  };

  // Get current checks based on active tab
  const currentChecks = results
    ? (activeTab === 'completeness' ? results.completeness_results : results.compliance_results)
    : [];

  // Filter by status and page if set
  let filteredChecks = currentChecks;
  if (statusFilter) {
    filteredChecks = filteredChecks.filter(c => c.status === statusFilter);
  }
  if (pageFilter !== null) {
    filteredChecks = filteredChecks.filter(c => (c as unknown as CheckResultItemV3).page_number === pageFilter);
  }

  // Render status badge
  const renderStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.na;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    );
  };

  // No document selected
  if (!document) {
    return (
      <div className={`h-full flex flex-col items-center justify-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>Select a document to view check results</p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Compliance Checks
          </h3>
          {results && (
            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Run #{results.run_number} • {new Date(results.checked_at).toLocaleString()}
              {pageClassifications.length > 0 && ` • ${pageClassifications.length} pages classified`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {results && (
            <button
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-700 hover:bg-slate-600 text-gray-200'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              } disabled:opacity-50`}
            >
              {isExportingPdf ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              PDF
            </button>
          )}
          <button
            onClick={handleRunChecks}
            disabled={isRunning}
            className="px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            style={{
              background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
            }}
          >
            {isRunning ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Running...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {results ? 'Re-run' : 'Run Checks'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          isDark ? 'bg-red-900/30 border border-red-700/50 text-red-400' : 'bg-red-50 border border-red-200 text-red-600'
        }`}>
          {error}
        </div>
      )}

      {/* No results state */}
      {!results && !error && (
        <div className={`flex-1 flex flex-col items-center justify-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p className="text-lg font-medium mb-2">No check results yet</p>
          <p className="text-sm opacity-75 mb-4">Run checks to analyze document compliance</p>
        </div>
      )}

      {/* Results display */}
      {results && (
        <>
          {/* Summary bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2">
              <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                Overall Results
              </span>
              <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                {results.summary.passed} passed / {results.summary.total_checks} total
              </span>
            </div>
            <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
              <div
                className="bg-green-500 h-full transition-all"
                style={{ width: `${(results.summary.passed / Math.max(results.summary.total_checks, 1)) * 100}%` }}
              />
              <div
                className="bg-red-500 h-full transition-all"
                style={{ width: `${(results.summary.failed / Math.max(results.summary.total_checks, 1)) * 100}%` }}
              />
              <div
                className="bg-amber-400 h-full transition-all"
                style={{ width: `${(results.summary.needs_review / Math.max(results.summary.total_checks, 1)) * 100}%` }}
              />
            </div>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Pass: {results.summary.passed}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Fail: {results.summary.failed}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Review: {results.summary.needs_review}
              </span>
              {results.summary.na > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-400" /> N/A: {results.summary.na}
                </span>
              )}
            </div>
          </div>

          {/* Tabs row with Show Findings toggle */}
          <div className={`flex items-center justify-between border-b mb-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex">
              <button
                onClick={() => { setActiveTab('completeness'); setStatusFilter(null); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'completeness'
                    ? 'border-sky-500 text-sky-500'
                    : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
                }`}
              >
                Completeness ({results.completeness_results.length})
              </button>
              <button
                onClick={() => { setActiveTab('compliance'); setStatusFilter(null); }}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === 'compliance'
                    ? 'border-sky-500 text-sky-500'
                    : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`
                }`}
              >
                Compliance ({results.compliance_results.length})
              </button>
            </div>
            {/* Show/Hide Findings toggle - moved here */}
            <button
              onClick={() => setShowFindings(!showFindings)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors mb-1 ${
                showFindings
                  ? isDark ? 'bg-slate-700 text-gray-300' : 'bg-slate-200 text-slate-700'
                  : isDark ? 'bg-slate-800 text-gray-500' : 'bg-slate-100 text-slate-500'
              }`}
              title={showFindings ? 'Hide findings' : 'Show findings'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {showFindings ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                )}
              </svg>
              {showFindings ? 'Hide' : 'Show'} Findings
            </button>
          </div>

          {/* Page Classifications Filter */}
          {pageClassifications.length > 0 && (
            <div className={`mb-3 p-2 rounded-lg ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Pages:</span>
                <button
                  onClick={() => setPageFilter(null)}
                  className={`px-2 py-0.5 rounded text-xs transition-colors ${
                    pageFilter === null
                      ? 'bg-sky-500 text-white'
                      : isDark ? 'bg-slate-700 text-gray-300 hover:bg-slate-600' : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All
                </button>
                {pageClassifications.map(pc => {
                  const color = PAGE_TYPE_COLORS[pc.page_type] || PAGE_TYPE_COLORS.unknown;
                  const isActive = pageFilter === pc.page;
                  return (
                    <button
                      key={pc.page}
                      onClick={() => setPageFilter(isActive ? null : pc.page)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors flex items-center gap-1 ${
                        isActive
                          ? 'text-white'
                          : isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-white hover:bg-gray-100'
                      }`}
                      style={isActive ? { backgroundColor: color } : undefined}
                      title={`${pc.page_type} (${pc.confidence}% confidence)`}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: isActive ? 'white' : color }}
                      />
                      P{pc.page}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status filters - legend style like PDFViewer */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-medium mr-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Results:</span>
            {([
              { status: 'pass' as const, color: '#22c55e' },
              { status: 'fail' as const, color: '#ef4444' },
              { status: 'needs_review' as const, color: '#f59e0b' },
              { status: 'na' as const, color: '#9ca3af' },
            ]).map(({ status, color }) => {
              const config = STATUS_CONFIG[status];
              const count = currentChecks.filter(c => c.status === status).length;
              if (count === 0) return null;
              const isActive = statusFilter === null || statusFilter === status;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${
                    isActive
                      ? isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                      : isDark ? 'bg-gray-800 opacity-50 hover:opacity-75' : 'bg-gray-50 opacity-50 hover:opacity-75'
                  }`}
                  style={statusFilter === status ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
                  title={`${statusFilter === status ? 'Show all' : `Filter by ${config.label}`}`}
                >
                  <span
                    className="w-3 h-3 rounded transition-colors flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: isActive ? color : `${color}80` }}
                  >
                    {config.icon}
                  </span>
                  <span className={isActive ? (isDark ? 'text-gray-200' : 'text-gray-700') : (isDark ? 'text-gray-500' : 'text-gray-400')}>{config.label}</span>
                  <span className={`text-[10px] ${isActive ? (isDark ? 'text-gray-400' : 'text-gray-500') : (isDark ? 'text-gray-600' : 'text-gray-400')}`}>({count})</span>
                </button>
              );
            })}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className={`px-2 py-1 text-xs ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Show all
              </button>
            )}
          </div>

          {/* Check items */}
          <div className="flex-1 overflow-auto space-y-2">
            {filteredChecks.map((check, idx) => {
              const hasChunks = check.chunk_ids && check.chunk_ids.length > 0;
              // V3 page info - cast through unknown for type safety
              const v3Check = check as unknown as CheckResultItemV3;
              const pageNum = v3Check.page_number;
              const pageType = v3Check.page_type;
              const pageColor = pageType ? (PAGE_TYPE_COLORS[pageType] || PAGE_TYPE_COLORS.unknown) : null;
              // Use unique key combining check_id and page for V3 results
              const uniqueKey = pageNum ? `${check.check_id}-p${pageNum}-${idx}` : check.check_id;

              return (
                <div
                  key={uniqueKey}
                  className={`border rounded-lg overflow-hidden ${
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <button
                    onClick={() => toggleCheck(uniqueKey as string)}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors ${
                      isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {renderStatusBadge(check.status)}
                      {/* Page badge for V3 */}
                      {pageNum && pageColor && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                          style={{ backgroundColor: pageColor }}
                          title={pageType || ''}
                        >
                          P{pageNum}
                        </span>
                      )}
                      <span className={`font-medium text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {check.check_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {check.confidence !== undefined && check.confidence > 0 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
                          {check.confidence}%
                        </span>
                      )}
                      {hasChunks && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>
                          {check.chunk_ids.length} source{check.chunk_ids.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-500'} ${expandedChecks.has(uniqueKey) ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {expandedChecks.has(uniqueKey) && (
                    <div className={`px-3 pb-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <div className="pt-2 space-y-2 text-sm">
                        {/* Check question with Q: prefix */}
                        <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                          <span className={`font-semibold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>Q: </span>
                          <span className={isDark ? 'text-gray-200' : 'text-gray-700'}>{check.check_name}</span>
                        </div>
                        {/* Findings/Notes - conditionally shown */}
                        {showFindings && (
                          <>
                            {check.notes && (
                              <div>
                                <span className={`font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Findings: </span>
                                <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>{check.notes}</span>
                              </div>
                            )}
                            {check.found_value && (
                              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                <span className="font-medium">Found:</span> {check.found_value}
                              </p>
                            )}
                            {check.rule_reference && (
                              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                <span className="font-medium">Rule:</span> {check.rule_reference}
                              </p>
                            )}
                          </>
                        )}
                        {hasChunks && onChunkSelect && (
                          <button
                            onClick={() => handleChunkClick(check)}
                            className="text-sky-500 hover:text-sky-400 text-xs flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View in document
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {filteredChecks.length === 0 && (
              <p className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No checks match the current filter
              </p>
            )}
          </div>

          {/* Footer with usage info */}
          {results.usage && (
            <div className={`mt-3 pt-3 text-xs border-t ${isDark ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
              Model: {results.usage.model} | Tokens: {results.usage.input_tokens?.toLocaleString()} in / {results.usage.output_tokens?.toLocaleString()} out
            </div>
          )}
        </>
      )}
    </div>
  );
}

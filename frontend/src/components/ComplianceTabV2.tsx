/**
 * V2 Compliance Tab - Shows check results from the database
 * Displays results from batch checks run from the Dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import type { DocumentCheckResult, CheckResultItem } from '../types/checksV2';
import type { Project, Document } from '../types/project';
import type { Chunk } from '../types/ade';
import { getLatestCheckResults, runDocumentChecks, downloadDocumentReport } from '../services/checksService';

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

  // Load check results when document changes
  const loadResults = useCallback(async () => {
    if (!document) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await getLatestCheckResults(document.id);
      if (response.has_results && response.id) {
        setResults(response as DocumentCheckResult);
      } else {
        setResults(null);
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
      const response = await runDocumentChecks(document.id);
      // Convert RunChecksResponse to DocumentCheckResult format
      setResults({
        id: response.id,
        run_number: response.run_number,
        document_type: response.document_type,
        completeness_results: response.completeness_results,
        compliance_results: response.compliance_results,
        summary: response.summary,
        usage: response.usage,
        checked_at: response.checked_at,
      });
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

  // Filter by status if set
  const filteredChecks = statusFilter
    ? currentChecks.filter(c => c.status === statusFilter)
    : currentChecks;

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
              {results.document_type && ` • Type: ${results.document_type}`}
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

          {/* Tabs */}
          <div className={`flex border-b mb-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
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

          {/* Status filters */}
          <div className="flex gap-2 mb-3">
            {(['pass', 'fail', 'needs_review', 'na'] as const).map(status => {
              const config = STATUS_CONFIG[status];
              const count = currentChecks.filter(c => c.status === status).length;
              if (count === 0) return null;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    statusFilter === status
                      ? `${config.bgColor} ${config.color} ring-2 ring-current ring-offset-1`
                      : `${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} hover:opacity-80`
                  }`}
                >
                  {config.label} ({count})
                </button>
              );
            })}
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className={`px-2 py-1 text-xs ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Clear
              </button>
            )}
          </div>

          {/* Check items */}
          <div className="flex-1 overflow-auto space-y-2">
            {filteredChecks.map((check) => {
              const isExpanded = expandedChecks.has(check.check_id);
              const hasChunks = check.chunk_ids && check.chunk_ids.length > 0;

              return (
                <div
                  key={check.check_id}
                  className={`border rounded-lg overflow-hidden ${
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <button
                    onClick={() => toggleCheck(check.check_id)}
                    className={`w-full px-3 py-2 flex items-center justify-between text-left transition-colors ${
                      isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {renderStatusBadge(check.status)}
                      <span className={`font-medium text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                        {check.check_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasChunks && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-100 text-sky-600'}`}>
                          {check.chunk_ids.length} source{check.chunk_ids.length > 1 ? 's' : ''}
                        </span>
                      )}
                      <svg
                        className={`w-4 h-4 transition-transform ${isDark ? 'text-gray-400' : 'text-gray-500'} ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className={`px-3 pb-3 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                      <div className="pt-2 space-y-2 text-sm">
                        {check.notes && (
                          <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>{check.notes}</p>
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
                        {check.confidence !== undefined && check.confidence > 0 && (
                          <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                            <span className="font-medium">Confidence:</span> {check.confidence}%
                          </p>
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

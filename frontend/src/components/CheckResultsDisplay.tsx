/**
 * Component for displaying document check results
 */
import { useState } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { CheckResultItem, CheckResultSummary, DocumentCheckResult } from '../types/checksV2';

interface CheckResultsDisplayProps {
  results: DocumentCheckResult | null;
  onChunkClick?: (chunkIds: string[]) => void;
  onDownloadReport?: () => void;
  isLoading?: boolean;
}

const STATUS_CONFIG: Record<string, { icon: string; color: string; bgColor: string; label: string }> = {
  pass: { icon: '✓', color: 'text-green-600', bgColor: 'bg-green-100', label: 'Pass' },
  fail: { icon: '✗', color: 'text-red-600', bgColor: 'bg-red-100', label: 'Fail' },
  needs_review: { icon: '?', color: 'text-amber-600', bgColor: 'bg-amber-100', label: 'Review' },
  na: { icon: '—', color: 'text-gray-500', bgColor: 'bg-gray-100', label: 'N/A' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.na;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

function SummaryBar({ summary }: { summary: CheckResultSummary }) {
  const total = summary.total_checks || 1;
  const passPercent = (summary.passed / total) * 100;
  const failPercent = (summary.failed / total) * 100;
  const reviewPercent = (summary.needs_review / total) * 100;

  return (
    <div className="mb-4">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">Overall Progress</span>
        <span className="text-gray-500">
          {summary.passed} passed / {summary.total_checks} checks
        </span>
      </div>
      <div className="h-3 rounded-full bg-gray-200 overflow-hidden flex">
        <div className="bg-green-500 h-full" style={{ width: `${passPercent}%` }} title={`Passed: ${summary.passed}`} />
        <div className="bg-red-500 h-full" style={{ width: `${failPercent}%` }} title={`Failed: ${summary.failed}`} />
        <div className="bg-amber-400 h-full" style={{ width: `${reviewPercent}%` }} title={`Needs Review: ${summary.needs_review}`} />
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Pass: {summary.passed}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Fail: {summary.failed}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" /> Review: {summary.needs_review}
        </span>
        {summary.na > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" /> N/A: {summary.na}
          </span>
        )}
      </div>
    </div>
  );
}

function CheckItem({
  check,
  onChunkClick,
}: {
  check: CheckResultItem;
  onChunkClick?: (chunkIds: string[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isDark } = useTheme();

  return (
    <div className={`
      border rounded-lg mb-2 overflow-hidden
      ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'}
    `}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full px-3 py-2 flex items-center justify-between text-left
          ${isDark ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'}
        `}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <StatusBadge status={check.status} />
          <span className={`font-medium text-sm truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            {check.check_name}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
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
            {check.confidence !== undefined && (
              <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                <span className="font-medium">Confidence:</span> {check.confidence}%
              </p>
            )}
            {check.chunk_ids && check.chunk_ids.length > 0 && onChunkClick && (
              <button
                onClick={() => onChunkClick(check.chunk_ids)}
                className="text-sky-500 hover:text-sky-600 text-xs flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View in document ({check.chunk_ids.length} location{check.chunk_ids.length > 1 ? 's' : ''})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckResultsDisplay({
  results,
  onChunkClick,
  onDownloadReport,
  isLoading = false,
}: CheckResultsDisplayProps) {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'completeness' | 'compliance'>('completeness');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
      </div>
    );
  }

  if (!results) {
    return (
      <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <p>No check results yet</p>
        <p className="text-sm mt-1 opacity-75">Run compliance checks to see results here</p>
      </div>
    );
  }

  const currentChecks = activeTab === 'completeness'
    ? results.completeness_results
    : results.compliance_results;

  const filteredChecks = statusFilter
    ? currentChecks.filter(c => c.status === statusFilter)
    : currentChecks;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Run #{results.run_number} - {new Date(results.checked_at).toLocaleString()}
        </div>
        {onDownloadReport && (
          <button
            onClick={onDownloadReport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-sky-500 text-white hover:bg-sky-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            PDF Report
          </button>
        )}
      </div>

      {/* Summary */}
      <SummaryBar summary={results.summary} />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('completeness')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'completeness'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Completeness ({results.completeness_results.length})
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            activeTab === 'compliance'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Compliance ({results.compliance_results.length})
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        {['pass', 'fail', 'needs_review', 'na'].map(status => {
          const config = STATUS_CONFIG[status];
          const count = currentChecks.filter(c => c.status === status).length;
          if (count === 0) return null;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? null : status)}
              className={`
                px-2 py-1 rounded text-xs font-medium transition-colors
                ${statusFilter === status
                  ? `${config.bgColor} ${config.color} ring-2 ring-offset-1 ring-current`
                  : `${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} hover:opacity-80`
                }
              `}
            >
              {config.label} ({count})
            </button>
          );
        })}
        {statusFilter && (
          <button
            onClick={() => setStatusFilter(null)}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {/* Check items */}
      <div className="space-y-1">
        {filteredChecks.map((check) => (
          <CheckItem
            key={check.check_id}
            check={check}
            onChunkClick={onChunkClick}
          />
        ))}
        {filteredChecks.length === 0 && (
          <p className={`text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            No checks match the current filter
          </p>
        )}
      </div>

      {/* Usage info */}
      {results.usage && (
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          Model: {results.usage.model} | Tokens: {results.usage.input_tokens?.toLocaleString()} in / {results.usage.output_tokens?.toLocaleString()} out
        </div>
      )}
    </div>
  );
}

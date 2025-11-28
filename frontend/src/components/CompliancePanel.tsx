import { useState } from 'react';
import type { Chunk } from '../types/ade';
import type { CheckResult, ComplianceReport } from '../types/compliance';
import complianceConfig from '../config/complianceChecks.json';
import { API_URL } from '../config';

interface CompliancePanelProps {
  markdown: string;
  chunks: Chunk[];
  disabled: boolean;
  onChunkSelect: (chunkIds: string[]) => void;
}

const statusConfig = {
  pass: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: '\u2713',
    iconBg: 'bg-green-100',
    label: 'Pass',
  },
  fail: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: '\u2717',
    iconBg: 'bg-red-100',
    label: 'Fail',
  },
  needs_review: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: '\u26A0',
    iconBg: 'bg-yellow-100',
    label: 'Needs Review',
  },
};

export default function CompliancePanel({
  markdown,
  chunks,
  disabled,
  onChunkSelect,
}: CompliancePanelProps) {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'completeness' | 'compliance'>('completeness');
  const [error, setError] = useState<string | null>(null);
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);

  const runChecks = async () => {
    if (!markdown) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/compliance/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown,
          chunks,
          completeness_checks: complianceConfig.completeness_checks,
          compliance_checks: complianceConfig.compliance_checks,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Compliance check failed');
      }

      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run compliance checks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResultClick = (result: CheckResult) => {
    setSelectedCheckId(result.check_id);

    if ((result.status === 'pass' || result.status === 'needs_review') && result.chunk_ids.length > 0) {
      onChunkSelect(result.chunk_ids);
    }
  };

  const renderResultCard = (result: CheckResult) => {
    const config = statusConfig[result.status];
    const isSelected = selectedCheckId === result.check_id;
    const isClickable = (result.status === 'pass' || result.status === 'needs_review') && result.chunk_ids.length > 0;

    return (
      <div
        key={result.check_id}
        onClick={() => handleResultClick(result)}
        className={`
          p-3 rounded-lg border transition-all
          ${config.bg} ${config.border}
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
          ${isClickable ? 'cursor-pointer hover:shadow-md' : 'cursor-default'}
        `}
      >
        <div className="flex items-start gap-3">
          <span className={`
            flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center
            ${config.iconBg} ${config.text} font-bold text-sm
          `}>
            {config.icon}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium ${config.text}`}>
                {result.check_name}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${config.iconBg} ${config.text}`}>
                {config.label}
              </span>
              {result.confidence > 0 && (
                <span className="text-xs text-gray-500">
                  {result.confidence}% confidence
                </span>
              )}
            </div>

            {result.found_value && (result.status === 'pass' || result.status === 'needs_review') && (
              <div className="mt-1 text-sm">
                <span className="text-gray-500">Found: </span>
                <span className={`font-medium ${config.text}`}>{result.found_value}</span>
              </div>
            )}

            {result.notes && (
              <p className="mt-1 text-sm text-gray-600">{result.notes}</p>
            )}

            {isClickable && (
              <p className="mt-1 text-xs text-blue-500 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Click to view in document
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderResults = (results: CheckResult[]) => {
    const categories = [...new Set(results.map(r => r.category))];

    return (
      <div className="space-y-6">
        {categories.map(category => (
          <div key={category}>
            <h4 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
              {category.replace(/_/g, ' ')}
            </h4>
            <div className="space-y-2">
              {results
                .filter(r => r.category === category)
                .map(result => renderResultCard(result))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Compliance Checks</h3>
        <button
          onClick={runChecks}
          disabled={disabled || isLoading}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
              Run All Checks
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {report && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {report.summary.completeness_score}%
            </div>
            <div className="text-xs text-blue-600">Complete</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">
              {report.summary.passed}
            </div>
            <div className="text-xs text-green-600">Passed</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">
              {report.summary.failed}
            </div>
            <div className="text-xs text-red-600">Failed</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">
              {report.summary.needs_review}
            </div>
            <div className="text-xs text-yellow-600">Review</div>
          </div>
        </div>
      )}

      {report && (
        <div className="flex border-b mb-4">
          <button
            onClick={() => setActiveTab('completeness')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'completeness'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Completeness ({report.completeness_results.length})
          </button>
          <button
            onClick={() => setActiveTab('compliance')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'compliance'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Compliance ({report.compliance_results.length})
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!report && !isLoading && (
          <div className="text-center text-gray-400 py-12">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <p className="font-medium">Click "Run All Checks" to analyze</p>
            <p className="text-sm mt-1">10 completeness + 10 compliance checks</p>
          </div>
        )}

        {report && activeTab === 'completeness' && renderResults(report.completeness_results)}
        {report && activeTab === 'compliance' && renderResults(report.compliance_results)}
      </div>

      {report && (
        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Click on Pass/Review items to highlight in PDF
          </p>
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `compliance-report-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
            }}
            className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </button>
        </div>
      )}
    </div>
  );
}

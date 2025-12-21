/**
 * Component for displaying batch check progress and results
 */
import { useState, useEffect } from 'react';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { BatchCheckRun, BatchCheckRunSummary } from '../types/checksV2';
import { getBatchRunStatus, downloadBatchReport } from '../services/checksService';

interface BatchCheckProgressProps {
  batchRunId: string;
  onComplete?: () => void;
  onClose?: () => void;
}

export default function BatchCheckProgress({
  batchRunId,
  onComplete,
  onClose,
}: BatchCheckProgressProps) {
  const { isDark } = useTheme();
  const [batchRun, setBatchRun] = useState<BatchCheckRun | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const status = await getBatchRunStatus(batchRunId);
        setBatchRun(status);

        if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
          setIsPolling(false);
          onComplete?.();
        }
      } catch (error) {
        console.error('Failed to fetch batch status:', error);
      }
    };

    fetchStatus();

    if (isPolling) {
      pollInterval = setInterval(fetchStatus, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [batchRunId, isPolling, onComplete]);

  const handleDownloadReport = async () => {
    setIsDownloading(true);
    try {
      const blob = await downloadBatchReport(batchRunId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `batch_report_${batchRunId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download report:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!batchRun) {
    return (
      <div className={`
        rounded-lg p-4
        ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
      `}>
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky-500" />
          <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading batch status...</span>
        </div>
      </div>
    );
  }

  const isRunning = batchRun.status === 'pending' || batchRun.status === 'processing';
  const isComplete = batchRun.status === 'completed';
  const isFailed = batchRun.status === 'failed';

  return (
    <div className={`
      rounded-lg overflow-hidden
      ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}
    `}>
      {/* Header */}
      <div className={`
        px-4 py-3 flex items-center justify-between
        ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}
      `}>
        <div className="flex items-center gap-2">
          {isRunning && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-sky-500" />
          )}
          {isComplete && (
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {isFailed && (
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
            Batch Compliance Check
          </span>
        </div>
        {onClose && !isRunning && (
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="p-4 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className={isDark ? 'text-gray-300' : 'text-gray-600'}>
              {isRunning ? 'Processing documents...' :
               isComplete ? 'Complete' :
               isFailed ? 'Failed' : batchRun.status}
            </span>
            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
              {batchRun.progress.completed} / {batchRun.progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                isFailed ? 'bg-red-500' : isComplete ? 'bg-green-500' : 'bg-sky-500'
              }`}
              style={{ width: `${batchRun.progress.percent}%` }}
            />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-3 text-center">
          <div className={`p-2 rounded ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="text-lg font-bold text-green-500">{batchRun.progress.completed}</div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Completed</div>
          </div>
          <div className={`p-2 rounded ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="text-lg font-bold text-red-500">{batchRun.progress.failed}</div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Failed</div>
          </div>
          <div className={`p-2 rounded ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="text-lg font-bold text-gray-500">{batchRun.progress.skipped}</div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Skipped</div>
          </div>
          <div className={`p-2 rounded ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="text-lg font-bold text-sky-500">{batchRun.progress.total}</div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Total</div>
          </div>
        </div>

        {/* Results summary (when complete) */}
        {isComplete && (
          <div className={`p-3 rounded ${isDark ? 'bg-gray-700/30' : 'bg-gray-50'}`}>
            <div className="text-sm font-medium mb-2">Check Results</div>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Passed: {batchRun.summary.total_passed}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Failed: {batchRun.summary.total_failed}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Review: {batchRun.summary.total_needs_review}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        {isComplete && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDownloadReport}
              disabled={isDownloading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Download PDF Report
                </>
              )}
            </button>
          </div>
        )}

        {/* Timestamps */}
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} space-y-1`}>
          {batchRun.started_at && (
            <div>Started: {new Date(batchRun.started_at).toLocaleString()}</div>
          )}
          {batchRun.completed_at && (
            <div>Completed: {new Date(batchRun.completed_at).toLocaleString()}</div>
          )}
        </div>
      </div>
    </div>
  );
}


// Compact list view for showing batch run history
interface BatchRunsListProps {
  runs: BatchCheckRunSummary[];
  onSelect?: (runId: string) => void;
}

export function BatchRunsList({ runs, onSelect }: BatchRunsListProps) {
  const { isDark } = useTheme();

  if (runs.length === 0) {
    return (
      <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
        No batch runs yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const isComplete = run.status === 'completed';
        const isFailed = run.status === 'failed';
        const isRunning = run.status === 'pending' || run.status === 'processing';

        return (
          <button
            key={run.id}
            onClick={() => onSelect?.(run.id)}
            className={`
              w-full text-left p-3 rounded-lg border transition-colors
              ${isDark
                ? 'bg-gray-800 border-gray-700 hover:bg-gray-700'
                : 'bg-white border-gray-200 hover:bg-gray-50'}
            `}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {isRunning && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-sky-500" />}
                {isComplete && <span className="w-3 h-3 rounded-full bg-green-500" />}
                {isFailed && <span className="w-3 h-3 rounded-full bg-red-500" />}
                <span className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                  {run.completed_documents} / {run.total_documents} documents
                </span>
              </div>
              <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {new Date(run.created_at).toLocaleDateString()}
              </span>
            </div>
            {isComplete && (
              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                {run.total_passed} passed, {run.total_failed} failed, {run.total_needs_review} review
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

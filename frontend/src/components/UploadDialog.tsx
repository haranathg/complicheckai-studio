import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import type { Project } from '../types/project';

interface UploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadToProject: () => void;
  onUploadWithoutProject: () => void;
  currentProject: Project | null;
  fileName: string;
  isUploading: boolean;
}

export default function UploadDialog({
  isOpen,
  onClose,
  onUploadToProject,
  onUploadWithoutProject,
  currentProject,
  fileName,
  isUploading,
}: UploadDialogProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center z-50 p-4 ${isDark ? 'bg-black/70' : 'bg-black/50'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) {
          onClose();
        }
      }}
    >
      <div
        className={`rounded-xl shadow-2xl max-w-md w-full border ${theme.border}`}
        style={{ background: isDark ? '#0f172a' : '#ffffff' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${theme.border}`}>
          <h3 className={`text-lg font-semibold ${theme.textPrimary}`}>Upload Document</h3>
          <button
            onClick={onClose}
            disabled={isUploading}
            className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-slate-700/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className={`flex items-center gap-3 p-3 rounded-lg border ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : '#f8fafc' }}>
            <svg className={`w-8 h-8 ${theme.textSubtle}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${theme.textPrimary} truncate`}>{fileName}</p>
              <p className={`text-xs ${theme.textSubtle}`}>Ready to upload</p>
            </div>
          </div>

          <p className={`text-sm ${theme.textMuted}`}>
            How would you like to upload this document?
          </p>

          <div className="space-y-2">
            {currentProject && (
              <button
                onClick={onUploadToProject}
                disabled={isUploading}
                className="w-full p-3 rounded-lg text-left transition-all flex items-center gap-3 text-white disabled:opacity-70"
                style={{
                  background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                  boxShadow: '0 4px 12px rgba(56, 189, 248, 0.25)',
                }}
              >
                {isUploading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="font-medium">Uploading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <div>
                      <p className="font-medium">Add to "{currentProject.name}"</p>
                      <p className="text-xs opacity-80">Save document and parse results to project</p>
                    </div>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onUploadWithoutProject}
              disabled={isUploading}
              className={`w-full p-3 rounded-lg text-left transition-all flex items-center gap-3 border ${theme.border} disabled:opacity-50 ${
                isDark
                  ? 'bg-slate-800/60 hover:bg-slate-700/60 text-gray-300'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <svg className={`w-5 h-5 ${theme.textSubtle}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <p className={`font-medium ${theme.textSecondary}`}>
                  {currentProject ? 'View only (don\'t save)' : 'Open document'}
                </p>
                <p className={`text-xs ${theme.textSubtle}`}>
                  {currentProject ? 'Parse without saving to project' : 'Parse document without project storage'}
                </p>
              </div>
            </button>
          </div>

          {!currentProject && (
            <p className={`text-xs ${theme.textSubtle} text-center`}>
              Tip: Select a project first to save documents and cache parse results
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

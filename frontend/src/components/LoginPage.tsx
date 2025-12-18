import { useState } from 'react';
import { validateAccessKey, setAuthenticated } from '../utils/auth';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import cognaifyLogo from '../assets/Cognaify-logo-white-bg.png';

interface LoginPageProps {
  onAuthenticated: () => void;
}

export default function LoginPage({ onAuthenticated }: LoginPageProps) {
  const { isDark, toggleTheme } = useTheme();
  const theme = getThemeStyles(isDark);
  const [accessKey, setAccessKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsValidating(true);

    // Small delay to prevent brute force
    await new Promise(resolve => setTimeout(resolve, 500));

    if (validateAccessKey(accessKey)) {
      setAuthenticated();
      onAuthenticated();
    } else {
      setError('Invalid access key. Please check and try again.');
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: theme.pageBg }}>
      <div
        className={`max-w-md w-full p-8 rounded-2xl border ${theme.border}`}
        style={{
          background: theme.cardBg,
          boxShadow: isDark ? '0 12px 35px rgba(15, 23, 42, 0.7)' : '0 12px 35px rgba(100, 116, 139, 0.2)'
        }}
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="text-center">
            <h1 className={`text-2xl font-semibold ${theme.textPrimary}`}>
              CompliCheck<span className="bg-gradient-to-r from-sky-400 via-purple-500 to-orange-500 bg-clip-text text-transparent">AI</span><sup className={`text-[10px] ${theme.textMuted} ml-0.5`}>TM</sup>
            </h1>
            <p className={`text-sm ${theme.textMuted} mt-1`}>
              Document Compliance Studio
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="text-center mb-8">
          <p className={`${theme.textMuted} text-sm leading-relaxed`}>
            AI-powered document compliance checking for building consent applications.
          </p>
          <p className={`${theme.textSubtle} text-xs mt-3`}>
            Enter your access key to continue.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="accessKey" className={`block text-sm font-medium ${theme.textSecondary} mb-2`}>
              Access Key
            </label>
            <input
              type="password"
              id="accessKey"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="Enter your access key"
              className={`w-full px-4 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all ${theme.textPrimary} ${isDark ? 'placeholder-gray-500' : 'placeholder-slate-400'}`}
              disabled={isValidating}
              autoFocus
            />
          </div>

          {error && (
            <div className={`p-3 ${isDark ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-red-100 border-red-300 text-red-600'} border rounded-xl text-sm`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!accessKey.trim() || isValidating}
            className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            style={{
              background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
              boxShadow: '0 12px 30px rgba(56, 189, 248, 0.3)',
              border: '1px solid rgba(191, 219, 254, 0.5)'
            }}
          >
            {isValidating ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                Validating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className={`mt-8 pt-6 border-t ${theme.border} text-center relative`}>
          <p className={`text-xs ${theme.textSubtle}`}>
            Need access? Contact your administrator.
          </p>
          <p className={`text-xs ${theme.textSubtle} mt-2 flex items-center justify-center gap-1`}>
            Powered by <a href="https://cognaify.com" target="_blank" rel="noopener noreferrer" className="flex items-center"><img src={cognaifyLogo} alt="Cognaify Solutions" className="h-4 object-contain" /></a>
          </p>
          {/* Hidden theme toggle hotspot - 10x10px area below powered by */}
          <button
            onClick={toggleTheme}
            className="mt-2 w-[10px] h-[10px] cursor-default opacity-0 mx-auto block"
            title=""
            aria-label="Toggle theme"
          />
        </div>
      </div>
    </div>
  );
}

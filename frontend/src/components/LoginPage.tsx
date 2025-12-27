/**
 * LoginPage - Cognito email/password authentication.
 *
 * Features:
 * - Email/password sign in
 * - New password challenge handling (first login with temp password)
 * - Error display with friendly messages
 * - Loading states
 * - Hidden theme toggle (for demo)
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import cognaifyLogo from '../assets/Cognaify-logo-white-bg.png';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

export default function LoginPage() {
  const { signIn, completeNewPassword, error, clearError, isLoading, requiresNewPassword } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const theme = getThemeStyles(isDark);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter your email and password.');
      return;
    }

    const result = await signIn(email.trim(), password);

    if (result.requiresNewPassword) {
      setPassword(''); // Clear temp password
    } else if (!result.success && result.error) {
      // Map Cognito errors to friendly messages
      let friendlyError = result.error;
      if (result.error.includes('Incorrect username or password')) {
        friendlyError = 'Invalid email or password. Please try again.';
      } else if (result.error.includes('User does not exist')) {
        friendlyError = 'No account found with this email address.';
      } else if (result.error.includes('User is not confirmed')) {
        friendlyError = 'Your account is not yet confirmed. Please contact your administrator.';
      } else if (result.error.includes('Password attempts exceeded')) {
        friendlyError = 'Too many failed attempts. Please try again later.';
      }
      setLocalError(friendlyError);
    }
  };

  const handleNewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!newPassword.trim()) {
      setLocalError('Please enter a new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    // Validate password requirements (matching Cognito policy: 8 chars minimum)
    if (newPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    const result = await completeNewPassword(newPassword);

    if (!result.success && result.error) {
      setLocalError(result.error);
    }
  };

  const displayError = localError || error;

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
            {requiresNewPassword ? 'Please set a new password to continue.' : 'Sign in with your email and password.'}
          </p>
        </div>

        {/* New Password Form */}
        {requiresNewPassword ? (
          <form onSubmit={handleNewPasswordSubmit} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className={`block text-sm font-medium ${theme.textSecondary} mb-2`}>
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className={`w-full px-4 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all ${theme.textPrimary} ${isDark ? 'placeholder-gray-500' : 'placeholder-slate-400'}`}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={`block text-sm font-medium ${theme.textSecondary} mb-2`}>
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className={`w-full px-4 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all ${theme.textPrimary} ${isDark ? 'placeholder-gray-500' : 'placeholder-slate-400'}`}
                disabled={isLoading}
              />
            </div>

            <div className={`text-xs ${theme.textMuted}`}>
              <p>Password must be at least 8 characters.</p>
            </div>

            {displayError && (
              <div className={`p-3 ${isDark ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-red-100 border-red-300 text-red-600'} border rounded-xl text-sm`}>
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={!newPassword.trim() || !confirmPassword.trim() || isLoading}
              className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              style={{
                background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                boxShadow: '0 12px 30px rgba(56, 189, 248, 0.3)',
                border: '1px solid rgba(191, 219, 254, 0.5)'
              }}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Setting Password...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Set Password
                </>
              )}
            </button>
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className={`block text-sm font-medium ${theme.textSecondary} mb-2`}>
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className={`w-full px-4 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all ${theme.textPrimary} ${isDark ? 'placeholder-gray-500' : 'placeholder-slate-400'}`}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className={`block text-sm font-medium ${theme.textSecondary} mb-2`}>
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={`w-full px-4 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none transition-all ${theme.textPrimary} ${isDark ? 'placeholder-gray-500' : 'placeholder-slate-400'}`}
                disabled={isLoading}
              />
            </div>

            {displayError && (
              <div className={`p-3 ${isDark ? 'bg-red-900/30 border-red-700/50 text-red-400' : 'bg-red-100 border-red-300 text-red-600'} border rounded-xl text-sm`}>
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={!email.trim() || !password.trim() || isLoading}
              className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              style={{
                background: 'radial-gradient(circle at top left, #38bdf8, #6366f1 45%, #a855f7 100%)',
                boxShadow: '0 12px 30px rgba(56, 189, 248, 0.3)',
                border: '1px solid rgba(191, 219, 254, 0.5)'
              }}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  Signing In...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className={`mt-8 pt-6 border-t ${theme.border} text-center relative`}>
          <p className={`text-xs ${theme.textSubtle}`}>
            Need access? Contact your administrator.
          </p>
          <p className={`text-xs ${theme.textSubtle} mt-2 flex items-center justify-center gap-1`}>
            Powered by <a href="https://cognaify.com" target="_blank" rel="noopener noreferrer" className="flex items-center"><img src={cognaifyLogo} alt="Cognaify Solutions" className="h-4 object-contain" /></a>
          </p>
          <p className={`text-xs ${theme.textMuted} mt-1`}>
            v{APP_VERSION}
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

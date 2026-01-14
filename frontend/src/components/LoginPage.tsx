/**
 * LoginPage - Cognito email/password authentication.
 *
 * Features:
 * - Email/password sign in
 * - New password challenge handling (first login with temp password)
 * - Error display with friendly messages
 * - Loading states
 * - Hidden theme toggle (for demo)
 * - Refined animations and visual polish
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import cognaifyLogo from '../assets/Cognaify-logo-white-bg.png';
import packageJson from '../../package.json';

const APP_VERSION = packageJson.version;

// Animated background dots component
function BackgroundDecoration({ isDark }: { isDark: boolean }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Gradient orbs */}
      <div 
        className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-30 blur-3xl animate-pulse-soft"
        style={{ 
          background: 'radial-gradient(circle, rgba(14, 165, 233, 0.4) 0%, transparent 70%)',
          animationDuration: '4s'
        }}
      />
      <div 
        className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-25 blur-3xl animate-pulse-soft"
        style={{ 
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.4) 0%, transparent 70%)',
          animationDuration: '5s',
          animationDelay: '1s'
        }}
      />
      {/* Grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 1px, transparent 1px),
            linear-gradient(90deg, ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 1px, transparent 1px)
          `,
          backgroundSize: '64px 64px'
        }}
      />
    </div>
  );
}

// Loading spinner component
function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
      <circle 
        className="opacity-25" 
        cx="12" cy="12" r="10" 
        stroke="currentColor" 
        strokeWidth="3"
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { signIn, completeNewPassword, error, clearError, isLoading, requiresNewPassword } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const theme = getThemeStyles(isDark);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isAnimated, setIsAnimated] = useState(false);

  // Trigger entrance animation
  useEffect(() => {
    const timer = setTimeout(() => setIsAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

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

  const inputClasses = `
    w-full px-4 py-3.5 text-sm rounded-xl border
    transition-all duration-200 ease-out
    focus:outline-none focus:ring-2
    ${isDark
      ? 'bg-slate-900/80 border-slate-700/60 text-white placeholder:text-slate-500 focus:border-sky-500/60 focus:ring-sky-500/20'
      : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/15'
    }
  `;

  const labelClasses = `block text-sm font-medium mb-2 ${theme.textSecondary}`;

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ background: theme.pageBg }}
    >
      <BackgroundDecoration isDark={isDark} />

      {/* Main card */}
      <div
        className={`
          relative max-w-md w-full p-8 rounded-2xl border backdrop-blur-sm
          transition-all duration-500 ease-out
          ${isDark ? 'border-slate-700/50' : 'border-slate-200/80'}
          ${isAnimated ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
        `}
        style={{
          background: isDark 
            ? 'linear-gradient(135deg, rgba(30, 58, 138, 0.2) 0%, rgba(15, 23, 42, 0.95) 100%)'
            : 'linear-gradient(135deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.95) 100%)',
          boxShadow: isDark 
            ? '0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset'
            : '0 24px 64px rgba(100, 116, 139, 0.15), 0 0 0 1px rgba(255,255,255,0.8) inset'
        }}
      >
        {/* Logo / Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            {/* Glow effect behind logo */}
            <div 
              className="absolute inset-0 blur-2xl opacity-60 rounded-full"
              style={{ 
                background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%)',
                transform: 'scale(2)'
              }}
            />
            {/* Icon */}
            <div className="relative w-12 h-12 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
                boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3)'
              }}
            >
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
          </div>
          <h1 className={`text-2xl font-semibold tracking-tight ${theme.textPrimary}`}>
            CompliCheck<span className="text-gradient">AI</span>
            <sup className={`text-[9px] ${theme.textMuted} ml-0.5 font-normal`}>TM</sup>
          </h1>
          <p className={`text-sm ${theme.textMuted} mt-1.5`}>
            Document Compliance Studio
          </p>
        </div>

        {/* Description */}
        <div className="text-center mb-8">
          <p className={`${theme.textMuted} text-sm leading-relaxed`}>
            AI-powered document compliance checking for building consent applications.
          </p>
          <p className={`${theme.textSubtle} text-xs mt-3`}>
            {requiresNewPassword 
              ? 'Please set a new password to continue.' 
              : 'Sign in with your credentials to continue.'}
          </p>
        </div>

        {/* New Password Form */}
        {requiresNewPassword ? (
          <form onSubmit={handleNewPasswordSubmit} className="space-y-5">
            <div>
              <label htmlFor="newPassword" className={labelClasses}>
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className={inputClasses}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className={labelClasses}>
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className={inputClasses}
                disabled={isLoading}
              />
            </div>

            <p className={`text-xs ${theme.textSubtle}`}>
              Password must be at least 8 characters.
            </p>

            {displayError && (
              <div 
                className={`
                  p-4 rounded-xl text-sm border animate-fade-in
                  ${isDark 
                    ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                    : 'bg-red-50 border-red-200 text-red-600'}
                `}
              >
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {displayError}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!newPassword.trim() || !confirmPassword.trim() || isLoading}
              className="
                w-full py-3.5 rounded-xl font-semibold text-white 
                disabled:opacity-50 disabled:cursor-not-allowed 
                transition-all duration-200 ease-out
                flex items-center justify-center gap-2.5
                hover:shadow-lg active:scale-[0.98]
              "
              style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
                boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
              }}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner />
                  <span>Setting Password...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Set Password</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className={labelClasses}>
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClasses}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className={labelClasses}>
                Password
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className={inputClasses}
                disabled={isLoading}
              />
            </div>

            {displayError && (
              <div 
                className={`
                  p-4 rounded-xl text-sm border animate-fade-in
                  ${isDark 
                    ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                    : 'bg-red-50 border-red-200 text-red-600'}
                `}
              >
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  {displayError}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!email.trim() || !password.trim() || isLoading}
              className="
                w-full py-3.5 rounded-xl font-semibold text-white 
                disabled:opacity-50 disabled:cursor-not-allowed 
                transition-all duration-200 ease-out
                flex items-center justify-center gap-2.5
                hover:shadow-lg active:scale-[0.98]
              "
              style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
                boxShadow: '0 8px 24px rgba(14, 165, 233, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)'
              }}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer */}
        <div className={`mt-8 pt-6 border-t ${theme.border} text-center`}>
          <p className={`text-xs ${theme.textSubtle}`}>
            Need access? Contact your administrator.
          </p>
          <div className={`mt-4 flex items-center justify-center gap-2`}>
            <span className={`text-xs ${theme.textSubtle}`}>Powered by</span>
            <a 
              href="https://cognaify.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center hover:opacity-80 transition-opacity"
            >
              <img src={cognaifyLogo} alt="Cognaify Solutions" className="h-4 object-contain" />
            </a>
          </div>
          <p className={`text-[10px] ${theme.textSubtle} mt-2 font-mono`}>
            v{APP_VERSION}
          </p>
          
          {/* Hidden theme toggle hotspot - 20x20px area */}
          <button
            onClick={toggleTheme}
            className="mt-3 w-5 h-5 cursor-default opacity-0 mx-auto block"
            title=""
            aria-label="Toggle theme"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * UserMenu - Displays user avatar, name, role, and sign out button.
 *
 * Features:
 * - User avatar with initials and gradient
 * - Display name and role badge
 * - Sign out functionality
 * - Dropdown menu with smooth animations
 * - Refined visual polish
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';
import ChecksHelpModal from './ChecksHelpModal';

// Role badge colors - more refined palette
const ROLE_COLORS: Record<UserRole, { 
  bg: string; 
  text: string; 
  darkBg: string; 
  darkText: string;
  gradient: string;
}> = {
  admin: { 
    bg: 'bg-violet-100', 
    text: 'text-violet-700', 
    darkBg: 'bg-violet-500/15', 
    darkText: 'text-violet-400',
    gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)'
  },
  reviewer: { 
    bg: 'bg-sky-100', 
    text: 'text-sky-700', 
    darkBg: 'bg-sky-500/15', 
    darkText: 'text-sky-400',
    gradient: 'linear-gradient(135deg, #0ea5e9, #38bdf8)'
  },
  viewer: { 
    bg: 'bg-slate-100', 
    text: 'text-slate-600', 
    darkBg: 'bg-slate-700/50', 
    darkText: 'text-slate-400',
    gradient: 'linear-gradient(135deg, #64748b, #94a3b8)'
  },
};

interface UserMenuProps {
  compact?: boolean; // Show only avatar and dropdown
  className?: string;
}

export default function UserMenu({ compact = false, className = '' }: UserMenuProps) {
  const { user, signOut, isLoading } = useAuth();
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  const [isOpen, setIsOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isChecksHelpOpen, setIsChecksHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle animation timing
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!user || isLoading) {
    return null;
  }

  // Get initials for avatar
  const initials = user.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  // Get display name
  const displayName = user.name || user.email.split('@')[0];

  // Role colors
  const roleColors = ROLE_COLORS[user.role] || ROLE_COLORS.viewer;

  const handleSignOut = async () => {
    setIsOpen(false);
    await signOut();
  };

  return (
    <>
    <div ref={menuRef} className={`relative ${className}`}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2.5 px-2 py-1.5 rounded-xl
          transition-all duration-150 ease-out
          ${isDark
            ? 'hover:bg-slate-800/60'
            : 'hover:bg-slate-100'
          }
          ${isOpen 
            ? isDark ? 'bg-slate-800/60' : 'bg-slate-100' 
            : ''
          }
        `}
      >
        {/* Avatar */}
        <div
          className="relative w-8 h-8 rounded-lg flex items-center justify-center text-sm font-semibold text-white shadow-md"
          style={{
            background: roleColors.gradient,
          }}
        >
          {initials}
          {/* Online indicator */}
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" />
        </div>

        {/* Name and role (hidden in compact mode) */}
        {!compact && (
          <div className="flex flex-col items-start min-w-0">
            <span className={`text-sm font-medium ${theme.textPrimary} leading-tight truncate max-w-[120px]`}>
              {displayName}
            </span>
            <span className={`text-xs ${isDark ? roleColors.darkText : roleColors.text} capitalize leading-tight`}>
              {user.role}
            </span>
          </div>
        )}

        {/* Dropdown arrow */}
        <svg
          className={`
            w-4 h-4 ${theme.textMuted} 
            transition-transform duration-200 ease-out
            ${isOpen ? 'rotate-180' : ''}
          `}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isAnimating && (
        <div
          className={`
            absolute right-0 mt-2 w-64 rounded-xl shadow-xl border py-1 z-[100]
            transition-all duration-200 ease-out origin-top-right
            ${theme.border}
            ${isOpen 
              ? 'opacity-100 scale-100 translate-y-0' 
              : 'opacity-0 scale-95 -translate-y-2 pointer-events-none'
            }
          `}
          style={{
            background: isDark ? '#1e293b' : 'white',
            boxShadow: isDark 
              ? '0 16px 48px rgba(0, 0, 0, 0.5)' 
              : '0 16px 48px rgba(0, 0, 0, 0.12)'
          }}
        >
          {/* User Info Header */}
          <div className={`px-4 py-3.5 border-b ${theme.border}`}>
            <div className="flex items-center gap-3">
              {/* Large avatar */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-semibold text-white shadow-md"
                style={{
                  background: roleColors.gradient,
                }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${theme.textPrimary} truncate`}>
                  {displayName}
                </p>
                <p className={`text-xs ${theme.textMuted} truncate`}>
                  {user.email}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <span
                className={`
                  inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-md capitalize
                  ${isDark
                    ? `${roleColors.darkBg} ${roleColors.darkText}`
                    : `${roleColors.bg} ${roleColors.text}`
                  }
                `}
              >
                <span 
                  className="w-1.5 h-1.5 rounded-full mr-1.5" 
                  style={{ background: roleColors.gradient.replace('linear-gradient(135deg, ', '').split(',')[0] }}
                />
                {user.role}
              </span>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1.5">
            {/* Account Settings (placeholder for future) */}
            <button
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-sm
                transition-colors duration-150
                ${isDark
                  ? 'text-slate-300 hover:bg-slate-800/60'
                  : 'text-slate-700 hover:bg-slate-50'
                }
              `}
              onClick={() => {/* Future: Open account settings */}}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Account Settings
            </button>

            {/* Checks Reference */}
            <button
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-sm
                transition-colors duration-150
                ${isDark
                  ? 'text-slate-300 hover:bg-slate-800/60'
                  : 'text-slate-700 hover:bg-slate-50'
                }
              `}
              onClick={() => {
                setIsChecksHelpOpen(true);
                setIsOpen(false);
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Checks Reference
            </button>

            {/* Divider */}
            <div className={`my-1.5 border-t ${theme.border}`} />

            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 text-sm
                transition-colors duration-150
                ${isDark
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-red-600 hover:bg-red-50'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
    <ChecksHelpModal isOpen={isChecksHelpOpen} onClose={() => setIsChecksHelpOpen(false)} />
    </>
  );
}

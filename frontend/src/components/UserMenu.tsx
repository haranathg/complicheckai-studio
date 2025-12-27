/**
 * UserMenu - Displays user avatar, name, role, and sign out button.
 *
 * Features:
 * - User avatar with initials
 * - Display name and role badge
 * - Sign out functionality
 * - Dropdown menu for additional options
 */

import { useState, useRef, useEffect } from 'react';
import { useAuth, type UserRole } from '../contexts/AuthContext';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';

// Role badge colors
const ROLE_COLORS: Record<UserRole, { bg: string; text: string; darkBg: string; darkText: string }> = {
  admin: { bg: 'bg-purple-100', text: 'text-purple-700', darkBg: 'bg-purple-900/50', darkText: 'text-purple-400' },
  reviewer: { bg: 'bg-blue-100', text: 'text-blue-700', darkBg: 'bg-blue-900/50', darkText: 'text-blue-400' },
  viewer: { bg: 'bg-gray-100', text: 'text-gray-700', darkBg: 'bg-gray-700', darkText: 'text-gray-400' },
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
    <div ref={menuRef} className={`relative ${className}`}>
      {/* User Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
          isDark
            ? 'hover:bg-slate-700/50'
            : 'hover:bg-slate-100'
        }`}
      >
        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium text-white"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          }}
        >
          {initials}
        </div>

        {/* Name and role (hidden in compact mode) */}
        {!compact && (
          <div className="flex flex-col items-start">
            <span className={`text-sm font-medium ${theme.textPrimary} leading-tight`}>
              {displayName}
            </span>
            <span className={`text-xs ${isDark ? roleColors.darkText : roleColors.text} capitalize`}>
              {user.role}
            </span>
          </div>
        )}

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 ${theme.textMuted} transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-56 rounded-xl shadow-lg border ${theme.border} py-1 z-50`}
          style={{
            background: isDark ? 'rgb(30, 41, 59)' : 'white',
          }}
        >
          {/* User Info Header */}
          <div className={`px-4 py-3 border-b ${theme.border}`}>
            <p className={`text-sm font-medium ${theme.textPrimary}`}>
              {displayName}
            </p>
            <p className={`text-xs ${theme.textMuted} truncate`}>
              {user.email}
            </p>
            <span
              className={`inline-block mt-1.5 px-2 py-0.5 text-xs rounded-full capitalize ${
                isDark
                  ? `${roleColors.darkBg} ${roleColors.darkText}`
                  : `${roleColors.bg} ${roleColors.text}`
              }`}
            >
              {user.role}
            </span>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {/* Sign Out */}
            <button
              onClick={handleSignOut}
              className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                isDark
                  ? 'text-red-400 hover:bg-red-900/20'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import type { TabType } from '../types/ade';
import { useTheme, getThemeStyles } from '../contexts/ThemeContext';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  disabled?: boolean;
  onSettingsClick?: () => void;
}

const TABS: { id: TabType; label: string; icon: React.ReactNode }[] = [
  {
    id: 'parse',
    label: 'Parse Results',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'review',
    label: 'Review',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  {
    id: 'compliance',
    label: 'Checks',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

// Tabs that should always be enabled (even without a document)
const ALWAYS_ENABLED_TABS: TabType[] = ['parse'];

export default function TabNavigation({ activeTab, onTabChange, disabled, onSettingsClick }: TabNavigationProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);

  return (
    <div className={`border-b ${theme.border}`} style={{ background: isDark ? 'rgba(2, 6, 23, 0.6)' : 'rgba(255, 255, 255, 0.8)' }}>
      <nav className="flex -mb-px items-center">
        {TABS.map((tab) => {
          const isDisabled = disabled && !ALWAYS_ENABLED_TABS.includes(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              disabled={isDisabled}
              className={`
                flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.id
                  ? 'border-sky-400 text-sky-400'
                  : `border-transparent ${theme.textMuted} hover:${theme.textSecondary} hover:border-gray-600`
                }
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
        {/* Settings button - aligned to right */}
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className={`ml-auto mr-4 p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-700/50 text-gray-400 hover:text-gray-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'}`}
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </nav>
    </div>
  );
}

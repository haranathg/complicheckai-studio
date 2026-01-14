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
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'compliance',
    label: 'Checks',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: 'review',
    label: 'Review',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
    <div 
      className={`border-b ${theme.border} relative`} 
      style={{ 
        background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)'
      }}
    >
      <nav className="flex items-center px-2">
        {/* Tab buttons */}
        <div className="flex items-center">
          {TABS.map((tab) => {
            const isDisabled = disabled && !ALWAYS_ENABLED_TABS.includes(tab.id);
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                disabled={isDisabled}
                className={`
                  relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium
                  transition-all duration-200 ease-out
                  ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${isActive
                    ? 'text-sky-500'
                    : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-800'
                  }
                `}
              >
                {/* Icon */}
                <span className={`transition-colors duration-200 ${isActive ? 'text-sky-500' : ''}`}>
                  {tab.icon}
                </span>
                
                {/* Label */}
                <span className="relative">
                  {tab.label}
                </span>
                
                {/* Active indicator - bottom border with glow */}
                {isActive && (
                  <span 
                    className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
                      boxShadow: '0 0 12px rgba(14, 165, 233, 0.5)'
                    }}
                  />
                )}
                
                {/* Hover background */}
                {!isActive && !isDisabled && (
                  <span 
                    className={`
                      absolute inset-x-1 inset-y-1.5 rounded-lg -z-10
                      transition-colors duration-150
                      ${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-100/80'}
                    `}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings button */}
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className={`
              group relative p-2.5 rounded-lg mr-2
              transition-all duration-150 ease-out
              ${isDark 
                ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
            `}
            title="Settings"
          >
            <svg 
              className="w-5 h-5 transition-transform duration-300 ease-out group-hover:rotate-45" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.75} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
              />
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={1.75} 
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
              />
            </svg>
          </button>
        )}
      </nav>
    </div>
  );
}

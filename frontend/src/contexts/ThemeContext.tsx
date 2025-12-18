import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'ccai-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage on initial load
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return (stored === 'light' || stored === 'dark') ? stored : 'light';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

// Theme styles for easy access
export const themeStyles = {
  dark: {
    // Backgrounds
    pageBg: 'radial-gradient(circle at top, #111827 0%, #020617 55%, #000 100%)',
    headerBg: 'rgba(2, 6, 23, 0.8)',
    footerBg: 'rgba(2, 6, 23, 0.8)',
    panelBg: 'rgba(2, 6, 23, 0.6)',
    panelBgAlt: 'rgba(2, 6, 23, 0.4)',
    cardBg: 'radial-gradient(circle at top left, rgba(30, 64, 175, 0.35), #020617 65%)',
    // Borders
    border: 'border-slate-700/40',
    // Text
    textPrimary: 'text-white',
    textSecondary: 'text-gray-300',
    textMuted: 'text-gray-400',
    textSubtle: 'text-gray-500',
    // Inputs
    inputBg: 'bg-slate-800/60',
    inputBorder: 'border-slate-600/50',
    // Buttons
    buttonBg: 'bg-slate-700/60',
    buttonHover: 'hover:bg-slate-600/60',
  },
  light: {
    // Backgrounds - soft off-white/cream
    pageBg: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%)',
    headerBg: 'rgba(248, 250, 252, 0.95)',
    footerBg: 'rgba(248, 250, 252, 0.95)',
    panelBg: 'rgba(255, 255, 255, 0.8)',
    panelBgAlt: 'rgba(248, 250, 252, 0.6)',
    cardBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(241, 245, 249, 0.95))',
    // Borders
    border: 'border-slate-300/60',
    // Text
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textMuted: 'text-slate-600',
    textSubtle: 'text-slate-500',
    // Inputs
    inputBg: 'bg-white/80',
    inputBorder: 'border-slate-300/70',
    // Buttons
    buttonBg: 'bg-slate-200/80',
    buttonHover: 'hover:bg-slate-300/80',
  }
};

// Helper to get current theme styles
export function getThemeStyles(isDark: boolean) {
  return isDark ? themeStyles.dark : themeStyles.light;
}

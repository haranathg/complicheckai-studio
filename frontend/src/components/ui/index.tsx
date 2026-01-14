/**
 * Shared UI Components - Polished, reusable components for consistent design
 */
import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useTheme, getThemeStyles } from '../../contexts/ThemeContext';

// ============================================================================
// Button Components
// ============================================================================

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    variant = 'primary', 
    size = 'md', 
    isLoading, 
    leftIcon, 
    rightIcon, 
    children, 
    className = '',
    disabled,
    ...props 
  }, ref) => {
    const { isDark } = useTheme();
    
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2.5 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2.5',
    };
    
    const variantClasses = {
      primary: `
        text-white font-semibold rounded-xl
        disabled:opacity-50 disabled:cursor-not-allowed
        active:scale-[0.98] transition-all duration-200
      `,
      secondary: `
        font-medium rounded-lg border
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isDark
          ? 'bg-slate-800/60 border-slate-700/60 text-slate-200 hover:bg-slate-700/60 hover:border-slate-600/60'
          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
        }
      `,
      ghost: `
        font-medium rounded-lg
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isDark
          ? 'text-slate-300 hover:text-white hover:bg-slate-800/60'
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }
      `,
      danger: `
        font-medium rounded-lg border
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isDark
          ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
          : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
        }
      `,
    };
    
    const primaryStyle = variant === 'primary' ? {
      background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
      boxShadow: isDark 
        ? '0 4px 20px rgba(14, 165, 233, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
        : '0 4px 16px rgba(14, 165, 233, 0.25), inset 0 1px 0 rgba(255,255,255,0.2)',
    } : undefined;
    
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${className}
        `}
        style={primaryStyle}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : leftIcon}
        {children}
        {!isLoading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';

// ============================================================================
// Input Components
// ============================================================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftElement?: ReactNode;
  rightElement?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leftElement, rightElement, className = '', ...props }, ref) => {
    const { isDark } = useTheme();
    const theme = getThemeStyles(isDark);
    
    return (
      <div className="w-full">
        {label && (
          <label className={`block text-sm font-medium mb-2 ${theme.textSecondary}`}>
            {label}
          </label>
        )}
        <div className="relative">
          {leftElement && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              {leftElement}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full px-4 py-2.5 text-sm rounded-xl border
              transition-all duration-150 ease-out
              focus:outline-none focus:ring-2
              ${leftElement ? 'pl-10' : ''}
              ${rightElement ? 'pr-10' : ''}
              ${error
                ? isDark
                  ? 'border-red-500/60 focus:border-red-500/80 focus:ring-red-500/20'
                  : 'border-red-300 focus:border-red-500 focus:ring-red-500/15'
                : isDark
                  ? 'bg-slate-900/80 border-slate-700/60 text-white placeholder:text-slate-500 focus:border-sky-500/60 focus:ring-sky-500/20'
                  : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:ring-sky-500/15'
              }
              ${className}
            `}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {rightElement}
            </div>
          )}
        </div>
        {error && (
          <p className={`mt-1.5 text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            {error}
          </p>
        )}
        {hint && !error && (
          <p className={`mt-1.5 text-xs ${theme.textSubtle}`}>
            {hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ============================================================================
// Card Components
// ============================================================================

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, className = '', hover = false, padding = 'md' }: CardProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };
  
  return (
    <div
      className={`
        rounded-xl border backdrop-blur-sm
        ${theme.border}
        ${hover ? isDark ? 'hover:border-slate-600/60' : 'hover:border-slate-300' : ''}
        ${hover ? 'transition-all duration-200 cursor-pointer' : ''}
        ${paddingClasses[padding]}
        ${className}
      `}
      style={{
        background: isDark 
          ? 'linear-gradient(135deg, rgba(30, 58, 138, 0.15) 0%, rgba(15, 23, 42, 0.9) 100%)'
          : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.98) 100%)',
        boxShadow: isDark
          ? '0 4px 24px rgba(0, 0, 0, 0.3)'
          : '0 4px 20px rgba(0, 0, 0, 0.06)',
      }}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Badge Components
// ============================================================================

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

export function Badge({ children, variant = 'default', size = 'sm', icon }: BadgeProps) {
  const { isDark } = useTheme();
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };
  
  const variantClasses = {
    default: isDark 
      ? 'bg-slate-700/60 text-slate-300 border-slate-600/50' 
      : 'bg-slate-100 text-slate-700 border-slate-200',
    success: isDark 
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
      : 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: isDark 
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' 
      : 'bg-amber-50 text-amber-700 border-amber-200',
    error: isDark 
      ? 'bg-red-500/15 text-red-400 border-red-500/30' 
      : 'bg-red-50 text-red-700 border-red-200',
    info: isDark 
      ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' 
      : 'bg-sky-50 text-sky-700 border-sky-200',
  };
  
  return (
    <span className={`
      inline-flex items-center gap-1.5 font-medium rounded-md border
      ${sizeClasses[size]}
      ${variantClasses[variant]}
    `}>
      {icon}
      {children}
    </span>
  );
}

// ============================================================================
// Modal Components
// ============================================================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  
  if (!isOpen) return null;
  
  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
  };
  
  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className={`
          relative ${sizeClasses[size]} w-full mx-4 
          rounded-2xl border ${theme.border}
          animate-scale-in
        `}
        style={{
          background: isDark 
            ? 'linear-gradient(135deg, rgba(30, 58, 138, 0.2) 0%, #0f172a 100%)'
            : '#ffffff',
          boxShadow: isDark 
            ? '0 24px 64px rgba(0, 0, 0, 0.5)' 
            : '0 24px 64px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Header */}
        {title && (
          <div className={`flex items-center justify-between px-6 py-4 border-b ${theme.border}`}>
            <h3 className={`font-semibold ${theme.textPrimary}`}>{title}</h3>
            <button
              onClick={onClose}
              className={`
                p-1.5 rounded-lg transition-colors
                ${isDark 
                  ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' 
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
              `}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        
        {/* Content */}
        <div className="p-6">
          {children}
        </div>
        
        {/* Footer */}
        {footer && (
          <div className={`flex justify-end gap-3 px-6 py-4 border-t ${theme.border}`}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State Components
// ============================================================================

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className={`mb-4 ${theme.textSubtle}`}>
          {icon}
        </div>
      )}
      <h3 className={`text-lg font-semibold ${theme.textPrimary} mb-2`}>
        {title}
      </h3>
      {description && (
        <p className={`text-sm ${theme.textMuted} max-w-sm mb-6`}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

// ============================================================================
// Loading Components
// ============================================================================

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };
  
  return (
    <svg className={`animate-spin ${sizeClasses[size]}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  const { isDark } = useTheme();
  
  return (
    <div 
      className={`rounded-lg ${className}`}
      style={{
        background: isDark
          ? 'linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%)'
          : 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 2s linear infinite',
      }}
    />
  );
}

// ============================================================================
// Tooltip Component
// ============================================================================

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tooltip({ content, children, position = 'top' }: TooltipProps) {
  const { isDark } = useTheme();
  
  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };
  
  return (
    <div className="relative group inline-flex">
      {children}
      <div className={`
        absolute ${positionClasses[position]} px-2.5 py-1.5
        text-xs font-medium rounded-lg whitespace-nowrap
        opacity-0 group-hover:opacity-100 pointer-events-none
        transition-opacity duration-150 z-50
        ${isDark 
          ? 'bg-slate-700 text-slate-200' 
          : 'bg-slate-800 text-white'}
      `}
      style={{
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
      }}
      >
        {content}
      </div>
    </div>
  );
}

// ============================================================================
// Divider Component
// ============================================================================

export function Divider({ className = '' }: { className?: string }) {
  const { isDark } = useTheme();
  const theme = getThemeStyles(isDark);
  
  return <div className={`border-t ${theme.border} ${className}`} />;
}

// ============================================================================
// Progress Component
// ============================================================================

interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md';
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export function Progress({ value, max = 100, size = 'md', variant = 'default' }: ProgressProps) {
  const { isDark } = useTheme();
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  
  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
  };
  
  const variantGradients = {
    default: 'linear-gradient(90deg, #0ea5e9, #6366f1)',
    success: 'linear-gradient(90deg, #10b981, #34d399)',
    warning: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
    error: 'linear-gradient(90deg, #ef4444, #f87171)',
  };
  
  return (
    <div 
      className={`
        w-full rounded-full overflow-hidden ${sizeClasses[size]}
        ${isDark ? 'bg-slate-800' : 'bg-slate-200'}
      `}
    >
      <div 
        className={`${sizeClasses[size]} rounded-full transition-all duration-500 ease-out`}
        style={{
          width: `${percentage}%`,
          background: variantGradients[variant],
        }}
      />
    </div>
  );
}

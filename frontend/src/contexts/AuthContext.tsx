/**
 * AuthContext - Manages authentication state for the application.
 *
 * Features:
 * - Sign in/out with Cognito
 * - Access token for API calls
 * - User information (email, name, role)
 * - AUTH_DISABLED mode for local development
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
  getCurrentUser,
  confirmSignIn,
  AuthError,
} from 'aws-amplify/auth';
import { AUTH_DISABLED, isCognitoConfigured } from '../config/amplify';

// User role type
export type UserRole = 'admin' | 'reviewer' | 'viewer';

// User information from Cognito
export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  role: UserRole;
  emailVerified: boolean;
}

// Auth context state
interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  requiresNewPassword: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; requiresNewPassword?: boolean; error?: string }>;
  signOut: () => Promise<void>;
  completeNewPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  getAccessToken: () => Promise<string | null>;
  clearError: () => void;
}

// Mock user for AUTH_DISABLED mode
const MOCK_USER: AuthUser = {
  sub: 'mock-local-user',
  email: 'admin@localhost',
  name: 'Local Admin',
  role: 'admin',
  emailVerified: true,
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider props
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider component - wraps app to provide auth context.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSignIn, setPendingSignIn] = useState<{ email: string } | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Check if user is already authenticated
  const checkAuthStatus = async () => {
    // Auth disabled - use mock user
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      setIsLoading(false);
      return;
    }

    // Cognito not configured
    if (!isCognitoConfigured) {
      setIsLoading(false);
      return;
    }

    try {
      const session = await fetchAuthSession();
      if (session.tokens?.accessToken) {
        const currentUser = await getCurrentUser();
        const userAttributes = await getUserAttributes();
        setUser({
          sub: currentUser.userId,
          email: userAttributes.email || currentUser.signInDetails?.loginId || '',
          name: userAttributes.name,
          role: (userAttributes['custom:role'] as UserRole) || 'viewer',
          emailVerified: userAttributes.email_verified === 'true',
        });
      }
    } catch {
      // No valid session - user needs to sign in
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Get user attributes from current session
  const getUserAttributes = async (): Promise<Record<string, string>> => {
    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (idToken) {
        // Parse JWT payload to get claims
        const payload = idToken.payload;
        return {
          email: payload.email as string || '',
          name: payload.name as string || '',
          email_verified: String(payload.email_verified || 'false'),
          'custom:role': payload['custom:role'] as string || 'viewer',
        };
      }
    } catch (err) {
      console.error('Failed to get user attributes:', err);
    }
    return {};
  };

  // Sign in with email and password
  const signIn = useCallback(async (
    email: string,
    password: string
  ): Promise<{ success: boolean; requiresNewPassword?: boolean; error?: string }> => {
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      return { success: true };
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await amplifySignIn({
        username: email,
        password,
      });

      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        // User must set new password (first login with temp password)
        setPendingSignIn({ email });
        setIsLoading(false);
        return { success: false, requiresNewPassword: true };
      }

      if (result.isSignedIn) {
        const currentUser = await getCurrentUser();
        const userAttributes = await getUserAttributes();
        setUser({
          sub: currentUser.userId,
          email: userAttributes.email || email,
          name: userAttributes.name,
          role: (userAttributes['custom:role'] as UserRole) || 'viewer',
          emailVerified: userAttributes.email_verified === 'true',
        });
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'Sign in incomplete' };
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof AuthError ? err.message : 'Sign in failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Complete new password challenge
  const completeNewPassword = useCallback(async (
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!pendingSignIn) {
      return { success: false, error: 'No pending sign in' };
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await confirmSignIn({
        challengeResponse: newPassword,
      });

      if (result.isSignedIn) {
        const currentUser = await getCurrentUser();
        const userAttributes = await getUserAttributes();
        setUser({
          sub: currentUser.userId,
          email: userAttributes.email || pendingSignIn.email,
          name: userAttributes.name,
          role: (userAttributes['custom:role'] as UserRole) || 'viewer',
          emailVerified: userAttributes.email_verified === 'true',
        });
        setPendingSignIn(null);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'Password change incomplete' };
    } catch (err) {
      setIsLoading(false);
      const errorMessage = err instanceof AuthError ? err.message : 'Password change failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [pendingSignIn]);

  // Sign out
  const signOut = useCallback(async () => {
    if (AUTH_DISABLED) {
      // In auth disabled mode, don't actually sign out - just reload
      window.location.reload();
      return;
    }

    try {
      await amplifySignOut();
      setUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
      // Still clear local state even if signOut fails
      setUser(null);
    }
  }, []);

  // Get ID token for API calls (contains user attributes like name, email)
  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (AUTH_DISABLED) {
      return 'mock-token-disabled';
    }

    try {
      const session = await fetchAuthSession();
      // Use ID token instead of access token - it contains name, email, etc.
      return session.tokens?.idToken?.toString() || null;
    } catch {
      return null;
    }
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    requiresNewPassword: !!pendingSignIn,
    signIn,
    signOut,
    completeNewPassword,
    getAccessToken,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth context.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;

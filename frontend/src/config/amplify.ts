/**
 * AWS Amplify configuration for Cognito authentication.
 *
 * Environment variables:
 * - VITE_COGNITO_USER_POOL_ID: Cognito User Pool ID
 * - VITE_COGNITO_CLIENT_ID: Cognito App Client ID
 * - VITE_COGNITO_REGION: AWS region (default: ap-southeast-2)
 * - VITE_AUTH_DISABLED: Set to 'true' to skip auth (dev mode)
 */

import { Amplify } from 'aws-amplify';

// Auth disabled mode for local development
export const AUTH_DISABLED = import.meta.env.VITE_AUTH_DISABLED === 'true';

// Cognito configuration from environment
const cognitoConfig = {
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
  region: import.meta.env.VITE_COGNITO_REGION || 'ap-southeast-2',
};

// Check if Cognito is properly configured
export const isCognitoConfigured = Boolean(
  cognitoConfig.userPoolId && cognitoConfig.userPoolClientId
);

/**
 * Configure AWS Amplify with Cognito settings.
 * Should be called once at app startup (in main.tsx).
 */
export function configureAmplify(): void {
  if (AUTH_DISABLED) {
    console.log('[Auth] Authentication disabled - using mock user');
    return;
  }

  if (!isCognitoConfigured) {
    console.warn('[Auth] Cognito not configured - set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID');
    return;
  }

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: cognitoConfig.userPoolId,
        userPoolClientId: cognitoConfig.userPoolClientId,
        signUpVerificationMethod: 'code',
        loginWith: {
          email: true,
        },
      },
    },
  });

  console.log('[Auth] Amplify configured for Cognito');
}

export default cognitoConfig;

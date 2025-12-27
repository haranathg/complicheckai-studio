/**
 * Authenticated API client for CompliCheckAI Studio.
 *
 * Features:
 * - Automatically adds Bearer token to requests
 * - Handles token refresh
 * - Provides typed request methods
 * - Falls back to unauthenticated requests in AUTH_DISABLED mode
 */

import { fetchAuthSession } from 'aws-amplify/auth';
import { API_URL } from '../config';
import { AUTH_DISABLED } from '../config/amplify';

// Custom error class for API errors
export class ApiError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Get the current ID token for API requests.
 * We use the ID token instead of access token because it contains
 * user attributes like name, email which are needed for user attribution.
 */
async function getAccessToken(): Promise<string | null> {
  if (AUTH_DISABLED) {
    return null; // No token needed in disabled mode
  }

  try {
    const session = await fetchAuthSession();
    // Use ID token - it contains name, email, etc. for user attribution
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * Make an authenticated fetch request.
 *
 * @param url - The URL to fetch (relative to API_URL or absolute)
 * @param options - Fetch options (method, body, etc.)
 * @returns Response data
 * @throws ApiError on non-2xx responses
 */
export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  // Build full URL if relative
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;

  // Get access token
  const token = await getAccessToken();

  // Build headers
  const headers = new Headers(options.headers);

  // Add auth header if we have a token
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Add content-type for JSON if body is present and not FormData
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Make request
  const response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // Handle non-2xx responses
  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorData = await response.json();
      detail = typeof errorData.detail === 'string'
        ? errorData.detail
        : errorData.detail?.message || JSON.stringify(errorData.detail);
    } catch {
      detail = response.statusText;
    }

    throw new ApiError(
      detail || `Request failed with status ${response.status}`,
      response.status,
      detail
    );
  }

  // Return empty for 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse JSON response
  return response.json();
}

/**
 * GET request with authentication.
 */
export async function apiGet<T = unknown>(
  url: string,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'GET' });
}

/**
 * POST request with authentication.
 */
export async function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

/**
 * PUT request with authentication.
 */
export async function apiPut<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

/**
 * PATCH request with authentication.
 */
export async function apiPatch<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  return apiFetch<T>(url, {
    ...options,
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
}

/**
 * DELETE request with authentication.
 */
export async function apiDelete<T = unknown>(
  url: string,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  return apiFetch<T>(url, { ...options, method: 'DELETE' });
}

/**
 * Upload a file with authentication.
 * Handles FormData properly without setting Content-Type header.
 */
export async function apiUpload<T = unknown>(
  url: string,
  formData: FormData,
  options: Omit<RequestInit, 'method' | 'body'> = {}
): Promise<T> {
  const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
  const token = await getAccessToken();

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Don't set Content-Type - let browser set it with boundary for FormData

  const response = await fetch(fullUrl, {
    ...options,
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorData = await response.json();
      detail = typeof errorData.detail === 'string'
        ? errorData.detail
        : errorData.detail?.message || JSON.stringify(errorData.detail);
    } catch {
      detail = response.statusText;
    }

    throw new ApiError(
      detail || `Upload failed with status ${response.status}`,
      response.status,
      detail
    );
  }

  return response.json();
}

// Export API_URL for backward compatibility
export { API_URL };

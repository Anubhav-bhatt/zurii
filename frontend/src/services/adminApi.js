import { API_BASE_URL } from '../config/api';

/**
 * Authenticated HTTP for the admin analytics dashboard.
 *
 * Replicates the auth contract of pages/AdminInsights.jsx as a standalone
 * module: a short-lived access token held in module state (never persisted),
 * and a refresh cookie (`credentials: 'include'`) that lets an admin who is
 * already logged into the Contact CRM bootstrap a token here without
 * re-entering credentials.
 *
 * Flow: no token → try POST /api/auth/refresh once; any 401 mid-session →
 * refresh once and retry the request. When refresh itself fails the session
 * is truly gone and `AdminAuthError` is thrown so the page can show its
 * login form.
 *
 * The backend envelope is `{ success, data }` / `{ success: false, error }`
 * (same as services/apiClient.js) and `adminFetch` unwraps it to `data`.
 */

export class AdminApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.cause = cause;
  }
}

/** Thrown when the session is truly gone — the caller should show a login form. */
export class AdminAuthError extends AdminApiError {
  constructor(message = 'Your admin session has expired. Please log in again.') {
    super(message, { status: 401 });
    this.name = 'AdminAuthError';
  }
}

let accessToken = null;
let refreshPromise = null;

/**
 * Exchange the httpOnly refresh cookie for a new access token.
 * Deduplicated: concurrent 401s share one refresh request.
 * Resolves to the token string, or null when the session is gone.
 */
function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const body = await res.json().catch(() => null);
        return body?.accessToken || null;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/**
 * Try to establish a session from the refresh cookie alone (the "already
 * logged into the CRM" path). Returns true when a token was obtained.
 * Never throws.
 */
export async function bootstrapSession() {
  if (accessToken) return true;
  const token = await refreshAccessToken();
  if (token) accessToken = token;
  return Boolean(token);
}

/** Log in with credentials; stores the access token in module state. */
export async function adminLogin(username, password) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });
  } catch (err) {
    throw new AdminApiError('Unable to reach the server. Please check your connection.', { cause: err });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new AdminApiError(body?.error || 'Invalid username or password.', { status: res.status });
  }

  accessToken = body.accessToken;
  return body.admin ?? null;
}

/**
 * Who is signed in, and do they still owe a first-login password change?
 *
 * This is one of only two endpoints an account holding a temporary password can
 * reach, so it works in exactly the state where every dashboard call returns
 * 403 PASSWORD_CHANGE_REQUIRED.
 */
export function getAdminSession(options = {}) {
  return adminFetch('/api/admin/session', options);
}

/**
 * Replace the signed-in admin's password.
 *
 * The current password is required even though a valid session exists: a
 * borrowed laptop or a stolen token must not be enough to take over the account.
 *
 * On success the server increments token_version, which revokes THIS session
 * too — so the caller must send the admin back to the login screen rather than
 * carrying on. The local token is cleared here to make that unavoidable.
 */
export async function changeAdminPassword(currentPassword, newPassword) {
  let res;
  try {
    res = await fetch(`${API_BASE_URL}/api/admin/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  } catch (err) {
    throw new AdminApiError('Unable to reach the server. Please check your connection.', { cause: err });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    const error = new AdminApiError(body?.error || 'Could not change the password.', { status: res.status });
    error.fields = body?.fields ?? null;
    throw error;
  }

  // The session that made this request is now revoked server-side.
  accessToken = null;
  return body.message ?? 'Password changed successfully. Please sign in again.';
}

/** Clear the session locally and revoke the refresh cookie server-side. */
export async function adminLogout() {
  accessToken = null;
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Local state is already cleared; a failed revoke is not worth an error.
  }
}

/**
 * GET/POST an admin endpoint and return the unwrapped `data`.
 *
 * Attaches the Bearer token; on 401 refreshes once and retries. Throws
 * `AdminAuthError` when auth is truly gone, `AdminApiError` otherwise.
 * An abort is rethrown untouched so `useAsyncData` can ignore it.
 */
export async function adminFetch(path, { signal, headers, ...options } = {}) {
  if (!accessToken) {
    const token = await refreshAccessToken();
    if (!token) throw new AdminAuthError();
    accessToken = token;
  }

  const doFetch = () =>
    fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let res;
  try {
    res = await doFetch();

    if (res.status === 401) {
      accessToken = null;
      const token = await refreshAccessToken();
      if (!token) throw new AdminAuthError();
      accessToken = token;
      res = await doFetch();
      if (res.status === 401) {
        accessToken = null;
        throw new AdminAuthError();
      }
    }
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof AdminApiError) throw err;
    throw new AdminApiError('Unable to reach the server. Please check your connection.', { cause: err });
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AdminApiError(body?.error || `Request failed (${res.status})`, { status: res.status });
  }
  if (!body?.success) {
    throw new AdminApiError(body?.error || 'Unexpected response from the server.', { status: res.status });
  }
  return body.data;
}

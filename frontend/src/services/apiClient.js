import { API_BASE_URL } from '../config/api';

/**
 * One place where HTTP happens. Every travel service goes through this, so
 * timeout, error shaping and envelope unwrapping are defined once.
 *
 * The backend answers `{ success, data, meta? }` on success and
 * `{ success: false, error }` on failure — see backend/routes/travel.js.
 */

const DEFAULT_TIMEOUT_MS = 10000;

export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
  }
}

/** Drop empty values so `?featured=&destination=` never reaches the server. */
export function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * GET a JSON endpoint and return `{ data, meta }`.
 *
 * Throws ApiError with a message safe to show a user. `signal` lets callers
 * abort on unmount; an abort is rethrown untouched so callers can ignore it.
 */
export async function apiGet(path, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Abort if either the caller or our own timeout fires.
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body (proxy error page, empty 502) is handled below.
    }

    if (!response.ok) {
      throw new ApiError(body?.error || `Request failed (${response.status})`, { status: response.status });
    }
    if (!body?.success) {
      throw new ApiError(body?.error || 'Unexpected response from the server.', { status: response.status });
    }

    return { data: body.data, meta: body.meta ?? null };
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (err instanceof ApiError) throw err;
    throw new ApiError('Unable to reach the server. Please check your connection.', { cause: err });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

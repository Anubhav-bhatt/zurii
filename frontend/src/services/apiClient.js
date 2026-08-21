import { API_BASE_URL } from '../config/api';

/**
 * One place where HTTP happens. Every travel service goes through this, so
 * timeout, error shaping and envelope unwrapping are defined once.
 *
 * The backend answers `{ success, data, meta? }` on success and
 * `{ success: false, error }` on failure — see backend/routes/travel.js.
 */

/**
 * Long enough to survive a backend cold start.
 *
 * 10s was the previous value, and it is a sensible number for a server that is
 * already running — a warm response here takes about 300ms, so anything beyond
 * a second means something is wrong. But the API is deployed on an instance
 * that suspends after a period of inactivity, and the first request after that
 * has to wait for the process to boot and reconnect to PostgreSQL: measured at
 * 18.5s, and the platform allows longer.
 *
 * So the first visitor after a quiet spell got an aborted request and an empty
 * page, while their request woke the server — meaning any reload a few seconds
 * later worked perfectly. That is the worst shape a bug can have: it never
 * reproduces for whoever is investigating, because loading the page is itself
 * the thing that fixes it.
 *
 * 30s is chosen to cover that boot with margin. It costs nothing when the
 * server is warm, since the timeout only matters when a request is already
 * failing, and the pages render skeletons while they wait — so a slow first
 * load looks like loading rather than an error.
 *
 * The real fix is an instance that does not suspend, at which point this is
 * only a safety net. Lower it if that changes.
 *
 * EXPORTED because it is the whole frontend's timeout, not this module's.
 * bookingsApi.js kept its own copy at the old 10s value and was never
 * updated with this one, so the public enquiry POST — the site's only write —
 * still aborted mid cold start; the admin CRM had the same split, three
 * fetches at 30s and one at 10s. A second constant is what let them diverge,
 * so there is now only one.
 */
export const API_TIMEOUT_MS = 30000;

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
export async function apiGet(path, { signal, timeoutMs = API_TIMEOUT_MS } = {}) {
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

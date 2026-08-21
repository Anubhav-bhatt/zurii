import { API_BASE_URL } from '../config/api';
import { ApiError, API_TIMEOUT_MS } from './apiClient';
import { attribution } from './analytics';

/**
 * Enquiry submission — the one write the public site performs.
 *
 * `apiClient.js` only speaks GET, so the POST lives here and deliberately
 * mirrors its behaviour: the same timeout — imported from there rather than
 * restated, because restating it is how this file stayed at 10s after
 * apiClient moved to 30s — the same "abort if either the caller or the
 * timeout fires" wiring, the same envelope check, and errors shaped as
 * `ApiError` with a message that is safe to put in front of a user.
 *
 * The one addition is field-level errors. A 400 from `POST /api/bookings`
 * carries `{ error, fields: { name: '…' } }`; that object is attached to the
 * thrown error as `.fields` so the form can mark the offending inputs instead
 * of showing one generic banner. Callers therefore branch on `err.fields`.
 */

/** Keep only `{ field: 'message' }` pairs so the form never renders an object. */
function toFieldErrors(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return {};

  const result = {};
  for (const [field, message] of Object.entries(fields)) {
    if (typeof message === 'string' && message) result[field] = message;
  }
  return result;
}

/**
 * Create an enquiry.
 *
 * @param {object} payload { packageSlug?, name, email, phone, travelDate,
 *                           travellers, departureCity, message }
 * @param {object} options { signal, timeoutMs }
 * @returns {Promise<{ id: number|string, status: string }>}
 */
export async function createBooking(payload, { signal, timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();

  // A caller abort (unmount) and our own timeout both surface as AbortError, but
  // they mean opposite things: one means nobody is listening any more, the other
  // is a failure the visitor must be told about. Without this flag the timeout
  // was rethrown raw and the form rendered the browser's internal abort text.
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => controller.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await fetch(`${API_BASE_URL}/api/bookings`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // The anonymous visitor/session ids ride along on the enquiry itself so
      // the admin can later see the journey that preceded the lead. They are
      // attribution metadata, not form fields: the server drops a malformed id
      // silently and never fails the submission over one.
      body: JSON.stringify({ ...(payload ?? {}), ...attribution() }),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // A non-JSON body (proxy error page, empty 502) is handled below.
    }

    if (response.status === 400) {
      const error = new ApiError(body?.error || 'Please check the highlighted fields.', { status: 400 });
      error.fields = toFieldErrors(body?.fields);
      throw error;
    }
    if (!response.ok) {
      throw new ApiError(body?.error || `Request failed (${response.status})`, { status: response.status });
    }
    if (!body?.success) {
      throw new ApiError(body?.error || 'Unexpected response from the server.', { status: response.status });
    }

    const data = body.data ?? {};
    return { id: data.id, status: data.status ?? 'NEW' };
  } catch (err) {
    if (err.name === 'AbortError') {
      if (!timedOut) throw err; // the caller went away; nothing to report
      throw new ApiError('That took too long to send. Please try again.', { cause: err });
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('Unable to reach the server. Please check your connection.', { cause: err });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}

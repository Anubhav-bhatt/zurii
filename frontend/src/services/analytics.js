import { API_BASE_URL } from '../config/api';

/**
 * First-party anonymous analytics.
 *
 * The identity model is deliberately minimal: one random UUID in
 * `localStorage` (the visitor) and one in `sessionStorage` (the browsing
 * session). Nothing else identifies anyone — no fingerprinting, no IP-derived
 * identity, and metadata never carries personal data. Names, phones, emails
 * and message text live only in the bookings/contacts tables.
 *
 * Every function here is fire-and-forget and storage-safe: a blocked store
 * falls back to a per-load in-memory id, a failed request is swallowed, and
 * nothing is ever awaited on a user-action path. Analytics that can delay or
 * break the customer journey is a defect, so `track()` must never be awaited.
 */

export const VISITOR_ID_KEY = 'zurii_visitor_id';
export const SESSION_ID_KEY = 'zurii_session_id';

/** Marks session_start as sent, so a reload mid-session does not resend it. */
const SESSION_STARTED_KEY = 'zurii_session_started';

/** The exact event allowlist shared with the server; anything else is dropped. */
export const EVENT_TYPES = new Set([
  'destination_view',
  'package_view',
  'search_performed',
  'filter_applied',
  'sort_changed',
  'wishlist_add',
  'wishlist_remove',
  'similar_package_click',
  'plan_trip_click',
  'whatsapp_click',
  'enquiry_form_opened',
  'enquiry_form_started',
  'enquiry_submitted',
  'contact_submitted',
  'session_start',
]);

const ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/** The only campaign parameters read; anything else in the URL is ignored. */
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const UTM_VALUE_MAX = 100;

const SLUG_MAX = 250;
const PATH_MAX = 300;

// Per-load fallbacks for when storage is absent or blocked (Safari private
// mode, quota, SSR). The ids then live only as long as this page load.
let memoryVisitorId = null;
let memorySessionId = null;
let sessionStartedInMemory = false;

// Consecutive-duplicate suppression for trackSearch, shared by the search
// overlay and the packages page so the same resolved query is reported once.
let lastSearchQuery = null;

function createId() {
  try {
    return crypto.randomUUID();
  } catch {
    // No crypto.randomUUID (older WebView): still random, still matching the
    // server's /^[a-zA-Z0-9-]{8,64}$/ pattern. Never derived from the device.
    return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Read a valid id from storage or create-and-persist one. Null when storage is unusable. */
function readOrCreateId(getStorage, key) {
  try {
    const storage = getStorage();
    const existing = storage.getItem(key);
    if (existing && ID_PATTERN.test(existing)) return existing;
    const id = createId();
    storage.setItem(key, id);
    return id;
  } catch {
    return null;
  }
}

/** Lazy-created persistent visitor id (localStorage, in-memory fallback). */
export function getVisitorId() {
  if (!memoryVisitorId) {
    memoryVisitorId = readOrCreateId(() => window.localStorage, VISITOR_ID_KEY) ?? createId();
  }
  return memoryVisitorId;
}

/** Lazy-created per-browsing-session id (sessionStorage, in-memory fallback). */
export function getSessionId() {
  if (!memorySessionId) {
    memorySessionId = readOrCreateId(() => window.sessionStorage, SESSION_ID_KEY) ?? createId();
  }
  return memorySessionId;
}

/** Truncate a string field; empty/non-strings become undefined and are omitted. */
function clip(value, max) {
  return typeof value === 'string' && value ? value.slice(0, max) : undefined;
}

/**
 * POST one event. `keepalive: true` lets the request survive a navigation or
 * a tab opening (WhatsApp clicks). Every failure — network, CORS, JSON — is
 * swallowed: analytics never surfaces an error to the visitor.
 */
function send(body) {
  try {
    fetch(`${API_BASE_URL}/api/analytics/events`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Silent by design.
    });
  } catch {
    // fetch missing or serialization failed: drop the event, never the journey.
  }
}

/**
 * Record one product event. Fire-and-forget — never await this in a
 * user-action path. Unknown types are dropped client-side, matching the
 * server allowlist. `meta` must never contain personal data.
 */
export function track(type, { entityType, entityId, entitySlug, meta } = {}) {
  try {
    if (!EVENT_TYPES.has(type)) return;

    const body = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      type,
      path: clip(window.location.pathname, PATH_MAX),
      referrer: clip(document.referrer, PATH_MAX),
    };
    if (entityType) body.entityType = entityType;
    if (Number.isInteger(entityId)) body.entityId = entityId;
    const slug = clip(typeof entitySlug === 'string' ? entitySlug : undefined, SLUG_MAX);
    if (slug) body.entitySlug = slug;
    if (meta && typeof meta === 'object') body.meta = meta;

    send(body);
  } catch {
    // Analytics must never break the page.
  }
}

/**
 * `search_performed` with consecutive-duplicate suppression: the overlay
 * fires on every debounced resolve and the packages page fires when a `?q=`
 * search resolves, so without this the same query would be counted twice.
 * Zero-result counts are deliberately included — they feed the
 * zero-results report.
 */
export function trackSearch(query, resultCount) {
  try {
    const clean = typeof query === 'string' ? query.trim() : '';
    if (!clean) return;
    const normalized = clean.toLowerCase();
    if (normalized === lastSearchQuery) return;
    lastSearchQuery = normalized;
    track('search_performed', { meta: { query: clean.slice(0, 200), resultCount } });
  } catch {
    // Silent by design.
  }
}

function sessionAlreadyStarted() {
  try {
    return window.sessionStorage.getItem(SESSION_STARTED_KEY) === '1';
  } catch {
    return false;
  }
}

function markSessionStarted() {
  try {
    window.sessionStorage.setItem(SESSION_STARTED_KEY, '1');
  } catch {
    // The in-memory flag still prevents repeats within this page load.
  }
}

/**
 * Fire `session_start` once per browsing session, carrying the landing path,
 * the referrer, and any of the five utm_* parameters (values truncated).
 * Called from one App-level mount effect; safe to call any number of times.
 */
export function ensureSession() {
  try {
    if (sessionStartedInMemory || sessionAlreadyStarted()) return;
    sessionStartedInMemory = true;
    markSessionStarted();

    const utm = {};
    try {
      const params = new URLSearchParams(window.location.search);
      for (const key of UTM_KEYS) {
        const value = params.get(key);
        if (value) utm[key] = value.slice(0, UTM_VALUE_MAX);
      }
    } catch {
      // A malformed query string costs the utm data, nothing else.
    }

    const body = {
      visitorId: getVisitorId(),
      sessionId: getSessionId(),
      type: 'session_start',
      path: clip(window.location.pathname, PATH_MAX),
      referrer: clip(document.referrer, PATH_MAX),
    };
    if (Object.keys(utm).length > 0) body.utm = utm;

    send(body);
  } catch {
    // Silent by design.
  }
}

/**
 * `{ visitorId, sessionId }` for lead form payloads, so the admin can later
 * see the journey that preceded an enquiry or contact. Never throws — a lead
 * submission must not fail because analytics ids were unavailable.
 */
export function attribution() {
  try {
    return { visitorId: getVisitorId(), sessionId: getSessionId() };
  } catch {
    return {};
  }
}

/**
 * Server-side validation for anonymous analytics events
 * (POST /api/analytics/events).
 *
 * Anything can POST to a public endpoint, so nothing here trusts a type, a
 * length or a shape from the client. Like lib/validateBooking.js this module is
 * pure and dependency-free: no database, no Express, no throwing. It returns a
 * verdict and lets the route decide the status code.
 *
 *   validateEvent(body) -> { valid, error, value }
 *
 *   valid   true when the payload is acceptable
 *   error   one user-safe sentence when it is not (never a database or
 *           internals detail — this endpoint must not leak anything)
 *   value   the normalised row to insert; absent optional fields are null so
 *           the caller can bind it straight into SQL
 *
 * Also exported:
 *
 *   extractAttribution(body) -> { visitorId, sessionId }
 *
 * used by the lead-capturing routes (bookings, contact) to lift the analytics
 * ids off a form submission. It NEVER fails: a malformed id becomes null,
 * because attribution is a bonus and must never cost a lead.
 *
 * Every maximum below matches the column it lands in — see
 * scripts/migrateAnalyticsSchema.mjs. Rejecting an over-long value here turns
 * what would be a Postgres 22001 and a 500 into a 400.
 */

/**
 * The one identity contract of the whole system: a visitor/session id is a
 * short opaque token (crypto.randomUUID() fits). Anything else — an email, an
 * IP, a fingerprint — fails this shape on purpose.
 */
const ID_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/**
 * The exact event allowlist, shared with the frontend client
 * (frontend/src/services/analytics.js). An unknown type is rejected, so the
 * table can never fill with arbitrary strings.
 */
const EVENT_TYPES = new Set([
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

const ENTITY_TYPE_MAX = 20; // entity_type VARCHAR(20)
const ENTITY_SLUG_MAX = 250; // entity_slug VARCHAR(250)
const PATH_MAX = 300; // page_path / referrer VARCHAR(300)
const JSON_MAX_BYTES = 2048; // serialized cap for utm and metadata, each
const PG_INT_MAX = 2147483647; // entity_id INTEGER

const isValidId = (value) => typeof value === 'string' && ID_PATTERN.test(value);

/** Absent means "not supplied" — null, undefined and blank text are all absent. */
const isAbsent = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/** A plain object — arrays, strings and null are not acceptable JSONB payloads here. */
const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Validate an analytics event body. Never throws — a malformed body is simply
 * invalid. One generic sentence per failure; this is a fire-and-forget
 * endpoint, so nobody is reading these messages in a UI.
 */
function validateEvent(body) {
  const input = isPlainObject(body) ? body : {};
  const fail = (error) => ({ valid: false, error, value: null });

  // ── ids ───────────────────────────────────────────────────────────
  if (!isValidId(input.visitorId)) return fail('A valid visitorId is required.');
  const visitorId = input.visitorId;

  let sessionId = null;
  if (!isAbsent(input.sessionId)) {
    if (!isValidId(input.sessionId)) return fail('That sessionId is not valid.');
    sessionId = input.sessionId;
  }

  // ── type ──────────────────────────────────────────────────────────
  if (typeof input.type !== 'string' || !EVENT_TYPES.has(input.type)) {
    return fail('That event type is not recognised.');
  }
  const type = input.type;

  // ── entity ────────────────────────────────────────────────────────
  let entityType = null;
  if (!isAbsent(input.entityType)) {
    if (typeof input.entityType !== 'string' || input.entityType.trim().length > ENTITY_TYPE_MAX) {
      return fail('That entityType is not valid.');
    }
    entityType = input.entityType.trim() || null;
  }

  let entityId = null;
  if (!isAbsent(input.entityId)) {
    const id = typeof input.entityId === 'string' && /^\d+$/.test(input.entityId.trim())
      ? Number(input.entityId.trim())
      : input.entityId;
    if (!Number.isInteger(id) || id < 0 || id > PG_INT_MAX) {
      return fail('That entityId is not valid.');
    }
    entityId = id;
  }

  let entitySlug = null;
  if (!isAbsent(input.entitySlug)) {
    if (typeof input.entitySlug !== 'string' || input.entitySlug.trim().length > ENTITY_SLUG_MAX) {
      return fail('That entitySlug is not valid.');
    }
    entitySlug = input.entitySlug.trim() || null;
  }

  // ── page context ──────────────────────────────────────────────────
  let path = null;
  if (!isAbsent(input.path)) {
    if (typeof input.path !== 'string' || input.path.trim().length > PATH_MAX) {
      return fail('That path is not valid.');
    }
    path = input.path.trim() || null;
  }

  let referrer = null;
  if (!isAbsent(input.referrer)) {
    if (typeof input.referrer !== 'string' || input.referrer.trim().length > PATH_MAX) {
      return fail('That referrer is not valid.');
    }
    referrer = input.referrer.trim() || null;
  }

  // ── utm + meta ────────────────────────────────────────────────────
  // The serialized size is capped, not the key count: 2KB of JSONB per event
  // is plenty for utm tags and a search query, and the cap keeps a hostile
  // client from using this table as free blob storage.
  let utm = null;
  if (input.utm !== undefined && input.utm !== null) {
    if (!isPlainObject(input.utm)) return fail('utm must be an object.');
    if (Buffer.byteLength(JSON.stringify(input.utm), 'utf8') > JSON_MAX_BYTES) {
      return fail('utm is too large.');
    }
    utm = input.utm;
  }

  let meta = {};
  if (input.meta !== undefined && input.meta !== null) {
    if (!isPlainObject(input.meta)) return fail('meta must be an object.');
    if (Buffer.byteLength(JSON.stringify(input.meta), 'utf8') > JSON_MAX_BYTES) {
      return fail('meta is too large.');
    }
    meta = input.meta;
  }

  return {
    valid: true,
    error: null,
    value: { visitorId, sessionId, type, entityType, entityId, entitySlug, path, referrer, utm, meta },
  };
}

/**
 * Lift shape-valid attribution ids off a lead form body.
 *
 * Never throws and never reports a problem: a lead submission must succeed
 * whether the analytics ids are valid, malformed or absent. An id that fails
 * the shape check is silently dropped to null.
 */
function extractAttribution(body) {
  const input = isPlainObject(body) ? body : {};
  return {
    visitorId: isValidId(input.visitorId) ? input.visitorId : null,
    sessionId: isValidId(input.sessionId) ? input.sessionId : null,
  };
}

module.exports = { EVENT_TYPES, ID_PATTERN, isValidId, validateEvent, extractAttribution };

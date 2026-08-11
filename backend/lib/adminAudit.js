/**
 * Append-only audit trail for admin authentication events.
 *
 * Two rules shape this module:
 *
 *   1. It must never break the thing it observes. Every write is wrapped and
 *      swallowed — a full disk or a missing table must not stop an admin from
 *      logging in, and must not turn a 401 into a 500. Failures go to the
 *      server log and nowhere else.
 *
 *   2. It must never store a secret. Passwords, hashes, access tokens, refresh
 *      tokens, Authorization headers, cookies and connection strings are all
 *      forbidden. `sanitizeMetadata` enforces that by allow-listing keys rather
 *      than trusting callers to remember, so a future caller cannot leak a
 *      secret into the table by passing the wrong object.
 */

/** The events this pass records. Kept as a closed set so typos are visible. */
const AUDIT_EVENTS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  // Emitted once, at the moment a lock is applied — distinct from the
  // LOGIN_FAILURE rows that led up to it, so "this account got locked" is
  // findable without counting failures.
  LOGIN_LOCKED: 'LOGIN_LOCKED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  // Operator-issued temporary password (CLI). Distinct from PASSWORD_CHANGED,
  // which is the admin replacing their own password.
  PASSWORD_RESET: 'PASSWORD_RESET',
  ADMIN_CREATED: 'ADMIN_CREATED',
  ADMIN_REMOVED: 'ADMIN_REMOVED',
  TOKEN_REJECTED: 'TOKEN_REJECTED',
};

/**
 * Why an authentication attempt failed. Recorded internally only — the HTTP
 * response stays a single generic message, so these categories never tell an
 * attacker whether a username exists or an account is locked.
 */
const FAILURE_REASONS = {
  UNKNOWN_USERNAME: 'unknown_username',
  BAD_PASSWORD: 'bad_password',
  ACCOUNT_LOCKED: 'account_locked',
  MISSING_CREDENTIALS: 'missing_credentials',
  TOKEN_VERSION_MISMATCH: 'token_version_mismatch',
  TOKEN_INVALID: 'token_invalid',
  ADMIN_GONE: 'admin_gone',
  // A valid session reaching a business route before its temporary password has
  // been replaced. Not an attack, but worth seeing in the trail.
  PASSWORD_CHANGE_REQUIRED: 'password_change_required',
};

const IP_MAX = 64;
const USER_AGENT_MAX = 512;
const STRING_VALUE_MAX = 200;

/**
 * Keys allowed in `metadata`, with a note on why each is safe.
 *
 *   username / attemptedUsername — an identifier, not a credential. The
 *     attempted one is the point of a failed-login record.
 *   reason        — a FAILURE_REASONS category, never free text from a request.
 *   failedAttempts / lockedUntil — throttle state, useful when reading the trail.
 *   source        — which surface triggered it ('cli', 'api').
 *   route         — the path a rejected token was presented to.
 */
const ALLOWED_METADATA_KEYS = new Set([
  'username',
  'attemptedUsername',
  'reason',
  'failedAttempts',
  'lockedUntil',
  'source',
  'route',
  // Whether the event left the account in the must-change-password state. A
  // boolean flag, never a credential.
  'mustChangePassword',
]);

const truncate = (value, max) => (typeof value === 'string' && value.length > max ? value.slice(0, max) : value);

/**
 * Drop anything not explicitly allowed, and bound what survives. Values are
 * coerced to primitives so a nested object cannot smuggle a token in.
 */
function sanitizeMetadata(metadata = {}) {
  const clean = {};
  if (!metadata || typeof metadata !== 'object') return clean;

  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS.has(key)) continue;
    if (value == null) continue;

    if (typeof value === 'string') clean[key] = truncate(value, STRING_VALUE_MAX);
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value;
    else if (typeof value === 'boolean') clean[key] = value;
    else if (value instanceof Date) clean[key] = value.toISOString();
    // Anything else (objects, arrays, functions) is dropped by omission.
  }
  return clean;
}

/**
 * Client IP as Express resolved it.
 *
 * Express only honours X-Forwarded-For when `trust proxy` is configured, which
 * server.js does solely from the TRUST_PROXY env var. That matters here: an
 * audit trail recording a spoofable IP is worse than one recording the proxy's,
 * because it looks authoritative. Whatever req.ip says under the deployment's
 * actual configuration is what gets stored.
 */
function clientIp(req) {
  return truncate(req?.ip ?? null, IP_MAX);
}

function clientUserAgent(req) {
  const ua = req?.headers?.['user-agent'];
  return typeof ua === 'string' ? truncate(ua, USER_AGENT_MAX) : null;
}

/**
 * Write one audit row. Fire-and-forget by contract: callers may await it, but a
 * rejection never propagates.
 *
 * @param {import('pg').Pool} pool
 * @param {object} event
 * @param {number|null} [event.adminId]
 * @param {string} event.eventType   one of AUDIT_EVENTS
 * @param {boolean} [event.success]
 * @param {object} [event.req]       Express request, for IP + user agent
 * @param {object} [event.metadata]  filtered by sanitizeMetadata
 */
async function recordAuditEvent(pool, { adminId = null, eventType, success = true, req = null, metadata = {} } = {}) {
  try {
    if (!eventType) return;
    // admin_id goes through a lookup rather than straight into the column.
    //
    // Callers legitimately hold ids that no longer exist — a token for a deleted
    // admin, or a forged token naming an id that never existed — and both are
    // exactly the events most worth recording. Inserting such an id directly
    // violates the foreign key and loses the record; resolving it first stores
    // NULL instead, so the event survives with its username in metadata.
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, event_type, success, ip_address, user_agent, metadata)
       VALUES ((SELECT id FROM admins WHERE id = $1), $2, $3, $4, $5, $6)`,
      [
        Number.isInteger(adminId) ? adminId : null,
        truncate(String(eventType), 64),
        Boolean(success),
        req ? clientIp(req) : null,
        req ? clientUserAgent(req) : null,
        JSON.stringify(sanitizeMetadata(metadata)),
      ]
    );
  } catch (err) {
    // Never rethrow: auditing is observability, not a precondition for auth.
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = {
  AUDIT_EVENTS,
  FAILURE_REASONS,
  recordAuditEvent,
  sanitizeMetadata,
  USER_AGENT_MAX,
  STRING_VALUE_MAX,
};

/**
 * The single source of truth for backend configuration.
 *
 * Everything the application needs from the environment is declared here, in
 * one table, with the rules that decide whether a value is acceptable. Nothing
 * else in the codebase should read `process.env` for configuration.
 *
 * Two properties this module exists to guarantee:
 *
 *   1. FAIL FAST, NOT SILENTLY. A misconfigured production deployment must
 *      refuse to start with a message naming the variable, rather than boot and
 *      fail later on the first request — or worse, boot and quietly serve with a
 *      development default. That is why there are no `|| 'postgres://localhost'`
 *      fallbacks for anything that carries a credential.
 *
 *   2. NEVER PRINT A VALUE. Every message here names the variable and describes
 *      the rule it broke. A config error that echoes the value is how a secret
 *      ends up in a container log, a CI transcript or a screenshot.
 *
 * VALIDATION IS EXPLICIT, NOT ON IMPORT. `loadConfig()` has to be called. If
 * this module validated at import time, importing anything that transitively
 * requires it — a test, a migration script, the admin CLI — would demand a full
 * production environment just to read one function. server.js calls it at
 * startup; scripts/check-env.mjs calls it to report; tests do not call it.
 */

const path = require('path');
const { parse } = require('pg-connection-string');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/** Secrets shorter than this are not credible for signing production tokens. */
const MIN_SECRET_LENGTH = 32;

const isProduction = () => process.env.NODE_ENV === 'production';

/** Absent means unset, empty, or whitespace — all three are "not configured". */
const absent = (value) => value === undefined || value === null || String(value).trim() === '';

// ── Individual validators ───────────────────────────────────────────
//
// Each returns null when the value is acceptable, or a message describing the
// problem. None of them may include the value in that message.

function validateDatabaseUrl(raw) {
  let config;
  try {
    config = parse(raw);
  } catch {
    return 'is not a valid PostgreSQL connection string.';
  }
  if (!/^postgres(ql)?:\/\//i.test(raw.trim())) {
    return 'must be a PostgreSQL URL beginning with postgres:// or postgresql://.';
  }
  if (!config.host) return 'is missing a host.';
  if (!config.database) return 'is missing a database name.';
  return null;
}

function validateSecret(raw) {
  if (raw.trim().length < MIN_SECRET_LENGTH) {
    return `must be at least ${MIN_SECRET_LENGTH} characters. Generate one with: openssl rand -hex 48`;
  }
  if (raw !== raw.trim()) {
    return 'must not start or end with whitespace.';
  }
  return null;
}

function validateAllowedOrigins(raw) {
  const origins = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length === 0) return 'must list at least one origin.';
  for (const origin of origins) {
    if (origin === '*') {
      return "must not be '*'. This API serves credentialed admin requests, " +
             'and a wildcard origin cannot be combined with credentials.';
    }
    let url;
    try {
      url = new URL(origin);
    } catch {
      return 'must be a comma-separated list of absolute origins, e.g. https://example.com';
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'entries must use http:// or https://.';
    }
    // `new URL('https://a.com/path')` parses happily, but an Origin header
    // never carries a path — a value with one silently matches nothing.
    if (url.pathname !== '/' || url.search || url.hash) {
      return 'entries must be bare origins with no path, query or fragment (https://example.com).';
    }
  }
  return null;
}

function validateInteger(min, max) {
  return (raw) => {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      return `must be a whole number between ${min} and ${max}.`;
    }
    return null;
  };
}

/**
 * How the PostgreSQL driver should treat TLS. Split out from DATABASE_URL so
 * the same connection string works against a managed provider and a local
 * database without editing source. See db/pool.js for what each mode does.
 */
const SSL_MODES = new Set(['verify', 'no-verify', 'disable']);

function validateDatabaseSsl(raw) {
  if (!SSL_MODES.has(raw.trim())) {
    return `must be one of: ${[...SSL_MODES].join(', ')}.`;
  }
  return null;
}

// ── The declaration ─────────────────────────────────────────────────

/**
 * @typedef {object} VariableSpec
 * @property {boolean|(() => boolean)} required
 * @property {(raw: string) => string|null} [validate]
 * @property {string} description  shown by scripts/check-env.mjs
 * @property {boolean} [secret]    true = never echo, even redacted
 */

/**
 * SameSite for the refresh cookie.
 *
 * `lax` is right whenever the browser reaches the API on the same site it
 * loaded the app from — the Docker image (nginx proxies /api/ to the backend)
 * and any single-domain deployment. The cookie is then never sent from a
 * third-party context at all, which is the strongest position.
 *
 * `none` exists for one deployment shape: the SPA on one site and this API on
 * another, e.g. Vercel plus Render. There the browser treats every API call as
 * cross-site and refuses to attach a Lax cookie, so sessions silently die the
 * moment the 15-minute access token expires. `none` is the only value that
 * works, and the browser requires `Secure` alongside it — which is enforced in
 * server.js rather than trusted to the operator.
 *
 * `strict` is deliberately not offered: it would break the ordinary case of an
 * admin following a link into the dashboard from another site, for no gain
 * over `lax` here.
 */
const SAMESITE_MODES = ['lax', 'none'];

function validateCookieSameSite(raw) {
  if (!SAMESITE_MODES.includes(raw.trim().toLowerCase())) {
    return `must be one of: ${SAMESITE_MODES.join(', ')}.`;
  }
  return null;
}

/** @type {Record<string, VariableSpec>} */
const SPEC = {
  DATABASE_URL: {
    required: true,
    validate: validateDatabaseUrl,
    secret: true,
    description: 'PostgreSQL connection string (contains the password).',
  },
  JWT_SECRET: {
    required: true,
    validate: validateSecret,
    secret: true,
    description: 'Signing key for 15-minute access tokens.',
  },
  JWT_REFRESH_SECRET: {
    required: true,
    validate: validateSecret,
    secret: true,
    description: 'Signing key for 7-day refresh tokens. Must differ from JWT_SECRET.',
  },
  ALLOWED_ORIGINS: {
    // Optional in development, where middleware/security.js allows the local
    // Vite ports so `npm run dev` needs no configuration. REQUIRED in
    // production, because there the dev origins are not trusted and an unset
    // value would refuse the real frontend.
    required: isProduction,
    validate: validateAllowedOrigins,
    description: 'Comma-separated browser origins allowed to call this API.',
  },
  PORT: {
    required: false,
    validate: validateInteger(1, 65535),
    description: 'Port the API listens on (default 5001).',
  },
  TRUST_PROXY: {
    required: false,
    validate: validateInteger(0, 10),
    description: 'Number of trusted reverse-proxy hops. 1 behind a single nginx; unset if exposed directly.',
  },
  DATABASE_SSL: {
    required: false,
    validate: validateDatabaseSsl,
    description: "TLS mode for PostgreSQL: verify | no-verify | disable.",
  },
  ADMIN_SEED: {
    required: false,
    secret: true,
    description: 'Optional bootstrap admin accounts, "user:password". Prefer create-admin.js.',
  },
  COOKIE_SAMESITE: {
    required: false,
    validate: validateCookieSameSite,
    description:
      "Refresh-cookie SameSite: lax (default, same-site deployments) | none (frontend on a different site; forces Secure).",
  },
  NODE_ENV: {
    required: false,
    description: "'production' enables HSTS and Secure cookies; anything else is development.",
  },
};

/**
 * Check the environment against SPEC.
 *
 * @returns {{ ok: boolean, errors: string[], results: Array<{name: string, status: 'ok'|'missing'|'invalid'|'optional', required: boolean, description: string, message: string|null}> }}
 *   Never includes a value — only names, statuses and rule descriptions.
 */
function inspectEnv() {
  const errors = [];
  const results = [];

  for (const [name, spec] of Object.entries(SPEC)) {
    const required = typeof spec.required === 'function' ? spec.required() : spec.required;
    const raw = process.env[name];

    if (absent(raw)) {
      if (required) {
        const message = `Missing required environment variable: ${name}`;
        errors.push(message);
        results.push({ name, status: 'missing', required, description: spec.description, message });
      } else {
        results.push({ name, status: 'optional', required, description: spec.description, message: null });
      }
      continue;
    }

    const problem = spec.validate ? spec.validate(raw) : null;
    if (problem) {
      const message = `Invalid environment variable: ${name} ${problem}`;
      errors.push(message);
      results.push({ name, status: 'invalid', required, description: spec.description, message });
      continue;
    }

    results.push({ name, status: 'ok', required, description: spec.description, message: null });
  }

  // Cross-field rule: reusing one secret for both token types means a captured
  // refresh token is also a valid access token, collapsing the two lifetimes
  // (7 days and 15 minutes) into one. Compared only when both are present and
  // otherwise valid, so this never masks a more basic error.
  const access = process.env.JWT_SECRET;
  const refresh = process.env.JWT_REFRESH_SECRET;
  if (!absent(access) && !absent(refresh) && access === refresh) {
    errors.push('Invalid environment: JWT_SECRET and JWT_REFRESH_SECRET must be different values.');
    const entry = results.find((r) => r.name === 'JWT_REFRESH_SECRET');
    if (entry) {
      entry.status = 'invalid';
      entry.message = 'JWT_REFRESH_SECRET must differ from JWT_SECRET.';
    }
  }

  return { ok: errors.length === 0, errors, results };
}

/**
 * Validate the environment and return the typed configuration.
 *
 * Throws on the first misconfiguration with every problem listed, so an
 * operator fixes them in one pass instead of restarting once per variable.
 * The error names variables and rules only — never values.
 */
function loadConfig() {
  const { ok, errors } = inspectEnv();
  if (!ok) {
    const detail = errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(
      `Configuration error — the server cannot start.\n${detail}\n\n` +
        '  Copy backend/.env.example to backend/.env and fill it in, or set these\n' +
        '  variables in the deployment environment. Run `npm run check:env` to re-check.'
    );
  }

  return Object.freeze({
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL?.trim() || null,
    jwtSecret: process.env.JWT_SECRET,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
    allowedOrigins: Object.freeze(
      (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean)
    ),
    port: Number(process.env.PORT) || 5001,
    trustProxy: absent(process.env.TRUST_PROXY) ? null : Number(process.env.TRUST_PROXY),
    adminSeed: process.env.ADMIN_SEED || '',
    cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').trim().toLowerCase(),
    isProduction: isProduction(),
  });
}

module.exports = { SPEC, inspectEnv, loadConfig, MIN_SECRET_LENGTH, SSL_MODES, SAMESITE_MODES };

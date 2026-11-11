/**
 * Structured operational logging (ZT-12): one JSON object per line on stdout
 * (info) or stderr (warn, error), so Render, Docker and any log shipper can
 * filter on fields instead of parsing prose.
 *
 *   {"ts":"2026-11-10T14:03:11.204Z","level":"info","event":"request",
 *    "reqId":"9f2c…","method":"GET","route":"/api/packages/:slug","status":200,"ms":3.4}
 *
 * What is never written, whatever a caller passes:
 *   - passwords, tokens, JWTs, cookies, authorization headers, secrets
 *   - database URLs and credentials
 *   - customer form fields (name, email, phone, message…) and request bodies
 *   - query strings and request headers
 * Keys with those names are replaced by "[redacted]", and every string is
 * scrubbed for emails, phone-like digit runs, JWTs, bearer tokens and
 * connection strings — a PostgreSQL error message can quote the value that
 * violated a constraint ("Key (email)=(…) already exists").
 */

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

/** Field names whose values are never logged, matched case-insensitively. */
const SENSITIVE_KEY = /pass(word)?|secret|token|jwt|cookie|authori[sz]ation|credential|api[-_]?key|session[-_]?id|database[-_]?url|connection|email|phone|name|message|body|query|headers?|address|ip$/i;

/**
 * Our own identifier fields: written verbatim (length-capped), never scrubbed —
 * a request id is a UUID, and the digit-run scrubber would mangle it.
 */
const VERBATIM_KEYS = new Set(['event', 'reqId', 'method', 'route', 'outcome', 'limiter', 'errName', 'errCode',
  'dbClass', 'signal', 'env', 'node', 'migration', 'code', 'target']);

/** Free-text fields we write ourselves; scrubbed, but not redacted by name. */
const SAFE_KEYS = new Set(['status', 'ms', 'count', 'retryAfter', 'port', 'missing', 'context', 'errMessage',
  'stack', 'reason', 'detailCount']);

const SCRUBBERS = [
  [/postgres(ql)?:\/\/[^\s'"]+/gi, '[db-url]'],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, 'Bearer [token]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, '[jwt]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  // Seven or more digits, allowing the separators people type in phone numbers.
  [/\+?\d[\d\s().-]{5,}\d/g, (match) => (match.replace(/\D/g, '').length >= 7 ? '[number]' : match)],
];

/** Remove anything that looks like personal data or a credential from a string. */
function scrub(text, max = 500) {
  let out = String(text);
  for (const [pattern, replacement] of SCRUBBERS) out = out.replace(pattern, replacement);
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

function clean(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return scrub(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 3) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (VERBATIM_KEYS.has(key) && (typeof v === 'string' || typeof v === 'number')) out[key] = String(v).slice(0, 200);
      else if (!SAFE_KEYS.has(key) && SENSITIVE_KEY.test(key)) out[key] = '[redacted]';
      else out[key] = clean(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

/**
 * Database error classes, so an operator can tell "PostgreSQL is down" from
 * "a query has a bug" without reading messages:
 *   db_unavailable  connection refused/reset/terminated, server shutting down
 *   db_timeout      statement_timeout or lock timeout fired (57014, 55P03)
 *   db_constraint   integrity violation (class 23) — usually bad input that validation missed
 *   db_query        any other PostgreSQL error (syntax, missing column…) — our bug
 */
const UNAVAILABLE_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '53300']);

function classifyDbError(err) {
  const code = typeof err?.code === 'string' ? err.code : '';
  const message = typeof err?.message === 'string' ? err.message : '';
  if (UNAVAILABLE_CODES.has(code) || /timeout exceeded when trying to connect|Connection terminated|connect ECONNREFUSED/i.test(message)) {
    return 'db_unavailable';
  }
  if (code === '57014' || code === '55P03') return 'db_timeout';
  if (/^23/.test(code)) return 'db_constraint';
  if (/^[0-9A-Z]{5}$/.test(code)) return 'db_query';
  return null;
}

/** True when PostgreSQL could not be reached, as opposed to a query bug. */
const isDatabaseUnavailable = (err) => classifyDbError(err) === 'db_unavailable';

/**
 * The parts of an error that are safe to log. Never the error object itself:
 * a pg error carries the query, its parameters (customer data) and, for
 * connection errors, the connection settings.
 */
function errorFields(err, { withStack = false } = {}) {
  if (!err) return {};
  const fields = {
    errName: typeof err.name === 'string' ? err.name : undefined,
    errCode: typeof err.code === 'string' ? err.code : undefined,
    errMessage: typeof err.message === 'string' ? scrub(err.message, 300) : undefined,
    dbClass: classifyDbError(err) ?? undefined,
  };
  if (withStack && typeof err.stack === 'string') {
    // Frames only (file:line), without the message line, which may echo values.
    fields.stack = err.stack.split('\n').slice(1, 9).map((l) => scrub(l.trim(), 200)).join(' | ');
  }
  return fields;
}

function createLogger({ level = process.env.LOG_LEVEL || 'info', out = process.stdout, err = process.stderr, now = () => new Date() } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const write = (lvl, event, fields = {}) => {
    if (LEVELS[lvl] < threshold) return;
    const line = { ts: now().toISOString(), level: lvl, event, ...clean(fields) };
    for (const key of Object.keys(line)) if (line[key] === undefined) delete line[key];
    (LEVELS[lvl] >= LEVELS.warn ? err : out).write(`${JSON.stringify(line)}\n`);
  };
  return {
    debug: (event, fields) => write('debug', event, fields),
    info: (event, fields) => write('info', event, fields),
    warn: (event, fields) => write('warn', event, fields),
    error: (event, fields) => write('error', event, fields),
  };
}

/** The process-wide logger. Tests pass their own sinks to createLogger instead. */
const log = createLogger();

module.exports = { log, createLogger, scrub, clean, classifyDbError, isDatabaseUnavailable, errorFields, LEVELS };

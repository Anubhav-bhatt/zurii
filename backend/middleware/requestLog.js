/**
 * Request ids and the access log (ZT-12).
 *
 * Every request gets an id — the caller's `X-Request-Id` when it is a short
 * opaque token, otherwise a new UUID — echoed back in the `X-Request-Id`
 * response header and attached to every log line written for it, so a
 * visitor's "it failed" can be matched to the server's record of why.
 *
 * One `request` line per response: method, the matched ROUTE PATTERN
 * (`/api/packages/:slug`, never the raw URL or its query string), status,
 * duration and an outcome that separates the visitor's mistakes from ours:
 *
 *   ok            2xx/3xx
 *   client_error  4xx — validation, auth, not found: expected, level info
 *   rate_limited  429 — level warn
 *   server_error  5xx — a genuine backend failure, level error
 *
 * Successful health and readiness probes are not logged: the container
 * healthcheck hits them every 30 s. Failing probes are.
 */
const crypto = require('crypto');
const { log: defaultLog } = require('../lib/logger');

const INCOMING_ID = /^[A-Za-z0-9._-]{8,64}$/;
const QUIET_PATHS = new Set(['/api/health', '/api/ready']);

/**
 * The matched route pattern (/api/packages/:slug). When a router's middleware
 * answered before any route matched — an auth refusal — its mount point
 * (/api/admin/leads/*). Otherwise 'unmatched'. Never the raw URL.
 */
function routeOf(req) {
  const pattern = req.route?.path;
  if (typeof pattern === 'string') return `${req.baseUrl || ''}${pattern}`;
  if (req.baseUrl) return `${req.baseUrl}/*`;
  return 'unmatched';
}

function outcomeOf(status) {
  if (status >= 500) return 'server_error';
  if (status === 429) return 'rate_limited';
  if (status >= 400) return 'client_error';
  return 'ok';
}

function createRequestLogger({ log = defaultLog } = {}) {
  return function requestLogger(req, res, next) {
    const incoming = req.get('x-request-id');
    req.id = incoming && INCOMING_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.set('X-Request-Id', req.id);

    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const status = res.statusCode;
      // originalUrl, not path: inside a mounted router req.path is relative.
      if (status < 400 && QUIET_PATHS.has(req.originalUrl.split('?')[0])) return;
      const outcome = outcomeOf(status);
      const fields = {
        reqId: req.id,
        method: req.method,
        route: routeOf(req),
        status,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        outcome,
      };
      if (outcome === 'server_error') log.error('request', fields);
      else if (outcome === 'rate_limited') log.warn('request', fields);
      else log.info('request', fields);
    });
    next();
  };
}

module.exports = { createRequestLogger, routeOf, outcomeOf };

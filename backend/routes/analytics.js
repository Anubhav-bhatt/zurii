/**
 * Public write API for anonymous analytics events.
 *
 *   POST /api/analytics/events   record one event (no auth — fired by the
 *                                browser client, fire-and-forget)
 *
 * Conventions follow routes/bookings.js and server.js: `{ success, data }` /
 * `{ success: false, error }`, a structured log line for the operator, a generic
 * sentence for the client, and every value reaching SQL is a bound parameter.
 * A database error message can name tables and columns, so it never crosses
 * the wire.
 *
 * Success is 202 Accepted, not 201: the client neither needs nor reads a body
 * beyond `{ success: true }`, and nothing about the stored row is echoed back.
 *
 * The only trusted input is what lib/validateEvent.js returns — which also
 * guarantees no personal data field ever has a column to land in here.
 *
 * Rate limiting is a small in-memory per-IP counter (fixed window), not a new
 * dependency: this is abuse damping for a single-process deployment, not
 * billing-grade accounting. The limit is injectable so tests do not need to
 * send 120 requests.
 */
const express = require('express');
const { log, errorFields } = require('../lib/logger');
const { validateEvent } = require('../lib/validateEvent');
// Same client key as every other limiter: the trusted-proxy-aware req.ip,
// with IPv6 reduced to its prefix so one client cannot rotate addresses.
const { clientKey } = require('../middleware/security');
const { createWorkGate, WorkGateBusyError } = require('../lib/workGate');

/**
 * Analytics shares the connection pool with the enquiry forms, and leads come
 * first. At most 3 event inserts run at once (50 more may wait); beyond that an
 * event is dropped with a quick 503 instead of queueing for a connection — so
 * a burst of page views can never occupy the pool a lead needs. Events are
 * fire-and-forget on the client, so nothing visible changes.
 */
const ANALYTICS_GATE = Object.freeze({ concurrency: 3, maxQueue: 50 });

const DEFAULT_LIMIT = 120; // events per IP per window
const DEFAULT_WINDOW_MS = 60_000; // one minute
const SWEEP_THRESHOLD = 5_000; // prune expired buckets once the map grows past this
const HARD_CAP = 50_000; // absolute bucket ceiling — new IPs are refused beyond this

module.exports = function createAnalyticsRouter(pool, options = {}) {
  const gate = createWorkGate(options.gate ?? ANALYTICS_GATE);
  const limit = Number.isInteger(options.rateLimit) && options.rateLimit > 0
    ? options.rateLimit
    : DEFAULT_LIMIT;
  const windowMs = Number.isInteger(options.rateLimitWindowMs) && options.rateLimitWindowMs > 0
    ? options.rateLimitWindowMs
    : DEFAULT_WINDOW_MS;

  /** ip -> { count, resetAt }; expired buckets are replaced on next hit. */
  const buckets = new Map();
  let lastSweepAt = 0;

  /** True when this request pushes the caller over the per-window limit. */
  function overLimit(ip) {
    const now = Date.now();

    // Lazy sweep: buckets for one-off IPs would otherwise accumulate forever.
    // At most once per window — during a distinct-IP flood nothing has expired
    // yet, and a full O(n) scan on every request would be the real damage.
    if (buckets.size > SWEEP_THRESHOLD && now - lastSweepAt >= windowMs) {
      lastSweepAt = now;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const bucket = buckets.get(ip);
    if (!bucket || bucket.resetAt <= now) {
      // Hard memory ceiling: when an address-rotation flood fills the map,
      // refuse events from NEW addresses rather than growing without bound.
      // Established callers keep their buckets; analytics loss is by design
      // preferable to an OOM'd server.
      if (!bucket && buckets.size >= HARD_CAP) return true;
      buckets.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }
    bucket.count += 1;
    return bucket.count > limit;
  }

  /** Seconds until the caller's window resets, for Retry-After. */
  function retryAfterSeconds(key) {
    const bucket = buckets.get(key);
    return Math.max(1, Math.ceil(((bucket?.resetAt ?? Date.now() + windowMs) - Date.now()) / 1000));
  }

  const router = express.Router();

  // ── POST /events (mounted at /api/analytics) ─────────────────────
  router.post('/events', async (req, res) => {
    // The IP is used ONLY as a transient rate-limit bucket key and is never
    // written to the database — IP-as-identity is a locked-out design here.
    const key = clientKey(req);
    if (overLimit(key)) {
      res.set('Retry-After', String(retryAfterSeconds(key)));
      return res.status(429).json({ success: false, error: 'Too many events. Please slow down.', code: 'RATE_LIMITED' });
    }

    const { valid, error, value } = validateEvent(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, error });
    }

    try {
      await gate.run(() => pool.query(
        `INSERT INTO analytics_events
           (visitor_id, session_id, event_type, entity_type, entity_id,
            entity_slug, page_path, referrer, utm, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          value.visitorId,
          value.sessionId,
          value.type,
          value.entityType,
          value.entityId,
          value.entitySlug,
          value.path,
          value.referrer,
          value.utm === null ? null : JSON.stringify(value.utm),
          JSON.stringify(value.meta),
        ]
      ));

      res.status(202).json({ success: true });
    } catch (err) {
      if (err instanceof WorkGateBusyError) {
        return res.status(503).json({ success: false, error: 'Busy — event not recorded.', code: 'ANALYTICS_BUSY' });
      }
      log.error('handler_error', { reqId: req.id, context: 'analytics_insert', ...errorFields(err) });
      res.status(500).json({ success: false, error: 'Failed to record the event.' });
    }
  });

  return router;
};

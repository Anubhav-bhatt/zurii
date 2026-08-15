/**
 * Liveness and readiness probes.
 *
 *   GET /api/health   is the process alive?            (no database access)
 *   GET /api/ready    can it actually serve requests?  (database checked)
 *
 * WHY BOTH. The container healthcheck used to probe GET /api/contact, which is
 * auth-guarded and answers 401 before it ever touches PostgreSQL. A backend
 * whose database was unreachable therefore reported *healthy* indefinitely:
 * the orchestrator saw a passing check while every real request failed. The
 * split fixes that without swapping one wrong signal for another —
 *
 *   liveness  answers "restarting me would help" — it must NOT depend on the
 *             database, because restarting the API cannot fix a database
 *             outage and a restart loop during one only removes the capacity
 *             that would have recovered on its own.
 *   readiness answers "send me traffic" — it must depend on the database,
 *             because an API that cannot query is not ready to serve.
 *
 * Neither response contains configuration. No versions, no environment, no
 * connection strings, no host names, no error text from the driver — a probe
 * endpoint is unauthenticated by necessity, so everything it returns is public.
 */
const express = require('express');

/**
 * Readiness is cached for this long. The probe runs on a schedule, but the
 * endpoint is public: without a cache, anyone could turn it into an unbounded
 * `SELECT 1` generator against the database. One check per window is enough
 * for any orchestrator and bounds the load regardless of who calls it.
 */
const READY_CACHE_MS = 5_000;

/** How long a readiness query may take before it is treated as a failure. */
const READY_TIMEOUT_MS = 3_000;

module.exports = function createHealthRouter(pool, options = {}) {
  const router = express.Router();
  const cacheMs = Number.isInteger(options.cacheMs) ? options.cacheMs : READY_CACHE_MS;
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : READY_TIMEOUT_MS;

  /** @type {{ at: number, ready: boolean } | null} */
  let cached = null;
  /** In-flight check, shared so a burst of probes issues one query, not N. */
  let inFlight = null;

  async function checkDatabase() {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  }

  async function isReady() {
    const now = Date.now();
    if (cached && now - cached.at < cacheMs) return cached.ready;

    if (!inFlight) {
      // A pool with no free connections leaves `connect()` pending forever,
      // which would hang the probe rather than failing it — an orchestrator
      // waiting on a response that never arrives is worse than a clear "not
      // ready", so the race below bounds it.
      const timeout = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
      inFlight = Promise.race([checkDatabase(), timeout])
        .catch(() => false)
        .then((ready) => {
          cached = { at: Date.now(), ready };
          inFlight = null;
          return ready;
        });
    }
    return inFlight;
  }

  // ── GET /health ───────────────────────────────────────────────────
  // Deliberately trivial: if the event loop can run this handler, the process
  // is alive. Answering without I/O is the point.
  router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // ── GET /ready ────────────────────────────────────────────────────
  // 200 when the database answered, 503 when it did not. The body carries no
  // reason: the operator reads the cause from the server log, where
  // db/pool.js and server.js report it, and a public endpoint should not
  // describe the internal failure.
  router.get('/ready', async (req, res) => {
    const ready = await isReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready' });
  });

  return router;
};

module.exports.READY_CACHE_MS = READY_CACHE_MS;
module.exports.READY_TIMEOUT_MS = READY_TIMEOUT_MS;

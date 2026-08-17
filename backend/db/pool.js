/**
 * Shared PostgreSQL pool.
 *
 * The connection/TLS logic used to be duplicated in server.js and
 * create-admin.js. Migration scripts need it too, so it lives here once.
 *
 * .env is resolved relative to this file rather than the working directory,
 * so `node scripts/migrateTravelData.mjs` works from any cwd.
 *
 * The variables read here (DATABASE_URL, DATABASE_SSL, DATABASE_CA_CERT) are
 * declared and validated in config/env.js, which is the source of truth for
 * what a valid value looks like. This module only applies them.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Resolve the `ssl` option for node-postgres.
 *
 * DATABASE_SSL selects the mode explicitly:
 *
 *   verify     Require TLS AND verify the server certificate chain. The
 *              strongest setting, and the right one for production. Managed
 *              providers issue certificates from their own CA, so this
 *              normally needs DATABASE_CA_CERT pointing at the CA bundle they
 *              give you (Aiven, for example, offers one for download).
 *   no-verify  Require TLS but accept any certificate. Encrypts the connection
 *              yet cannot detect an interceptor, so it protects against passive
 *              capture only. Use when a provider gives you no CA bundle.
 *   disable    No TLS. Correct for a database on localhost or a private Docker
 *              network, wrong for anything crossing a public network.
 *
 * When DATABASE_SSL is unset the historical default applies — TLS off for a
 * local host, TLS-without-verification for everything else — because that is
 * what every existing deployment and the bundled Compose stack rely on. It is
 * a compatible default, not a recommendation: server.js warns at startup when
 * production runs unverified, and DEPLOYMENT.md documents `verify`.
 *
 * Certificate verification is never disabled implicitly. Reaching `no-verify`
 * always takes either an explicit DATABASE_SSL or the documented legacy
 * default, so no code path silently downgrades a verified connection.
 */
function resolveSsl(host, env = process.env) {
  const mode = env.DATABASE_SSL?.trim();

  if (mode === 'disable') return false;

  if (mode === 'verify') {
    const ca = readCaCert(env);
    // `rejectUnauthorized: true` is node-postgres's default once `ssl` is an
    // object, but it is stated explicitly because this is the security
    // property the whole mode exists for.
    return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
  }

  if (mode === 'no-verify') return { rejectUnauthorized: false };

  // Unset: preserve the original behaviour.
  if (LOCAL_HOSTS.has(host)) return false;
  return { rejectUnauthorized: false };
}

/**
 * Read the CA bundle for `verify` mode. DATABASE_CA_CERT may hold either a
 * path to a PEM file or the PEM text itself, because a container platform
 * often makes it easier to inject one than the other.
 */
function readCaCert(env = process.env) {
  const raw = env.DATABASE_CA_CERT?.trim();
  if (!raw) return null;
  if (raw.includes('BEGIN CERTIFICATE')) return raw;
  try {
    return fs.readFileSync(raw, 'utf8');
  } catch (err) {
    // The path is operator-supplied configuration, not a secret, so naming it
    // is safe and is the only way to make this diagnosable.
    throw new Error(
      `DATABASE_CA_CERT points at a file that could not be read: ${raw} (${err.code || err.message})`
    );
  }
}

/**
 * Pool sizing and the one timeout worth setting.
 *
 * The default `connectionTimeoutMillis` is 0, which means "wait forever". If the
 * database is unreachable or its connection limit is saturated, every request
 * that needs a client parks indefinitely: the process accumulates hung requests
 * and the memory behind them, /api/health keeps answering "alive" because the
 * event loop is fine, and no error ever surfaces for an operator to act on. A
 * finite value turns that into a 503 from /api/ready and a logged failure.
 *
 *   max                      10 — node-postgres's default, stated explicitly.
 *                            One Render instance against a managed Postgres with
 *                            a modest connection cap; the entrypoint already
 *                            assumes a single instance. Raising it would not make
 *                            a 68-row catalogue faster, only bring the
 *                            provider's connection ceiling closer.
 *   idleTimeoutMillis        10s — the default. Returns connections promptly
 *                            rather than holding the pool open across quiet
 *                            periods.
 *   connectionTimeoutMillis  30s — bounded, but deliberately generous.
 *
 * WHY 30s AND NOT 10s. 10s was the first value here and it made the test suite
 * fail intermittently — two runs in four, as `hookFailed: test server did not
 * start in time`. Seven test files run in parallel, each with its own pool plus a
 * spawned server with another, all against one remote database, and acquiring a
 * connection under that contention can exceed ten seconds. The server then exits
 * during initDB() and never binds. The tests were right and the setting was
 * wrong: the goal is to stop waiting *forever*, and 30s does that without
 * turning ordinary contention into a failure. It was not the test's timeout that
 * needed raising.
 *
 * WHY THERE IS NO `statement_timeout`. It was set to 20s here and that was a
 * production hazard, not a safety net. Eight scripts in scripts/ take their
 * client from this pool, and db/baseSchema.js runs 23 DDL statements through it;
 * docker-entrypoint.sh executes those migrations on every container boot under
 * `set -e`. A CREATE INDEX or ALTER TABLE that legitimately runs past the
 * ceiling — a bigger table, or a lock held by another connection — would be
 * cancelled mid-migration and abort the boot. A per-query fuse belongs on the
 * request path, not on a pool that migrations share.
 *
 * Also deliberately absent: `query_timeout`. It gives up client-side while the
 * server keeps executing, freeing the caller but not the database — the opposite
 * of what a saturated instance needs.
 */
const POOL_DEFAULTS = Object.freeze({
  max: 10,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 30_000,
});

/**
 * Parse DATABASE_URL into a pg config, applying the TLS mode above.
 */
function buildConfig(url = process.env.DATABASE_URL, env = process.env) {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create backend/.env with your PostgreSQL connection string.'
    );
  }
  const config = parse(url);
  config.ssl = resolveSsl(config.host, env);
  // Defaults first, so an explicit parameter in DATABASE_URL still wins — the
  // connection string remains the operator's override for any of these.
  return { ...POOL_DEFAULTS, ...config };
}

/**
 * True when this configuration encrypts but does not authenticate the server.
 * server.js uses it to warn once at startup in production.
 */
function isUnverifiedTls(config) {
  return Boolean(config?.ssl) && config.ssl.rejectUnauthorized === false;
}

let pool = null;

/** Lazily created singleton pool, so importing this module never connects. */
function getPool() {
  if (!pool) pool = new Pool(buildConfig());
  return pool;
}

module.exports = { buildConfig, getPool, resolveSsl, isUnverifiedTls, LOCAL_HOSTS };

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
  return config;
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

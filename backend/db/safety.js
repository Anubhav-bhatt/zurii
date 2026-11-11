/**
 * Database target safety guards.
 *
 * Every tool that can create, rewrite or destroy data — the migration runner,
 * the catalogue seeder, the test-database reset, the guarded test runner and
 * the manual data scripts under scripts/ — must prove WHICH database it is
 * talking to before it writes anything. "It said localhost" is not proof:
 * a tunnel, a port-forward or a copied .env can make a production database
 * answer on 127.0.0.1. So a target is accepted only when ALL of these hold:
 *
 *   1. URL     — the connection string names the exact expected database
 *                (zurii_dev / zurii_test) on an approved local host.
 *   2. ISOLATED — for tests: it shares neither its database nor its credentials
 *                with any other configured URL (no silent reuse of DATABASE_URL).
 *   3. SERVER  — after connecting, current_database() is the expected one…
 *   4. MARKER  — …and current_setting('zurii.environment') carries the marker
 *                that only infra/local-db/init/10-zurii-databases.sh sets.
 *                A production database never has it.
 *   5. ROLE    — the session is not a superuser (least-privilege app role).
 *
 * Messages name variables, hosts and database names — never passwords.
 */
const { Client } = require('pg');
const { parse } = require('pg-connection-string');
const { buildConfig } = require('./pool');

const DEFAULT_LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '::1']);

const TARGETS = Object.freeze({
  development: Object.freeze({ name: 'development', urlVar: 'DATABASE_URL', database: 'zurii_dev', marker: 'development' }),
  test: Object.freeze({ name: 'test', urlVar: 'TEST_DATABASE_URL', database: 'zurii_test', marker: 'test' }),
});

class DatabaseSafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseSafetyError';
  }
}

const normHost = (host) => String(host ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
const portOf = (cfg) => String(cfg.port || '5432');

/**
 * Hosts a guarded target may live on. ZURII_LOCAL_DB_HOSTS adds names for a
 * container network you control (e.g. a compose service name) — it is an
 * explicit, per-machine opt-in, never a default.
 */
function approvedLocalHosts(env = process.env) {
  const extra = String(env.ZURII_LOCAL_DB_HOSTS || '')
    .split(',')
    .map(normHost)
    .filter(Boolean);
  return new Set([...DEFAULT_LOCAL_HOSTS, ...extra]);
}

function parseUrl(url, label) {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new DatabaseSafetyError(`${label} is not set.`);
  }
  if (!/^postgres(ql)?:\/\//i.test(url.trim())) {
    throw new DatabaseSafetyError(`${label} must be a postgres:// or postgresql:// URL.`);
  }
  try {
    return parse(url.trim());
  } catch {
    throw new DatabaseSafetyError(`${label} is not a valid PostgreSQL connection string.`);
  }
}

/**
 * Checks 1 and 2 — everything that can be decided before connecting.
 *
 * @param {'development'|'test'} targetName
 * @param {string} url
 * @param {object} [options]
 * @param {object} [options.env]          environment for ZURII_LOCAL_DB_HOSTS
 * @param {string} [options.label]        variable name used in messages
 * @param {Array<{label: string, url: string|undefined}>} [options.compareWith]
 *        other configured URLs this target must not share a database or
 *        credentials with (e.g. the development DATABASE_URL, for tests)
 * @returns {{target: string, host: string, port: string, database: string, user: string|null}}
 */
function assertTargetUrl(targetName, url, { env = process.env, label, compareWith = [] } = {}) {
  const target = TARGETS[targetName];
  if (!target) throw new DatabaseSafetyError(`Unknown database target "${targetName}".`);
  const name = label || target.urlVar;
  const cfg = parseUrl(url, name);
  const host = normHost(cfg.host);

  if (!host || host.startsWith('/')) {
    throw new DatabaseSafetyError(
      `${name} must name an explicit TCP host; Unix-socket connections are not accepted for the ${target.name} target.`
    );
  }
  if (cfg.database !== target.database) {
    throw new DatabaseSafetyError(
      `${name} points at database "${cfg.database ?? '(none)'}", but the ${target.name} target requires exactly ` +
        `"${target.database}". Refusing.`
    );
  }
  const hosts = approvedLocalHosts(env);
  if (!hosts.has(host)) {
    throw new DatabaseSafetyError(
      `${name} host "${host}" is not an approved local database host (${[...hosts].join(', ')}). Refusing.`
    );
  }

  for (const other of compareWith) {
    if (!other?.url) continue;
    let o;
    try {
      o = parse(other.url);
    } catch {
      continue;
    }
    if (normHost(o.host) === host && portOf(o) === portOf(cfg) && o.database === cfg.database) {
      throw new DatabaseSafetyError(`${name} and ${other.label} point at the same database. Refusing.`);
    }
    if (o.user && o.user === cfg.user && o.password && o.password === cfg.password) {
      throw new DatabaseSafetyError(
        `${name} reuses the credentials of ${other.label}. The ${target.name} target needs its own role. Refusing.`
      );
    }
  }

  return Object.freeze({ target: target.name, host, port: portOf(cfg), database: cfg.database, user: cfg.user ?? null });
}

/** Checks 3–5 — run on a live connection before the first write. */
async function verifyConnectedDatabase(client, targetName) {
  const target = TARGETS[targetName];
  if (!target) throw new DatabaseSafetyError(`Unknown database target "${targetName}".`);
  const { rows } = await client.query(
    `SELECT current_database() AS database,
            current_user AS username,
            current_setting('zurii.environment', true) AS marker,
            (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`
  );
  const row = rows[0];
  if (row.database !== target.database) {
    throw new DatabaseSafetyError(
      `Connected to database "${row.database}", expected "${target.database}". Refusing.`
    );
  }
  if (row.marker !== target.marker) {
    throw new DatabaseSafetyError(
      `Database "${row.database}" does not carry the ${target.name} marker ` +
        `(zurii.environment is "${row.marker || 'unset'}", expected "${target.marker}"). Refusing.`
    );
  }
  if (row.superuser) {
    throw new DatabaseSafetyError(
      `Connected as superuser "${row.username}". Guarded tools must use the least-privilege app role. Refusing.`
    );
  }
  return { database: row.database, user: row.username };
}

/** All five checks, returning a connected and verified pg Client. */
async function connectVerified(targetName, url, { env = process.env, label, compareWith } = {}) {
  const info = assertTargetUrl(targetName, url, { env, label, compareWith });
  const client = new Client(buildConfig(url, env));
  await client.connect();
  try {
    await verifyConnectedDatabase(client, targetName);
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return { client, info };
}

/**
 * For code running INSIDE a test process (tests/helpers/testDatabaseGuard.mjs).
 * Only backend/scripts/run-tests.mjs sets ZURII_DB_TARGET=test, and it sets
 * DATABASE_URL to the verified test URL — so a test file launched any other
 * way (a bare `node --test`, an IDE runner) refuses before touching a database.
 */
function assertTestProcess(env = process.env) {
  if (env.ZURII_DB_TARGET !== 'test') {
    throw new DatabaseSafetyError(
      'Database-backed tests must be started with `npm test` (backend/scripts/run-tests.mjs), which selects and ' +
        'verifies the isolated zurii_test database. ZURII_DB_TARGET is not "test" here, so this test will not touch any database.'
    );
  }
  return assertTargetUrl('test', env.DATABASE_URL, { env, label: 'DATABASE_URL (test process)' });
}

/**
 * Production is a deliberate, separately approved operation — never a default.
 * Requires ZURII_PRODUCTION_DB_APPROVED=yes, an explicit --confirm-database that
 * matches both the URL and current_database(), and a database WITHOUT a
 * development/test marker (so a local database can never be "production").
 */
async function connectProductionVerified(url, { env = process.env, confirmDatabase } = {}) {
  if (env.ZURII_PRODUCTION_DB_APPROVED !== 'yes') {
    throw new DatabaseSafetyError(
      'The production target requires ZURII_PRODUCTION_DB_APPROVED=yes, set only for an approved maintenance window. Refusing.'
    );
  }
  const cfg = parseUrl(url, 'DATABASE_URL');
  if (!confirmDatabase || confirmDatabase !== cfg.database) {
    throw new DatabaseSafetyError(
      'The production target requires --confirm-database <name> matching the database in DATABASE_URL. Refusing.'
    );
  }
  const client = new Client(buildConfig(url, env));
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT current_database() AS database, current_setting('zurii.environment', true) AS marker`
    );
    if (rows[0].database !== confirmDatabase) {
      throw new DatabaseSafetyError(`Connected to "${rows[0].database}", not the confirmed "${confirmDatabase}". Refusing.`);
    }
    if (rows[0].marker === 'development' || rows[0].marker === 'test') {
      throw new DatabaseSafetyError(`"${rows[0].database}" is a local ${rows[0].marker} database, not production. Refusing.`);
    }
  } catch (err) {
    await client.end().catch(() => {});
    throw err;
  }
  return { client, info: { target: 'production', database: cfg.database, host: normHost(cfg.host) } };
}

/**
 * Guard for the older manual data scripts (catalogue import, demo seed/remove,
 * image corrections, the v1 schema script). They read DATABASE_URL.
 *
 *   - Local host: the database must be zurii_dev or zurii_test AND carry its
 *     marker, connected as a non-superuser.
 *   - Any other host: refused unless ZURII_CONFIRM_REMOTE_DATABASE names the
 *     exact database — a deliberate, backed-up operator action, never an accident.
 */
async function guardManualDataScript(scriptName, { env = process.env } = {}) {
  const cfg = parseUrl(env.DATABASE_URL, 'DATABASE_URL');
  const host = normHost(cfg.host);
  const client = new Client(buildConfig(env.DATABASE_URL, env));

  if (approvedLocalHosts(env).has(host)) {
    const target = Object.values(TARGETS).find((t) => t.database === cfg.database);
    if (!target) {
      throw new DatabaseSafetyError(
        `${scriptName} writes data. DATABASE_URL points at local database "${cfg.database}", which is not a ` +
          'recognised Zurii database (zurii_dev, zurii_test). Refusing.'
      );
    }
    await client.connect();
    try {
      await verifyConnectedDatabase(client, target.name);
    } finally {
      await client.end();
    }
    return { mode: 'local', database: cfg.database };
  }

  if (!env.ZURII_CONFIRM_REMOTE_DATABASE || env.ZURII_CONFIRM_REMOTE_DATABASE !== cfg.database) {
    throw new DatabaseSafetyError(
      `${scriptName} writes data, and DATABASE_URL points at a non-local host. To run it there deliberately, take a ` +
        'backup first, then set ZURII_CONFIRM_REMOTE_DATABASE to the exact database name. Refusing.'
    );
  }
  await client.connect();
  try {
    const { rows } = await client.query('SELECT current_database() AS database');
    if (rows[0].database !== env.ZURII_CONFIRM_REMOTE_DATABASE) {
      throw new DatabaseSafetyError(`Connected to "${rows[0].database}", not the confirmed database. Refusing.`);
    }
  } finally {
    await client.end();
  }
  return { mode: 'remote-confirmed', database: cfg.database };
}

module.exports = {
  TARGETS,
  DEFAULT_LOCAL_HOSTS,
  DatabaseSafetyError,
  approvedLocalHosts,
  assertTargetUrl,
  verifyConnectedDatabase,
  connectVerified,
  assertTestProcess,
  connectProductionVerified,
  guardManualDataScript,
};

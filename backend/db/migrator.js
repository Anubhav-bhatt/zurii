/**
 * Versioned, ledger-based schema migrations.
 *
 *   db/migrations/NNNN_description.sql   forward-only, applied in id order
 *   schema_migrations                    ledger: id, checksum, applied_at, …
 *
 * Guarantees:
 *   - each migration runs ONCE, inside its own transaction, and is recorded in
 *     the same transaction — it either fully applies or leaves no trace;
 *   - an applied file that is later edited is detected by its SHA-256 checksum
 *     and stops the run (history must never be rewritten silently);
 *   - concurrent runners are excluded by a PostgreSQL advisory lock;
 *   - lock_timeout / statement_timeout bound how long DDL may wait or run;
 *   - no table renames, no data changes — seeding lives in db/catalogueSeed.js;
 *   - a database that already has application tables but no ledger (i.e. one
 *     built by the old boot-time scripts, such as production) is NEVER adopted
 *     automatically. --adopt-baseline first proves its schema identical to
 *     0001_baseline_schema; only then is 0001 recorded as applied, without
 *     executing it. Nothing is written before that proof.
 *
 * Target selection and safety checks are the caller's job (scripts/db.mjs uses
 * db/safety.js); this module only ever acts on the client it is handed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { describeSchema, compareSchemas } = require('./schemaSnapshot');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const BASELINE_ID = '0001_baseline_schema';
const BASELINE_SNAPSHOT = path.join(__dirname, 'schema', `${BASELINE_ID}.snapshot.json`);

/** Arbitrary constant; identifies "a Zurii migration is running" to pg_try_advisory_lock. */
const ADVISORY_LOCK_KEY = 771805210;

/** The seven application tables the baseline owns. */
const APP_TABLES = Object.freeze([
  'contacts', 'bookings', 'destinations', 'packages', 'analytics_events', 'admins', 'admin_audit_logs',
]);

/**
 * Objects created by migrations AFTER the baseline, idempotently. A database
 * being adopted may already have them (e.g. production after the manual
 * migrate:admin-username), which must not block adoption.
 */
const POST_BASELINE_INDEXES = Object.freeze(['admins_username_lower_key']);

const LEDGER_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id            VARCHAR(200) PRIMARY KEY,
    checksum      CHAR(64)     NOT NULL,
    applied_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    applied_by    TEXT         NOT NULL DEFAULT current_user,
    execution_ms  INTEGER      NOT NULL DEFAULT 0,
    adopted       BOOLEAN      NOT NULL DEFAULT FALSE
  )`;

/** Line endings are normalised so a Windows checkout does not change a checksum. */
function checksumOf(sql) {
  return crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function loadMigrations(dir = MIGRATIONS_DIR) {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
        throw new Error(`Migration file "${file}" must be named like 0001_description.sql`);
      }
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const withoutComments = sql.replace(/--.*$/gm, '');
      if (/\b(BEGIN|COMMIT|ROLLBACK)\s*;/i.test(withoutComments)) {
        throw new Error(`Migration ${file} must not manage its own transaction; the runner wraps each file.`);
      }
      return { id: file.slice(0, -'.sql'.length), file, sql, checksum: checksumOf(sql) };
    });
}

async function ledgerExists(client) {
  const { rows } = await client.query(`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present`);
  return rows[0].present;
}

async function readLedger(client) {
  if (!(await ledgerExists(client))) return [];
  const { rows } = await client.query(
    'SELECT id, checksum, applied_at, adopted FROM schema_migrations ORDER BY id'
  );
  return rows;
}

async function existingAppTables(client) {
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY 1`,
    [APP_TABLES]
  );
  return rows.map((r) => r.table_name);
}

/** Compare the ledger with the files on disk. */
function plan(migrations, ledgerRows) {
  const problems = [];
  const files = new Map(migrations.map((m) => [m.id, m]));
  for (const row of ledgerRows) {
    const file = files.get(row.id);
    if (!file) problems.push(`${row.id} is recorded as applied but has no file in db/migrations (database is ahead of this code)`);
    else if (file.checksum !== String(row.checksum).trim()) problems.push(`${row.id} was modified after it was applied (checksum mismatch)`);
  }
  const applied = new Set(ledgerRows.map((r) => r.id));
  const pending = migrations.filter((m) => !applied.has(m.id));
  const lastApplied = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].id : null;
  for (const m of pending) {
    if (lastApplied && m.id < lastApplied) problems.push(`${m.id} is pending but sorts before the already-applied ${lastApplied}`);
  }
  return { pending, problems };
}

function loadBaselineSnapshot() {
  return JSON.parse(fs.readFileSync(BASELINE_SNAPSHOT, 'utf8'));
}

/** Differences between the connected database and the baseline (adoption rules). */
async function baselineDifferences(client) {
  const actual = await describeSchema(client);
  return compareSchemas(loadBaselineSnapshot(), actual, {
    ignoreColumnOrder: true, // older databases gained columns by ALTER, in a different order
    allowExtraIndexes: POST_BASELINE_INDEXES,
  });
}

async function status(client) {
  const migrations = loadMigrations();
  const ledgerRows = await readLedger(client);
  const { pending, problems } = plan(migrations, ledgerRows);
  return {
    ledgerPresent: await ledgerExists(client),
    applied: ledgerRows.map((r) => ({ id: r.id, appliedAt: r.applied_at, adopted: r.adopted })),
    pending: pending.map((m) => m.id),
    problems,
    appTables: await existingAppTables(client),
  };
}

/**
 * Apply every pending migration.
 *
 * @param {import('pg').Client} client  an already-verified connection
 * @param {object} [options]
 * @param {boolean} [options.adoptBaseline]  allow verified adoption of an existing schema
 * @param {(line: string) => void} [options.log]
 */
async function migrate(client, { adoptBaseline = false, log = console.log, lockTimeout = '10s', statementTimeout = '5min' } = {}) {
  const migrations = loadMigrations();

  const { rows: lockRows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [ADVISORY_LOCK_KEY]);
  if (!lockRows[0].locked) {
    throw new Error('Another migration run holds the Zurii migration lock. Nothing was changed; retry when it finishes.');
  }

  try {
    await client.query(
      `SELECT set_config('lock_timeout', $1, false), set_config('statement_timeout', $2, false)`,
      [lockTimeout, statementTimeout]
    );

    if (!(await ledgerExists(client))) {
      const existing = await existingAppTables(client);
      if (existing.length > 0) {
        if (!adoptBaseline) {
          throw new Error(
            `This database already has application tables (${existing.join(', ')}) but no migration ledger. ` +
              'Nothing was changed. It is never adopted automatically: run `verify` against it, then re-run ' +
              '`migrate --adopt-baseline` only if the schema is reported identical.'
          );
        }
        const differences = await baselineDifferences(client);
        if (differences.length > 0) {
          throw new Error(
            `Refusing to adopt ${BASELINE_ID}: the existing schema differs from it. Nothing was changed.\n  - ` +
              differences.join('\n  - ')
          );
        }
        const baseline = migrations.find((m) => m.id === BASELINE_ID);
        await client.query('BEGIN');
        try {
          await client.query(LEDGER_DDL);
          await client.query(
            'INSERT INTO schema_migrations (id, checksum, adopted) VALUES ($1, $2, TRUE)',
            [baseline.id, baseline.checksum]
          );
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        }
        log(`  ✓ adopted ${BASELINE_ID}: existing schema verified identical (nothing executed)`);
      } else {
        await client.query(LEDGER_DDL);
      }
    }

    const ledgerRows = await readLedger(client);
    const { pending, problems } = plan(migrations, ledgerRows);
    if (problems.length > 0) {
      throw new Error(`Migration history does not match db/migrations. Nothing was changed.\n  - ${problems.join('\n  - ')}`);
    }

    const applied = [];
    for (const migration of pending) {
      const started = Date.now();
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (id, checksum, execution_ms) VALUES ($1, $2, $3)',
          [migration.id, migration.checksum, Date.now() - started]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        err.message = `Migration ${migration.id} failed and was rolled back: ${err.message}`;
        throw err;
      }
      applied.push(migration.id);
      log(`  ✓ applied ${migration.id} (${Date.now() - started} ms)`);
    }
    return { applied, alreadyApplied: ledgerRows.map((r) => r.id), total: migrations.length };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.query('RESET lock_timeout').catch(() => {});
    await client.query('RESET statement_timeout').catch(() => {});
  }
}

module.exports = {
  migrate,
  status,
  loadMigrations,
  checksumOf,
  baselineDifferences,
  loadBaselineSnapshot,
  BASELINE_ID,
  BASELINE_SNAPSHOT,
  APP_TABLES,
  POST_BASELINE_INDEXES,
  MIGRATIONS_DIR,
};

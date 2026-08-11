/**
 * Schema migration for admin security hardening.
 *
 * Idempotent — safe to run repeatedly. It never drops, truncates or rewrites
 * anything: only CREATE ... IF NOT EXISTS and ADD COLUMN IF NOT EXISTS. Every
 * existing admin account is preserved with its password hash untouched.
 *
 *   node scripts/migrateAdminSecuritySchema.mjs     (npm run migrate:admin-security)
 *
 * What it adds:
 *
 *   1. admins.token_version — the whole of server-side session revocation, in
 *      one integer. Tokens carry the version they were minted at; a mismatch
 *      against the row means the token is dead. Incrementing it on logout or
 *      password change invalidates every outstanding token for that admin
 *      without a session table, a denylist or a cache.
 *
 *   2. admins.failed_login_attempts + admins.locked_until — account-level
 *      throttling that survives a restart. The in-memory IP+username limiter
 *      stays as the fast first layer, but its counters die with the process,
 *      so a deploy or a crash handed an attacker a fresh guessing budget.
 *
 *   3. admin_audit_logs — an append-only trail of authentication events. There
 *      was previously no record of who logged in, when, or from where, so a
 *      compromise would have left no evidence at all.
 *
 * DEFAULT 0 / NOT NULL on the counters is safe here: Postgres 11+ stores the
 * default in the catalogue instead of rewriting the table, and `admins` holds a
 * handful of rows regardless.
 */
import pkg from '../db/pool.js';

const { getPool } = pkg;

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnType(client, table, column) {
  const { rows } = await client.query(
    `SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1`,
    [table, column]
  );
  return rows[0]?.data_type ?? null;
}

const ADMIN_COLUMNS = [
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`,
  // First-login password replacement.
  //
  // An operator issues a temporary password and sets this true; the admin can
  // then authenticate but reach nothing except the password-change and session
  // endpoints until they replace it. DEFAULT FALSE is deliberate: existing
  // accounts must not all be forced through a password change the moment this
  // migration runs, which would lock the current team out of their own CRM.
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`,
  // Null for accounts whose password predates this column; useful for spotting
  // credentials that have never been rotated.
  `ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`,
];

/**
 * `admin_id` is nullable and ON DELETE SET NULL on purpose:
 *
 *   - nullable, because a failed login for a username that does not exist has
 *     no admin to point at, and that is one of the events most worth recording;
 *   - SET NULL rather than CASCADE, because removing an admin must not erase
 *     the history of what that admin did. The username is kept in `metadata`,
 *     so the trail stays readable after the row is gone.
 *
 * `metadata` is NOT NULL DEFAULT '{}' so queries can read `metadata->>'x'`
 * without a COALESCE. It holds only bounded, non-sensitive values — never a
 * password, hash, token, Authorization header or connection string.
 */
const AUDIT_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    admin_id    INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
    event_type  VARCHAR(64)  NOT NULL,
    success     BOOLEAN      NOT NULL DEFAULT TRUE,
    ip_address  VARCHAR(64),
    user_agent  VARCHAR(512),
    metadata    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
`;

/** Reverse-chronological reads are the only access pattern the UI has. */
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
     ON admin_audit_logs (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_created_idx
     ON admin_audit_logs (admin_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS admin_audit_logs_event_created_idx
     ON admin_audit_logs (event_type, created_at DESC)`,
];

export async function migrateAdminSecuritySchema(pool) {
  const client = await pool.connect();
  const summary = { created: [], existing: [], preservedAdmins: 0 };

  try {
    await client.query('BEGIN');

    if (!(await tableExists(client, 'admins'))) {
      throw new Error('admins table is missing — run the server once so initDB creates it, then re-run.');
    }

    // Recorded before and compared after, so the migration can prove it did not
    // disturb the accounts it is altering.
    const before = await client.query('SELECT COUNT(*)::int AS n FROM admins');

    const hadAudit = await tableExists(client, 'admin_audit_logs');
    const hadTokenVersion = (await columnType(client, 'admins', 'token_version')) !== null;

    for (const statement of ADMIN_COLUMNS) await client.query(statement);
    await client.query(AUDIT_TABLE_DDL);
    for (const statement of INDEXES) await client.query(statement);

    const after = await client.query('SELECT COUNT(*)::int AS n FROM admins');
    if (after.rows[0].n !== before.rows[0].n) {
      // Cannot happen with these statements; the check exists so that if it ever
      // did, the transaction rolls back rather than silently losing an account.
      throw new Error('admin row count changed during migration — rolling back.');
    }
    summary.preservedAdmins = after.rows[0].n;

    if (hadTokenVersion) summary.existing.push('admins.token_version');
    else summary.created.push('admins.token_version');
    summary.created.push(
      'admins.failed_login_attempts, admins.locked_until, admins.must_change_password, ' +
      'admins.password_changed_at (IF NOT EXISTS)'
    );
    if (hadAudit) summary.existing.push('admin_audit_logs');
    else summary.created.push('admin_audit_logs');
    summary.created.push(`${INDEXES.length} indexes (IF NOT EXISTS)`);

    await client.query('COMMIT');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly: node scripts/migrateAdminSecuritySchema.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateAdminSecuritySchema(pool);
    console.log('── Admin security schema migration ──');
    console.log(`Already present : ${summary.existing.join(', ') || 'nothing'}`);
    console.log(`Created         : ${summary.created.join(', ') || 'nothing new'}`);
    console.log(`Admin accounts  : ${summary.preservedAdmins} preserved (none created, altered or removed)`);
    console.log('✓ Admin security schema is up to date.');
  } catch (err) {
    console.error('✗ Admin security schema migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

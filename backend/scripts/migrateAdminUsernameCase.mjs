/**
 * Make admin username uniqueness case-insensitive.
 *
 *   node scripts/migrateAdminUsernameCase.mjs     (npm run migrate:admin-username)
 *
 * THE PROBLEM
 *
 * Login matches case-insensitively:
 *
 *     SELECT * FROM admins WHERE LOWER(username) = $1        (server.js)
 *
 * but the table's uniqueness is the plain `admins_username_key` on `username`,
 * which is case-SENSITIVE. So `Admin` and `admin` can both exist, the constraint
 * is satisfied, and one login then matches two rows. Postgres returns whichever
 * it likes without an ORDER BY, so which account you authenticate as — and
 * therefore whose password is checked — becomes non-deterministic.
 *
 * create-admin.js guards against creating such a pair, but the database is what
 * has to enforce it: ADMIN_SEED, a migration, a psql session or a future code
 * path can all insert directly.
 *
 * WHAT THIS DOES
 *
 * Adds a unique index on LOWER(username), so the constraint finally matches the
 * query. The existing `admins_username_key` is deliberately left in place — it
 * is redundant but harmless, and dropping a uniqueness constraint is not
 * something a migration should do on the way to adding a stricter one.
 *
 * IT REFUSES RATHER THAN REPAIRS
 *
 * If two accounts already collide, this reports them and exits non-zero without
 * touching a row. Resolving a collision means deciding which account is real
 * and which is an accident — that is an operator's call, made with knowledge of
 * who uses which login, and both possible automatic answers (rename one, delete
 * one) can lock a person out of a production system.
 *
 * Idempotent and non-destructive: CREATE UNIQUE INDEX IF NOT EXISTS only. No
 * DROP, no UPDATE, no DELETE.
 *
 * DELIBERATELY NOT IN docker-entrypoint.sh. That script runs under `set -e`, so
 * a non-zero exit aborts the boot and the container restart-loops. This one
 * exits non-zero on a collision by design — which would turn two badly-named
 * admin accounts into a total outage of the public website, catalogue and
 * contact form included. The blast radius has to match the fault: run it by
 * hand, read the result, act on it.
 */
import pkg from '../db/pool.js';

const { getPool } = pkg;

const INDEX_NAME = 'admins_username_lower_key';

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<{ created: boolean, alreadyPresent: boolean, collisions: Array<{ username: string, count: number }>, admins: number }>}
 */
export async function migrateAdminUsernameCase(pool) {
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(
      `SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'admins' AND indexname = $1
        LIMIT 1`,
      [INDEX_NAME]
    );

    const { rows: countRows } = await client.query('SELECT COUNT(*)::int AS n FROM admins');
    const admins = countRows[0].n;

    if (existing.length > 0) {
      return { created: false, alreadyPresent: true, collisions: [], admins };
    }

    // Checked BEFORE attempting the index, so a collision produces a list of
    // the offending usernames rather than a bare duplicate-key error naming
    // one row and leaving the operator to find the other.
    const { rows: collisions } = await client.query(
      `SELECT LOWER(username) AS username, COUNT(*)::int AS count
         FROM admins
        GROUP BY LOWER(username)
       HAVING COUNT(*) > 1
        ORDER BY 1`
    );

    if (collisions.length > 0) {
      return { created: false, alreadyPresent: false, collisions, admins };
    }

    // Not CONCURRENTLY: `admins` holds a handful of rows, so the brief lock is
    // immeasurable, and CONCURRENTLY cannot run inside a transaction block —
    // which would cost the all-or-nothing property this needs more.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX_NAME} ON admins (LOWER(username))`);

    return { created: true, alreadyPresent: false, collisions: [], admins };
  } finally {
    client.release();
  }
}

// Run directly: node scripts/migrateAdminUsernameCase.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateAdminUsernameCase(pool);
    console.log('── Admin username case-insensitivity migration ──');

    if (summary.collisions.length > 0) {
      console.error('✗ BLOCKED — these usernames differ only by case:');
      for (const c of summary.collisions) {
        console.error(`    "${c.username}" — ${c.count} accounts`);
      }
      console.error('');
      console.error('  No rows were changed. Decide which account is the real one, then');
      console.error('  remove or rename the other with create-admin.js, and run this again.');
      console.error('  Until then, a login for that username may authenticate as either account.');
      process.exitCode = 1;
    } else if (summary.alreadyPresent) {
      console.log(`Index           : ${INDEX_NAME} already present`);
      console.log(`Admin accounts  : ${summary.admins} preserved (none created, altered or removed)`);
      console.log('✓ Admin usernames are already case-insensitively unique.');
    } else {
      console.log(`Created         : ${INDEX_NAME} on admins (LOWER(username))`);
      console.log(`Admin accounts  : ${summary.admins} preserved (none created, altered or removed)`);
      console.log('✓ Admin usernames are now case-insensitively unique.');
    }
  } catch (err) {
    console.error('✗ Admin username migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

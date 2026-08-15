/**
 * The base tables — `contacts` and `admins` — and the columns that have been
 * added to them since the first release.
 *
 * WHY THIS IS A MODULE AND NOT JUST PART OF server.js
 *
 * These two tables are the foundation the other migrations build on:
 * scripts/migrateAnalyticsSchema.mjs needs `contacts` (it adds attribution
 * columns to it) and scripts/migrateAdminSecuritySchema.mjs needs `admins`
 * (it adds the lockout and token-revocation columns, and the audit table's
 * foreign key points at it).
 *
 * They used to be created only by server.js at boot, while
 * docker-entrypoint.sh ran every migration BEFORE starting the server. On an
 * existing database that worked by accident, because the tables were already
 * there. On a FRESH database — every new deployment — it could not:
 *
 *     entrypoint → migrateAnalyticsSchema  →  "contacts table is missing"
 *                → set -e                  →  container exits 1
 *                → restart: unless-stopped →  container starts, same failure
 *
 * a permanent restart loop that no amount of waiting or retrying would clear,
 * because the step that creates `contacts` was never reached. Extracting the
 * DDL here lets the entrypoint create the base tables first, in one ordered
 * sequence, while server.js keeps calling exactly the same code at boot so a
 * database that skipped the entrypoint still heals itself.
 *
 * Every statement is idempotent and non-destructive: CREATE TABLE IF NOT
 * EXISTS, ADD COLUMN IF NOT EXISTS, and one conditional widening. Nothing here
 * drops, truncates or rewrites data, so it is safe on every boot and safe
 * against a production database with real leads in it.
 */

/** Widths the CREATE TABLE below declares, enforced on older databases. */
const TARGET_WIDTHS = { name: 255, email: 255, phone: 50 };

/**
 * Create/heal `contacts` and `admins`.
 *
 * @param {import('pg').Pool} pool
 * @param {(msg: string) => void} [log] injected so the CLI can stay quiet
 */
async function ensureBaseSchema(pool, log = console.log) {
  // ── contacts ──────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(50) NOT NULL,
      interest VARCHAR(255),
      message TEXT,
      callback VARCHAR(50),
      priority VARCHAR(20) DEFAULT 'normal',
      status VARCHAR(30) DEFAULT 'pending',
      source VARCHAR(50) DEFAULT 'Website',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // CREATE TABLE IF NOT EXISTS is a no-op on a pre-existing table, so every
  // column added after the first release needs its own ALTER to bring older
  // databases up to date. interest/callback were missing here, which made
  // POST /api/contact fail with Postgres 42703 on any older database.
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS interest VARCHAR(255)`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS callback VARCHAR(50)`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending'`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'Website'`);
  // The lead INSERTs write visitor_id/session_id unconditionally, so the
  // columns must exist even when migrate:analytics has never run — otherwise
  // attribution costs the lead itself (42703 → 500).
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64)`);
  await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)`);

  // Widen the text columns to the sizes CREATE TABLE above declares.
  //
  // Older databases still had name VARCHAR(100), email VARCHAR(150) and phone
  // VARCHAR(20) — CREATE TABLE IF NOT EXISTS is a no-op on an existing table,
  // so the declared widths were fiction. Validation trusted them
  // (CONTACT_LIMITS in server.js), so a 21–50 character phone number passed
  // validation and then died in Postgres as 22001, which the handler reported
  // as a generic 500: the visitor saw "something went wrong" and a real lead
  // was lost.
  //
  // Increasing a varchar length is a catalogue-only change in Postgres — no
  // table rewrite and no data loss — but ALTER COLUMN still takes an ACCESS
  // EXCLUSIVE lock on the table, and issuing it unconditionally means every
  // boot briefly blocks all reads and writes of `contacts`. So the current
  // width is checked first and the ALTER only runs when it is actually too
  // narrow: a real no-op after the first application, and no lock at all on
  // subsequent restarts.
  const { rows: contactWidths } = await pool.query(
    `SELECT column_name, character_maximum_length AS len
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contacts'
        AND column_name = ANY($1)`,
    [Object.keys(TARGET_WIDTHS)]
  );
  for (const { column_name: column, len } of contactWidths) {
    const target = TARGET_WIDTHS[column];
    if (len !== null && len < target) {
      // Column names come from the constant above, never from a request.
      await pool.query(`ALTER TABLE contacts ALTER COLUMN ${column} TYPE VARCHAR(${target})`);
      log(`✓ Widened contacts.${column} from ${len} to ${target}.`);
    }
  }
  log('✓ Contacts table ready.');

  // `bookings` is created by scripts/migrateBookingsSchema.mjs, not here —
  // heal its attribution columns only when the table exists, for the same
  // 42703 reason as above.
  await pool.query(`
    DO $$ BEGIN
      IF to_regclass('public.bookings') IS NOT NULL THEN
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64);
        ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);
      END IF;
    END $$;
  `);

  // ── admins ────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // The authentication columns. Identical to the statements in
  // scripts/migrateAdminSecuritySchema.mjs and equally idempotent — repeated
  // here because every login reads failed_login_attempts, locked_until and
  // token_version, so a database that never ran that script would fail its
  // very first sign-in with 42703 inside the login handler, surfacing as a
  // generic 500 that looks like a bug rather than a missing migration.
  //
  // must_change_password DEFAULT FALSE is deliberate: existing accounts must
  // not all be forced through a password change the moment this runs, which
  // would lock the current team out of their own CRM.
  await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);
  log('✓ Admins table ready.');
}

module.exports = { ensureBaseSchema, TARGET_WIDTHS };

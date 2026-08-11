/**
 * Schema migration for first-party anonymous analytics.
 *
 * Idempotent — safe to run repeatedly. It never drops, truncates or rewrites
 * anything: only CREATE ... IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.
 *
 *   node scripts/migrateAnalyticsSchema.mjs        (npm run migrate:analytics)
 *
 * What it does:
 *
 *   1. Creates `analytics_events` — one row per meaningful product event,
 *      keyed by an anonymous visitor id the browser mints for itself
 *      (crypto.randomUUID() in localStorage). By design the table holds NO
 *      personal data: no names, emails, phones or message text ever land in
 *      `metadata`. Personal data lives only in bookings/contacts rows.
 *
 *   2. Adds nullable `visitor_id` / `session_id` attribution columns to the
 *      existing `bookings` and `contacts` tables, so a lead can be joined back
 *      to the anonymous journey that preceded it. Nullable on purpose: a lead
 *      with no analytics ids (blocked storage, old client) is still a lead.
 *
 * `visitor_id` is VARCHAR(64) with no FK anywhere — it is an opaque token, not
 * a reference. There is deliberately no visitors table: guest-first is locked,
 * and the id must never grow into an account.
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

/**
 * `metadata` is NOT NULL DEFAULT '{}' so aggregation queries can use
 * `metadata->>'query'` without a COALESCE dance. `entity_id` carries no FK:
 * an event must survive the package it pointed at being deleted, and an
 * unresolvable id is harmless in an analytics row.
 */
const ANALYTICS_EVENTS_DDL = `
  CREATE TABLE IF NOT EXISTS analytics_events (
    id           SERIAL PRIMARY KEY,
    visitor_id   VARCHAR(64)  NOT NULL,
    session_id   VARCHAR(64),
    event_type   VARCHAR(40)  NOT NULL,
    entity_type  VARCHAR(20),
    entity_id    INTEGER,
    entity_slug  VARCHAR(250),
    page_path    VARCHAR(300),
    referrer     VARCHAR(300),
    utm          JSONB,
    metadata     JSONB        NOT NULL DEFAULT '{}',
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

/** Only the indexes the journey and dashboard queries actually use. */
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS analytics_events_visitor_created_idx
     ON analytics_events (visitor_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx
     ON analytics_events (event_type, created_at)`,
  `CREATE INDEX IF NOT EXISTS analytics_events_entity_slug_idx
     ON analytics_events (entity_slug) WHERE entity_slug IS NOT NULL`,
];

/**
 * Attribution columns for the two lead tables. ADD COLUMN IF NOT EXISTS with
 * no default and no NOT NULL: existing rows simply read NULL, and no rewrite
 * of either table happens.
 */
const ATTRIBUTION_COLUMNS = [
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64)`,
  `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64)`,
  `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS session_id VARCHAR(64)`,
];

export async function migrateAnalyticsSchema(pool) {
  const client = await pool.connect();
  const summary = { created: [], existing: [] };

  try {
    await client.query('BEGIN');

    // The attribution ALTERs need their targets to exist; failing here with a
    // clear message beats a bare Postgres 42P01 mid-transaction.
    for (const required of ['bookings', 'contacts']) {
      if (!(await tableExists(client, required))) {
        throw new Error(
          `${required} table is missing — run the server once (contacts) or ` +
          '`npm run migrate:bookings` (bookings) first.'
        );
      }
    }

    const hadEvents = await tableExists(client, 'analytics_events');

    await client.query(ANALYTICS_EVENTS_DDL);
    for (const statement of INDEXES) await client.query(statement);
    for (const statement of ATTRIBUTION_COLUMNS) await client.query(statement);

    if (hadEvents) summary.existing.push('analytics_events');
    else summary.created.push('analytics_events');
    summary.created.push(`${INDEXES.length} indexes (IF NOT EXISTS)`);
    summary.created.push('bookings/contacts attribution columns (IF NOT EXISTS)');

    await client.query('COMMIT');
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Run directly: node scripts/migrateAnalyticsSchema.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateAnalyticsSchema(pool);
    console.log('── Analytics schema migration ──');
    console.log(`Already present : ${summary.existing.join(', ') || 'nothing'}`);
    console.log(`Created         : ${summary.created.join(', ') || 'nothing new'}`);
    console.log('✓ Analytics schema is up to date.');
  } catch (err) {
    console.error('✗ Analytics schema migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

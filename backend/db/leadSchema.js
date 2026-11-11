/**
 * Boot-time check that the database has the migrations this release needs:
 * 0004_lead_management (unified CRM) and 0005_lead_attribution (lead
 * attribution columns).
 *
 * The server does not migrate itself (migrations run through
 * scripts/db.mjs, never at application start). This only refuses to serve
 * against a database that lacks what the code needs, so a deploy that skipped
 * a migration fails its health check — and the previous release keeps
 * serving — instead of answering enquiries with errors.
 */

const REQUIRED_TABLES = ['lead_notes', 'lead_activity', 'lead_idempotency_keys'];
const REQUIRED_COLUMNS = [
  ['contacts', 'lead_status'],
  ['contacts', 'deleted_at'],
  ['bookings', 'deleted_at'],
  ['contacts', 'attribution_channel'],
  ['contacts', 'submission_source'],
  ['bookings', 'attribution_channel'],
  ['bookings', 'submission_source'],
  ['bookings', 'destination_id'],
];

/** Which migration adds each required object, for the startup message. */
const MIGRATION_OF = (item) => (/attribution_channel|submission_source|destination_id/.test(item) ? '0005_lead_attribution' : '0004_lead_management');

async function missingLeadSchema(db) {
  const { rows } = await db.query(
    `SELECT t.name AS table_name, to_regclass('public.' || t.name) IS NOT NULL AS present
       FROM unnest($1::text[]) AS t(name)`,
    [REQUIRED_TABLES]
  );
  const missing = rows.filter((r) => !r.present).map((r) => `table ${r.table_name}`);

  const cols = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND (table_name, column_name) IN (${REQUIRED_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
    REQUIRED_COLUMNS.flat()
  );
  const present = new Set(cols.rows.map((r) => `${r.table_name}.${r.column_name}`));
  for (const [table, column] of REQUIRED_COLUMNS) {
    if (!present.has(`${table}.${column}`)) missing.push(`column ${table}.${column}`);
  }
  return missing;
}

/** The migrations a list of missing objects points at, oldest first. */
const migrationsFor = (missing) => [...new Set(missing.map(MIGRATION_OF))].sort();

module.exports = { missingLeadSchema, migrationsFor, REQUIRED_TABLES, REQUIRED_COLUMNS };

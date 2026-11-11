/**
 * Retention report (ZT-15 / ZT-22) — READ-ONLY.
 *
 * Counts how much of each kind of stored data exists, by age, so the owner
 * can decide retention periods (docs/PRIVACY_AND_RETENTION.md). It returns
 * counts only: no row, no identifier, no personal data. Nothing is deleted —
 * no purge exists until periods are approved, and even then it will be a
 * separate, explicit operator command, never automatic.
 *
 *   node scripts/db.mjs retention-report --target development
 */

const BUCKETS = Object.freeze([
  ['0-30 days', 0, 30],
  ['31-90 days', 31, 90],
  ['91-180 days', 91, 180],
  ['181-365 days', 181, 365],
  ['over 365 days', 366, null],
]);

/** Kinds of data, the table and timestamp column they age by, and an optional filter. */
const DATASETS = Object.freeze([
  { name: 'analytics events (anonymous)', table: 'analytics_events', column: 'created_at' },
  { name: 'contact leads (active)', table: 'contacts', column: 'created_at', where: 'deleted_at IS NULL' },
  { name: 'contact leads (soft-deleted)', table: 'contacts', column: 'deleted_at', where: 'deleted_at IS NOT NULL' },
  { name: 'trip enquiries (active)', table: 'bookings', column: 'created_at', where: 'deleted_at IS NULL' },
  { name: 'trip enquiries (soft-deleted)', table: 'bookings', column: 'deleted_at', where: 'deleted_at IS NOT NULL' },
  { name: 'lead notes', table: 'lead_notes', column: 'created_at' },
  { name: 'lead history', table: 'lead_activity', column: 'created_at' },
  { name: 'admin security audit', table: 'admin_audit_logs', column: 'created_at' },
  { name: 'submission keys (24 h duplicate guard)', table: 'lead_idempotency_keys', column: 'created_at' },
]);

async function retentionReport(client, { now = 'NOW()' } = {}) {
  const rows = [];
  for (const d of DATASETS) {
    const filters = BUCKETS.map(([, from, to]) => {
      const lower = `${d.column} <= ${now} - make_interval(days => ${from})`;
      const upper = to === null ? '' : ` AND ${d.column} > ${now} - make_interval(days => ${to + 1})`;
      return `COUNT(*) FILTER (WHERE ${lower}${upper})::int`;
    });
    const { rows: [r] } = await client.query(
      `SELECT COUNT(*)::int AS total, ${filters.map((f, i) => `${f} AS b${i}`).join(', ')},
              to_char(MIN(${d.column}), 'YYYY-MM-DD') AS oldest
         FROM ${d.table}${d.where ? ` WHERE ${d.where}` : ''}`
    );
    rows.push({
      dataset: d.name,
      total: r.total,
      oldest: r.oldest,
      byAge: Object.fromEntries(BUCKETS.map(([label], i) => [label, r[`b${i}`]])),
    });
  }
  return rows;
}

module.exports = { retentionReport, BUCKETS, DATASETS };

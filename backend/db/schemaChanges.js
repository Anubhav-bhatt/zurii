/**
 * What each migration after the 0001 baseline changes, in the exact words
 * schemaSnapshot.compareSchemas uses when it compares a database with the
 * baseline snapshot.
 *
 * `npm run db:<target>:verify` and tests/databaseFoundation.test.mjs both
 * use this list, so a database passes only if it is the baseline plus the
 * documented changes of the migrations its ledger says were applied — no
 * more, no less. Add an entry with every migration that changes the seven
 * baseline tables or adds tables.
 */
const { canonicalConstraint } = require('./schemaSnapshot');

const MIGRATION_SCHEMA_CHANGES = Object.freeze({
  '0004_lead_management': {
    added: [
      'unexpected table lead_activity',
      'unexpected table lead_idempotency_keys',
      'unexpected table lead_notes',
      'bookings: unexpected column deleted_at',
      'bookings: unexpected column deleted_by',
      'bookings: unexpected column delete_reason',
      'bookings: unexpected constraint bookings_deleted_by_fkey',
      'bookings: unexpected index bookings_active_created_idx',
      'contacts: unexpected column lead_status',
      'contacts: unexpected column deleted_at',
      'contacts: unexpected column deleted_by',
      'contacts: unexpected column delete_reason',
      'contacts: unexpected constraint contacts_deleted_by_fkey',
      'contacts: unexpected constraint contacts_lead_status_check',
      'contacts: unexpected index contacts_active_created_idx',
    ],
    // Replaced in place to accept CANCELLED: the new definition must be the old
    // one with exactly this text inserted, so every old value stays valid.
    widened: [
      {
        table: 'bookings',
        constraint: 'bookings_status_check',
        from: `'CLOSED'::character varying]`,
        to: `'CLOSED'::character varying, 'CANCELLED'::character varying]`,
      },
    ],
  },
  '0005_lead_attribution': {
    added: [
      ...['contacts', 'bookings'].flatMap((table) =>
        ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer_host',
          'landing_page', 'click_id_type', 'attribution_channel', 'submission_source']
          .map((column) => `${table}: unexpected column ${column}`)),
      'bookings: unexpected column destination_id',
      'bookings: unexpected constraint bookings_destination_id_fkey',
      'analytics_events: unexpected index analytics_events_created_idx',
    ],
    widened: [],
  },
});

/** The comparison differences that the applied migrations do NOT account for. */
function unexplainedDifferences(diffs, appliedIds) {
  const added = new Set();
  const widened = [];
  for (const id of appliedIds) {
    const change = MIGRATION_SCHEMA_CHANGES[id];
    if (!change) continue;
    change.added.forEach((d) => added.add(d));
    widened.push(...change.widened);
  }
  return diffs.filter((diff) => {
    if (added.has(diff)) return false;
    return !widened.some((w) => {
      if (!diff.startsWith(`${w.table}: constraint ${w.constraint} is `)) return false;
      const match = /is "(.*)", expected "(.*)"$/.exec(diff);
      // Canonical text, so a restored copy (dump/restore respells IN-list
      // CHECKs, see schemaSnapshot.canonicalConstraint) is judged by meaning.
      return Boolean(match) && canonicalConstraint(match[1]) === canonicalConstraint(match[2].replace(w.from, w.to));
    });
  });
}

module.exports = { MIGRATION_SCHEMA_CHANGES, unexplainedDifferences };

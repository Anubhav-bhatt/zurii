/**
 * Schema migration for enquiries: the `bookings` table.
 *
 * Idempotent — safe to run repeatedly. It never drops or alters anything.
 *
 *   node scripts/migrateBookingsSchema.mjs        (npm run migrate:bookings)
 *
 * Why a new table instead of reusing `contacts`: a contact is a free-form
 * "call me back" note, while an enquiry is always aimed at a trip and carries a
 * travel date, a traveller count and a sales-pipeline status. Folding the two
 * together would force every new column to be nullable and make "how many open
 * enquiries" ambiguous, so they stay separate.
 *
 * `package_id` is ON DELETE SET NULL, never CASCADE: an enquiry is a real
 * commercial lead and must outlive the package it was raised against.
 *
 * `contacts`, `admins`, `destinations` and `packages` are never touched — this
 * script only ever runs CREATE ... IF NOT EXISTS.
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
 * The enquiry pipeline lives in `status`; the CHECK constraint is the single
 * source of truth for the allowed values so a typo in application code fails
 * loudly instead of creating a state nothing lists.
 *
 * `travellers` is bounded in the database as well as in validateBooking.js —
 * validation protects the user experience, the constraint protects the data.
 */
const BOOKINGS_DDL = `
  CREATE TABLE IF NOT EXISTS bookings (
    id              SERIAL PRIMARY KEY,
    package_id      INTEGER REFERENCES packages(id) ON DELETE SET NULL,
    name            VARCHAR(120)  NOT NULL,
    email           VARCHAR(255)  NOT NULL,
    phone           VARCHAR(32)   NOT NULL,
    travel_date     DATE,
    travellers      INTEGER,
    departure_city  VARCHAR(120),
    message         TEXT,
    status          VARCHAR(20)   NOT NULL DEFAULT 'NEW',
    admin_notes     TEXT,
    source          VARCHAR(50)   NOT NULL DEFAULT 'Website',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bookings_status_check CHECK (status IN
      ('NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED')),
    CONSTRAINT bookings_travellers_check CHECK (travellers IS NULL OR
      (travellers >= 1 AND travellers <= 50))
  )
`;

/** Only the indexes the enquiry queries actually use. */
const INDEXES = [
  `CREATE INDEX IF NOT EXISTS bookings_status_idx     ON bookings (status)`,
  `CREATE INDEX IF NOT EXISTS bookings_package_id_idx ON bookings (package_id)`,
  `CREATE INDEX IF NOT EXISTS bookings_created_at_idx ON bookings (created_at DESC)`,
];

export async function migrateBookingsSchema(pool) {
  const client = await pool.connect();
  const summary = { created: [], existing: [] };

  try {
    await client.query('BEGIN');

    // The foreign key needs its target to exist; failing here with a clear
    // message beats a bare Postgres 42P01.
    if (!(await tableExists(client, 'packages'))) {
      throw new Error('packages table is missing — run `npm run migrate:schema` first.');
    }

    const hadBookings = await tableExists(client, 'bookings');

    await client.query(BOOKINGS_DDL);
    for (const statement of INDEXES) await client.query(statement);

    if (hadBookings) summary.existing.push('bookings');
    else summary.created.push('bookings');
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

// Run directly: node scripts/migrateBookingsSchema.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateBookingsSchema(pool);
    console.log('── Bookings schema migration ──');
    console.log(`Already present : ${summary.existing.join(', ') || 'nothing'}`);
    console.log(`Created         : ${summary.created.join(', ') || 'nothing new'}`);
    console.log('✓ Bookings schema is up to date.');
  } catch (err) {
    console.error('✗ Bookings schema migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

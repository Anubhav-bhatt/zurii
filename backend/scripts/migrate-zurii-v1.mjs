/**
 * Safe, idempotent DDL schema migration for Zurii V1.
 *
 *   node scripts/migrate-zurii-v1.mjs
 *
 * Safe to run repeatedly — it never drops tables or overwrites existing data.
 */
import pkg from '../db/pool.js';
const { getPool } = pkg;

const LEGACY_TABLES = [
  'batches', 'categories', 'countries', 'destinations', 'domestic',
  'exclusions', 'inclusions', 'international', 'international_destinations',
  'international_packages', 'itineraries', 'packages', 'place_details', 'place_images',
];

const NEW_SCHEMA_MARKER = 'metadata';

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function sequenceExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.sequences WHERE sequence_schema = 'public' AND sequence_name = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function renameLegacyTables(client) {
  const renamed = [];
  const skipped = [];

  for (const table of LEGACY_TABLES) {
    const legacyName = `legacy_${table}`;

    if (!(await tableExists(client, table))) {
      skipped.push(`${table}: not present`);
      continue;
    }

    if (await columnExists(client, table, NEW_SCHEMA_MARKER)) {
      skipped.push(`${table}: already the new schema`);
      continue;
    }

    if (await tableExists(client, legacyName)) {
      skipped.push(`${table}: ${legacyName} already exists`);
      continue;
    }

    await client.query(`ALTER TABLE "${table}" RENAME TO "${legacyName}"`);

    if (await sequenceExists(client, `${table}_id_seq`)) {
      await client.query(`ALTER SEQUENCE "${table}_id_seq" RENAME TO "legacy_${table}_id_seq"`);
    }

    renamed.push(`${table} → ${legacyName}`);
  }

  return { renamed, skipped };
}

const DESTINATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS destinations (
    id                SERIAL PRIMARY KEY,
    legacy_id         VARCHAR(150),
    name              VARCHAR(150) NOT NULL,
    slug              VARCHAR(150) NOT NULL UNIQUE,
    country           VARCHAR(100),
    region            VARCHAR(100),
    kind              VARCHAR(20)  NOT NULL DEFAULT 'domestic',
    short_description TEXT,
    description       TEXT,
    image             TEXT,
    gallery           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    featured          BOOLEAN      NOT NULL DEFAULT false,
    active            BOOLEAN      NOT NULL DEFAULT true,
    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT destinations_kind_check CHECK (kind IN ('domestic', 'international'))
  )
`;

const PACKAGES_DDL = `
  CREATE TABLE IF NOT EXISTS packages (
    id                SERIAL PRIMARY KEY,
    legacy_id         VARCHAR(200),
    title             VARCHAR(250) NOT NULL,
    slug              VARCHAR(250) NOT NULL UNIQUE,
    destination_id    INTEGER REFERENCES destinations(id) ON DELETE SET NULL,
    subtitle          VARCHAR(250),
    short_description TEXT,
    description       TEXT,
    duration_days     INTEGER,
    duration_nights   INTEGER,
    duration_text     VARCHAR(80),
    price             NUMERIC(12, 2),
    original_price    NUMERIC(12, 2),
    currency          VARCHAR(3)   NOT NULL DEFAULT 'INR',
    cover_image       TEXT,
    gallery           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    highlights        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    itinerary         JSONB        NOT NULL DEFAULT '[]'::jsonb,
    inclusions        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    exclusions        JSONB        NOT NULL DEFAULT '[]'::jsonb,
    batches           JSONB        NOT NULL DEFAULT '[]'::jsonb,
    tags              JSONB        NOT NULL DEFAULT '[]'::jsonb,
    trip_type         VARCHAR(50),
    rating            NUMERIC(2, 1),
    reviews_count     INTEGER,
    group_size        VARCHAR(60),
    difficulty        VARCHAR(30),
    featured          BOOLEAN      NOT NULL DEFAULT false,
    popular           BOOLEAN      NOT NULL DEFAULT false,
    status            VARCHAR(20)  NOT NULL DEFAULT 'PUBLISHED',
    metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT packages_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    CONSTRAINT packages_price_check CHECK (price IS NULL OR price >= 0),
    CONSTRAINT packages_original_price_check CHECK (original_price IS NULL OR original_price >= 0)
  )
`;

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
    CONSTRAINT bookings_status_check CHECK (status IN ('NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED')),
    CONSTRAINT bookings_travellers_check CHECK (travellers IS NULL OR (travellers >= 1 AND travellers <= 50))
  )
`;

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS destinations_kind_active_idx ON destinations (kind, active)`,
  `CREATE INDEX IF NOT EXISTS destinations_featured_idx    ON destinations (featured) WHERE featured`,
  `CREATE INDEX IF NOT EXISTS destinations_name_lower_idx  ON destinations (lower(name))`,
  `CREATE INDEX IF NOT EXISTS packages_destination_id_idx  ON packages (destination_id)`,
  `CREATE INDEX IF NOT EXISTS packages_status_idx          ON packages (status)`,
  `CREATE INDEX IF NOT EXISTS packages_featured_idx        ON packages (featured) WHERE featured`,
  `CREATE INDEX IF NOT EXISTS packages_popular_idx         ON packages (popular) WHERE popular`,
  `CREATE INDEX IF NOT EXISTS packages_price_idx           ON packages (price)`,
  `CREATE INDEX IF NOT EXISTS packages_trip_type_idx       ON packages (trip_type)`,
  `CREATE INDEX IF NOT EXISTS packages_tags_gin_idx        ON packages USING GIN (tags)`,
  `CREATE INDEX IF NOT EXISTS bookings_status_idx         ON bookings (status)`,
  `CREATE INDEX IF NOT EXISTS bookings_package_id_idx     ON bookings (package_id)`,
  `CREATE INDEX IF NOT EXISTS bookings_created_at_idx     ON bookings (created_at DESC)`,
];

export async function migrateSchema(pool) {
  const client = await pool.connect();
  const summary = { renamed: [], skipped: [], created: [] };

  try {
    await client.query('BEGIN');

    const legacy = await renameLegacyTables(client);
    summary.renamed = legacy.renamed;
    summary.skipped = legacy.skipped;

    const hadDestinations = await tableExists(client, 'destinations');
    const hadPackages = await tableExists(client, 'packages');
    const hadBookings = await tableExists(client, 'bookings');

    await client.query(DESTINATIONS_DDL);
    await client.query(PACKAGES_DDL);
    await client.query(BOOKINGS_DDL);

    for (const statement of INDEXES) {
      await client.query(statement);
    }

    if (!hadDestinations) summary.created.push('destinations');
    if (!hadPackages) summary.created.push('packages');
    if (!hadBookings) summary.created.push('bookings');
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateSchema(pool);
    console.log('── Schema Migration (Zurii V1) ──');
    console.log(`Legacy tables renamed : ${summary.renamed.length}`);
    summary.renamed.forEach((r) => console.log(`   ${r}`));
    console.log(`Rename steps skipped  : ${summary.skipped.length}`);
    console.log(`Created / verified    : ${summary.created.join(', ') || 'nothing new'}`);
    console.log('✓ Schema is fully up to date.');
  } catch (err) {
    console.error('✗ Schema migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

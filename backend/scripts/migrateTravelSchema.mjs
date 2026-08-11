/**
 * Schema migration for travel content: destinations + packages.
 *
 * Idempotent — safe to run repeatedly. It never drops anything.
 *
 *   node scripts/migrateTravelSchema.mjs
 *
 * Two things happen, in order:
 *
 * 1. An abandoned earlier schema occupied the `destinations` and `packages`
 *    names (plus 12 companion tables) with incompatible shapes. Nothing in the
 *    application ever read them. They are renamed to `legacy_*` so the data
 *    stays inspectable while the names are freed. Detection is by shape, not
 *    by guesswork: a `destinations` table without a `metadata` column is the
 *    legacy one.
 *
 * 2. The new tables and indexes are created with CREATE TABLE IF NOT EXISTS.
 *
 * `contacts` and `admins` are never touched.
 */
import pkg from '../db/pool.js';

const { getPool } = pkg;

/** Tables from the abandoned schema. `contacts` and `admins` are excluded. */
const LEGACY_TABLES = [
  'batches',
  'categories',
  'countries',
  'destinations',
  'domestic',
  'exclusions',
  'inclusions',
  'international',
  'international_destinations',
  'international_packages',
  'itineraries',
  'packages',
  'place_details',
  'place_images',
];

/** A legacy table is identified by the absence of the new schema's marker column. */
const NEW_SCHEMA_MARKER = 'metadata';

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
      LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function sequenceExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.sequences
      WHERE sequence_schema = 'public' AND sequence_name = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

/**
 * Rename the abandoned tables out of the way. Identifiers come from the
 * hardcoded LEGACY_TABLES list, never from user input, so interpolating them
 * into DDL is safe — ALTER TABLE cannot take a bound parameter for a name.
 */
async function renameLegacyTables(client) {
  const renamed = [];
  const skipped = [];

  for (const table of LEGACY_TABLES) {
    const legacyName = `legacy_${table}`;

    if (!(await tableExists(client, table))) {
      skipped.push(`${table}: not present`);
      continue;
    }

    // `destinations` / `packages` are the only names the new schema reuses.
    // If they already carry the marker column they are ours — leave them.
    if (await columnExists(client, table, NEW_SCHEMA_MARKER)) {
      skipped.push(`${table}: already the new schema`);
      continue;
    }

    if (await tableExists(client, legacyName)) {
      skipped.push(`${table}: ${legacyName} already exists`);
      continue;
    }

    await client.query(`ALTER TABLE "${table}" RENAME TO "${legacyName}"`);

    // Keep the owned sequence's name aligned, so the new table can claim the
    // conventional `<table>_id_seq` instead of getting `_seq1` appended.
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

/** Only the indexes the public queries actually use. */
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

    await client.query(DESTINATIONS_DDL);
    await client.query(PACKAGES_DDL);
    for (const statement of INDEXES) await client.query(statement);

    if (!hadDestinations) summary.created.push('destinations');
    if (!hadPackages) summary.created.push('packages');
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

// Run directly: node scripts/migrateTravelSchema.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const summary = await migrateSchema(pool);
    console.log('── Schema migration ──');
    console.log(`Legacy tables renamed : ${summary.renamed.length}`);
    summary.renamed.forEach((r) => console.log(`   ${r}`));
    console.log(`Rename steps skipped  : ${summary.skipped.length}`);
    summary.skipped.forEach((s) => console.log(`   ${s}`));
    console.log(`Created               : ${summary.created.join(', ') || 'nothing new'}`);
    console.log('✓ Schema is up to date.');
  } catch (err) {
    console.error('✗ Schema migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

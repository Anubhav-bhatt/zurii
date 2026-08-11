/**
 * Data migration: legacy static travel data → PostgreSQL.
 *
 *   node scripts/migrateTravelSchema.mjs   # once, first
 *   node scripts/migrateTravelData.mjs     # idempotent, safe to repeat
 *
 * Everything runs inside a single transaction: either all destinations and
 * packages land, or nothing does.
 *
 * Idempotency comes from UNIQUE(slug) plus ON CONFLICT DO UPDATE guarded by a
 * whole-row comparison, so a second run reports every record as `unchanged`
 * and does not even touch updated_at.
 *
 * Nothing is deleted, and `contacts` / `admins` are never referenced.
 */
import poolModule from '../db/pool.js';
import { extractStaticData } from './extractStaticData.mjs';

const { getPool } = poolModule;

const DESTINATION_COLUMNS = [
  'legacy_id', 'name', 'slug', 'country', 'region', 'kind',
  'short_description', 'description', 'image', 'gallery',
  'featured', 'active', 'metadata',
];

const PACKAGE_COLUMNS = [
  'legacy_id', 'title', 'slug', 'destination_id', 'subtitle',
  'short_description', 'description',
  'duration_days', 'duration_nights', 'duration_text',
  'price', 'original_price', 'currency',
  'cover_image', 'gallery', 'highlights', 'itinerary',
  'inclusions', 'exclusions', 'batches', 'tags',
  'trip_type', 'rating', 'reviews_count', 'group_size', 'difficulty',
  'featured', 'popular', 'status', 'metadata',
];

/**
 * Build an idempotent upsert.
 *
 * The `WHERE` clause compares the stored row against the incoming one as JSON
 * with the bookkeeping columns stripped, so an unchanged record is skipped
 * entirely rather than rewritten with a fresh updated_at.
 *
 * Column names come from the constants above — never from input — so
 * interpolating them is safe. All values are bound parameters.
 */
function buildUpsert(table, columns) {
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const assignments = columns.map((c) => `${c} = EXCLUDED.${c}`).join(',\n         ');
  const strip = `- 'id' - 'created_at' - 'updated_at'`;

  return `
    INSERT INTO ${table} (${columns.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (slug) DO UPDATE
       SET ${assignments},
           updated_at = CURRENT_TIMESTAMP
     WHERE to_jsonb(${table}.*) ${strip} IS DISTINCT FROM to_jsonb(EXCLUDED.*) ${strip}
    RETURNING id, (xmax = 0) AS inserted
  `;
}

const json = (value) => JSON.stringify(value ?? null);

function destinationValues(d) {
  return [
    d.legacyId, d.name, d.slug, d.country, d.region, d.kind,
    d.shortDescription, d.description, d.image, json(d.gallery),
    d.featured, d.active, json(d.metadata),
  ];
}

function packageValues(p, destinationId) {
  return [
    p.legacyId, p.title, p.slug, destinationId, p.subtitle,
    p.shortDescription, p.description,
    p.durationDays, p.durationNights, p.durationText,
    p.price, p.originalPrice, p.currency,
    p.coverImage, json(p.gallery), json(p.highlights), json(p.itinerary),
    json(p.inclusions), json(p.exclusions), json(p.batches), json(p.tags),
    p.tripType, p.rating, p.reviewsCount, p.groupSize, p.difficulty,
    p.featured, p.popular, p.status, json(p.metadata),
  ];
}

/** Run one upsert and classify the outcome for the report. */
async function upsert(client, sql, values) {
  const { rows } = await client.query(sql, values);
  if (rows.length === 0) return 'unchanged';
  return rows[0].inserted ? 'inserted' : 'updated';
}

export async function migrateData(pool) {
  const { destinations, packages, report } = await extractStaticData();

  const counts = {
    destinations: { discovered: report.destinationsDiscovered, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
    packages: { discovered: report.packagesDiscovered, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
  };
  const failures = [];

  // Records dropped by validation never reach the database.
  for (const invalid of report.invalid) {
    counts[invalid.entity === 'destination' ? 'destinations' : 'packages'].skipped += 1;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const destinationSql = buildUpsert('destinations', DESTINATION_COLUMNS);
    for (const destination of destinations) {
      try {
        counts.destinations[await upsert(client, destinationSql, destinationValues(destination))] += 1;
      } catch (err) {
        counts.destinations.failed += 1;
        failures.push({ entity: 'destination', id: destination.slug, error: err.message });
      }
    }

    // Resolve names → ids after the upsert so unchanged rows are included too.
    const { rows: destinationRows } = await client.query('SELECT id, name FROM destinations');
    const destinationIdByName = new Map(destinationRows.map((r) => [r.name, r.id]));

    const packageSql = buildUpsert('packages', PACKAGE_COLUMNS);
    for (const pkg of packages) {
      const destinationId = pkg.destinationName ? destinationIdByName.get(pkg.destinationName) ?? null : null;
      try {
        counts.packages[await upsert(client, packageSql, packageValues(pkg, destinationId))] += 1;
      } catch (err) {
        counts.packages.failed += 1;
        failures.push({ entity: 'package', id: pkg.slug, error: err.message });
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} record(s) failed to write — rolling back so the database is never left half-migrated`
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    err.failures = failures;
    throw err;
  } finally {
    client.release();
  }

  return { counts, report, failures };
}

// node scripts/migrateTravelData.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    const { counts, report } = await migrateData(pool);

    const line = (label, c) =>
      `${label.padEnd(14)} discovered ${String(c.discovered).padStart(3)} | ` +
      `inserted ${String(c.inserted).padStart(3)} | updated ${String(c.updated).padStart(3)} | ` +
      `unchanged ${String(c.unchanged).padStart(3)} | skipped ${String(c.skipped).padStart(3)} | ` +
      `failed ${String(c.failed).padStart(3)}`;

    console.log('── Migration report ──');
    console.log(`Sources scanned         : 6 data modules (1 live, 5 stale duplicates inventoried)`);
    console.log(line('Destinations', counts.destinations));
    console.log(line('Packages', counts.packages));
    console.log(`Field conflicts         : ${report.conflicts.length} (all resolved by precedence, originals kept in metadata)`);
    console.log(`Invalid records         : ${report.invalid.length}`);
    console.log(`Unresolved destinations : ${report.unresolvedDestinations.length}`);
    report.unresolvedDestinations.forEach((u) => console.log(`   ${u.slug} — ${u.title}`));
    console.log('✓ Migration committed.');
  } catch (err) {
    console.error('✗ Migration rolled back:', err.message);
    (err.failures || []).forEach((f) => console.error(`   ${f.entity} ${f.id}: ${f.error}`));
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

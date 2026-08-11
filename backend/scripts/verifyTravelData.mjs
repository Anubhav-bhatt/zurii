/**
 * Post-migration verification.
 *
 *   node scripts/verifyTravelData.mjs
 *
 * Two independent layers:
 *
 *   1. SQL integrity — counts, duplicate slugs, orphaned foreign keys, NULLs in
 *      required columns, negative prices, unusable image references, JSONB that
 *      is not the expected shape.
 *
 *   2. Source-vs-database comparison — every one of the 68 packages and 36
 *      destinations is re-derived from the static files and compared field by
 *      field against its stored row, so silent data loss cannot pass.
 *
 * Exits non-zero when any check fails, which makes it usable as a gate.
 */
import poolModule from '../db/pool.js';
import { extractStaticData } from './extractStaticData.mjs';

const { getPool } = poolModule;

const failures = [];
const notes = [];

const check = (label, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};

const ARRAY_JSONB_COLUMNS = ['gallery', 'highlights', 'itinerary', 'inclusions', 'exclusions', 'batches', 'tags'];

/**
 * Stable serialization with recursively sorted object keys.
 *
 * PostgreSQL stores JSONB with its own canonical key order (by key length,
 * then bytewise), so a plain JSON.stringify comparison against the source
 * object would report a difference in key *ordering* as a data difference.
 * Array order is meaningful and is preserved.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

async function sqlIntegrity(pool) {
  console.log('\n── SQL integrity ──');

  const { rows: counts } = await pool.query(`
    SELECT (SELECT COUNT(*)::int FROM destinations) AS destinations,
           (SELECT COUNT(*)::int FROM packages)     AS packages,
           (SELECT COUNT(*)::int FROM contacts)     AS contacts,
           (SELECT COUNT(*)::int FROM admins)       AS admins
  `);
  const c = counts[0];
  console.log(`  destinations=${c.destinations}  packages=${c.packages}  contacts=${c.contacts}  admins=${c.admins}`);
  check('destinations table is populated', c.destinations > 0);
  check('packages table is populated', c.packages > 0);
  check('pre-existing admins preserved', c.admins > 0, `${c.admins} rows`);

  const dupDest = await pool.query(`SELECT slug FROM destinations GROUP BY slug HAVING COUNT(*) > 1`);
  check('no duplicate destination slugs', dupDest.rows.length === 0, `${dupDest.rows.length} duplicates`);

  const dupPkg = await pool.query(`SELECT slug FROM packages GROUP BY slug HAVING COUNT(*) > 1`);
  check('no duplicate package slugs', dupPkg.rows.length === 0, `${dupPkg.rows.length} duplicates`);

  const orphans = await pool.query(`
    SELECT p.slug FROM packages p
     WHERE p.destination_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.id = p.destination_id)
  `);
  check('no orphaned destination_id values', orphans.rows.length === 0, `${orphans.rows.length} orphans`);

  const nullsDest = await pool.query(`SELECT COUNT(*)::int AS n FROM destinations WHERE name IS NULL OR slug IS NULL`);
  check('destinations have name and slug', nullsDest.rows[0].n === 0);

  const nullsPkg = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE title IS NULL OR slug IS NULL`);
  check('packages have title and slug', nullsPkg.rows[0].n === 0);

  const negative = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE price < 0 OR original_price < 0`);
  check('no negative prices', negative.rows[0].n === 0);

  const noPrice = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE price IS NULL`);
  check('every package has a numeric price', noPrice.rows[0].n === 0, `${noPrice.rows[0].n} without price`);

  // A JS import identifier stored as an image would look like 'baliImg'.
  const badImages = await pool.query(`
    SELECT slug, cover_image FROM packages
     WHERE cover_image IS NOT NULL AND cover_image !~ '^(https?://|/)'
  `);
  check('all package cover images are usable URLs', badImages.rows.length === 0,
    badImages.rows.map((r) => `${r.slug}=${r.cover_image}`).join(', '));

  const badDestImages = await pool.query(`
    SELECT slug, image FROM destinations
     WHERE image IS NOT NULL AND image !~ '^(https?://|/)'
  `);
  check('all destination images are usable URLs', badDestImages.rows.length === 0);

  const badGallery = await pool.query(`
    SELECT p.slug, g.value
      FROM packages p, jsonb_array_elements_text(p.gallery) AS g(value)
     WHERE g.value !~ '^(https?://|/)'
  `);
  check('all gallery images are usable URLs', badGallery.rows.length === 0, `${badGallery.rows.length} bad entries`);

  for (const column of ARRAY_JSONB_COLUMNS) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM packages WHERE jsonb_typeof(${column}) <> 'array'`
    );
    check(`packages.${column} is a JSONB array in every row`, rows[0].n === 0);
  }

  const badMeta = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE jsonb_typeof(metadata) <> 'object'`);
  check('packages.metadata is a JSONB object in every row', badMeta.rows[0].n === 0);

  const itineraryShape = await pool.query(`
    SELECT COUNT(*)::int AS n
      FROM packages p, jsonb_array_elements(p.itinerary) AS d
     WHERE NOT (d ? 'day' AND d ? 'title' AND d ? 'description')
  `);
  check('every itinerary day keeps day/title/description', itineraryShape.rows[0].n === 0);

  const emptyItinerary = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE jsonb_array_length(itinerary) = 0`);
  check('no package lost its itinerary', emptyItinerary.rows[0].n === 0, `${emptyItinerary.rows[0].n} empty`);

  const statuses = await pool.query(`SELECT DISTINCT status FROM packages`);
  check('all packages have a valid status', statuses.rows.every((r) => r.status === 'PUBLISHED'),
    statuses.rows.map((r) => r.status).join(', '));

  const flags = await pool.query(`
    SELECT COUNT(*) FILTER (WHERE featured)::int AS featured,
           COUNT(*) FILTER (WHERE popular)::int  AS popular,
           COUNT(*) FILTER (WHERE destination_id IS NULL)::int AS unlinked
      FROM packages
  `);
  console.log(`  featured=${flags.rows[0].featured}  popular=${flags.rows[0].popular}  unlinked=${flags.rows[0].unlinked}`);
  check('featured packages match the 5 homepage carousel entries', flags.rows[0].featured === 5);
  check('popular packages match the 9 best-seller entries', flags.rows[0].popular === 9);
  notes.push(`${flags.rows[0].unlinked} packages have no destination (reported by the migration)`);
}

async function sourceComparison(pool) {
  console.log('\n── Source vs database ──');
  const { destinations, packages } = await extractStaticData();

  const { rows: dbDestinations } = await pool.query('SELECT * FROM destinations');
  const destBySlug = new Map(dbDestinations.map((r) => [r.slug, r]));
  const { rows: dbPackages } = await pool.query('SELECT * FROM packages');
  const pkgBySlug = new Map(dbPackages.map((r) => [r.slug, r]));

  const mismatches = [];

  for (const source of destinations) {
    const row = destBySlug.get(source.slug);
    if (!row) { mismatches.push(`destination ${source.slug}: missing from database`); continue; }
    if (row.name !== source.name) mismatches.push(`destination ${source.slug}: name "${row.name}" ≠ "${source.name}"`);
    if (row.description !== source.description) mismatches.push(`destination ${source.slug}: description differs`);
    if (row.image !== source.image) mismatches.push(`destination ${source.slug}: image differs`);
    if (row.kind !== source.kind) mismatches.push(`destination ${source.slug}: kind differs`);
  }
  check('all 36 destinations match their source records', mismatches.length === 0);

  const before = mismatches.length;
  for (const source of packages) {
    const row = pkgBySlug.get(source.slug);
    if (!row) { mismatches.push(`package ${source.slug}: missing from database`); continue; }

    if (row.title !== source.title) mismatches.push(`package ${source.slug}: title differs`);
    if (Number(row.price) !== source.price) mismatches.push(`package ${source.slug}: price ${row.price} ≠ ${source.price}`);
    if (source.originalPrice !== null && Number(row.original_price) !== source.originalPrice) {
      mismatches.push(`package ${source.slug}: original_price differs`);
    }
    if (row.duration_days !== source.durationDays) mismatches.push(`package ${source.slug}: duration_days differs`);
    if (row.duration_nights !== source.durationNights) mismatches.push(`package ${source.slug}: duration_nights differs`);
    if (row.duration_text !== source.durationText) mismatches.push(`package ${source.slug}: duration_text differs`);
    if (row.cover_image !== source.coverImage) mismatches.push(`package ${source.slug}: cover_image differs`);
    if (row.description !== source.description) mismatches.push(`package ${source.slug}: overview differs`);

    for (const [column, sourceValue] of [
      ['gallery', source.gallery],
      ['itinerary', source.itinerary],
      ['inclusions', source.inclusions],
      ['exclusions', source.exclusions],
      ['batches', source.batches],
    ]) {
      if (canonical(row[column]) !== canonical(sourceValue)) {
        mismatches.push(`package ${source.slug}: ${column} differs (db ${row[column]?.length} vs source ${sourceValue.length})`);
      }
    }
  }
  check('all 68 packages match their source records', mismatches.length === before);

  if (mismatches.length) mismatches.slice(0, 20).forEach((m) => console.log(`      ${m}`));
}

async function representativeRows(pool) {
  console.log('\n── Representative rows ──');

  const show = async (label, sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    console.log(`  ${label}:`);
    rows.forEach((r) => console.log(`      ${JSON.stringify(r)}`));
  };

  await show('domestic destination', `
    SELECT slug, name, country, kind, active, left(description, 45) || '…' AS description
      FROM destinations WHERE slug = $1`, ['kerala']);

  await show('international destination', `
    SELECT slug, name, country, region, kind, metadata->'cities' AS cities
      FROM destinations WHERE slug = $1`, ['bali']);

  await show('cheapest package', `
    SELECT p.slug, p.title, p.price, p.duration_text, d.name AS destination
      FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id
     ORDER BY p.price ASC LIMIT 1`);

  await show('most expensive package', `
    SELECT p.slug, p.title, p.price, p.original_price, d.name AS destination
      FROM packages p LEFT JOIN destinations d ON d.id = p.destination_id
     ORDER BY p.price DESC LIMIT 1`);

  await show('longest itinerary', `
    SELECT slug, duration_text, jsonb_array_length(itinerary) AS days,
           jsonb_array_length(inclusions) AS inclusions, jsonb_array_length(exclusions) AS exclusions,
           jsonb_array_length(gallery) AS gallery
      FROM packages ORDER BY jsonb_array_length(itinerary) DESC LIMIT 1`);

  await show('featured packages', `SELECT slug, price, featured, popular FROM packages WHERE featured ORDER BY slug`);

  await show('tag distribution', `
    SELECT tag, COUNT(*)::int AS packages
      FROM packages, jsonb_array_elements_text(tags) AS t(tag)
     GROUP BY tag ORDER BY packages DESC`);

  await show('packages per destination (top 5)', `
    SELECT d.name, COUNT(p.id)::int AS packages
      FROM destinations d LEFT JOIN packages p ON p.destination_id = d.id
     GROUP BY d.name HAVING COUNT(p.id) > 0
     ORDER BY packages DESC, d.name LIMIT 5`);
}

const pool = getPool();
try {
  await sqlIntegrity(pool);
  await sourceComparison(pool);
  await representativeRows(pool);

  console.log('\n── Result ──');
  notes.forEach((n) => console.log(`  note: ${n}`));
  if (failures.length) {
    console.log(`  ✗ ${failures.length} check(s) failed:`);
    failures.forEach((f) => console.log(`      ${f}`));
    process.exitCode = 1;
  } else {
    console.log('  ✓ All verification checks passed.');
  }
} catch (err) {
  console.error('✗ Verification error:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

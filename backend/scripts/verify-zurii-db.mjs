/**
 * Database Verification Script for Zurii V1.
 *
 *   node scripts/verify-zurii-db.mjs
 *
 * Verifies SQL integrity, counts, duplicate slugs, orphan foreign keys, negative prices, and JSONB validity.
 */
import pkg from '../db/pool.js';
const { getPool } = pkg;

export async function verifyDatabase(pool) {
  const failures = [];
  const checks = [];

  const check = (label, ok, detail = '') => {
    checks.push({ label, ok, detail });
    if (!ok) failures.push(`${label}${detail ? ` (${detail})` : ''}`);
  };

  // 1. Table Counts
  const { rows: counts } = await pool.query(`
    SELECT (SELECT COUNT(*)::int FROM destinations) AS destinations,
           (SELECT COUNT(*)::int FROM packages)     AS packages,
           (SELECT COUNT(*)::int FROM bookings)     AS bookings,
           (SELECT COUNT(*)::int FROM contacts)     AS contacts,
           (SELECT COUNT(*)::int FROM admins)       AS admins
  `);
  const c = counts[0];
  check('destinations table is populated', c.destinations > 0, `${c.destinations} rows`);
  check('packages table is populated', c.packages > 0, `${c.packages} rows`);
  check('pre-existing admins preserved', c.admins > 0, `${c.admins} rows`);
  check('contacts table preserved', c.contacts >= 0, `${c.contacts} rows`);
  check('bookings table ready', c.bookings >= 0, `${c.bookings} rows`);

  // 2. Duplicate Slugs
  const dupDest = await pool.query(`SELECT slug FROM destinations GROUP BY slug HAVING COUNT(*) > 1`);
  check('no duplicate destination slugs', dupDest.rows.length === 0, `${dupDest.rows.length} duplicates`);

  const dupPkg = await pool.query(`SELECT slug FROM packages GROUP BY slug HAVING COUNT(*) > 1`);
  check('no duplicate package slugs', dupPkg.rows.length === 0, `${dupPkg.rows.length} duplicates`);

  // 3. Orphaned Foreign Keys
  const orphans = await pool.query(`
    SELECT p.slug FROM packages p
     WHERE p.destination_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM destinations d WHERE d.id = p.destination_id)
  `);
  check('no orphaned destination_id values', orphans.rows.length === 0, `${orphans.rows.length} orphans`);

  const invalidBookingPkgs = await pool.query(`
    SELECT b.id FROM bookings b
     WHERE b.package_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM packages p WHERE p.id = b.package_id)
  `);
  check('no invalid package_id references in bookings', invalidBookingPkgs.rows.length === 0);

  // 4. Required Fields & Price Validation
  const nullsDest = await pool.query(`SELECT COUNT(*)::int AS n FROM destinations WHERE name IS NULL OR slug IS NULL`);
  check('destinations have name and slug', nullsDest.rows[0].n === 0);

  const nullsPkg = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE title IS NULL OR slug IS NULL`);
  check('packages have title and slug', nullsPkg.rows[0].n === 0);

  const negativePrice = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE price < 0 OR original_price < 0`);
  check('no negative prices in packages', negativePrice.rows[0].n === 0);

  // 5. JSONB Array Columns
  const jsonbCols = ['gallery', 'highlights', 'itinerary', 'inclusions', 'exclusions', 'tags'];
  for (const col of jsonbCols) {
    const res = await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE jsonb_typeof(${col}) <> 'array'`);
    check(`packages.${col} is valid JSONB array`, res.rows[0].n === 0);
  }

  return { checks, failures, counts: c };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = getPool();
  try {
    console.log('── Database Verification (Zurii V1) ──');
    const { checks, failures, counts } = await verifyDatabase(pool);
    checks.forEach((chk) => {
      console.log(`  ${chk.ok ? '✓' : '✗'} ${chk.label}${chk.detail ? ` — ${chk.detail}` : ''}`);
    });

    console.log('\n── Table Summary ──');
    console.log(`  destinations: ${counts.destinations} | packages: ${counts.packages} | bookings: ${counts.bookings} | contacts: ${counts.contacts} | admins: ${counts.admins}`);

    if (failures.length > 0) {
      console.error(`\n✗ Verification failed with ${failures.length} issue(s):`);
      failures.forEach((f) => console.error(`   - ${f}`));
      process.exitCode = 1;
    } else {
      console.log('\n✓ All database verification checks passed.');
    }
  } catch (err) {
    console.error('✗ Verification script failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

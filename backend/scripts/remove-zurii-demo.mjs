/**
 * Safe Demo Seed Removal Script for Zurii.
 *
 *   node scripts/remove-zurii-demo.mjs
 *
 * Deletes ONLY rows where `metadata->>'demo' = 'true'` and `metadata->>'seedSource' = 'zurii-v1-demo'`.
 * Never touches admins, contacts, or non-demo data.
 */
import pkg from '../db/pool.js';
const { getPool } = pkg;

export async function removeDemoData(pool) {
  const client = await pool.connect();
  const summary = { bookings: 0, packages: 0, destinations: 0 };

  try {
    await client.query('BEGIN');

    // 1. Delete demo bookings (by demo marker in message or admin_notes)
    const delBookings = await client.query(
      `DELETE FROM bookings WHERE message LIKE '%ZURII_DEMO_BOOKING%' OR admin_notes LIKE '%Demo lead%' RETURNING id`
    );
    summary.bookings = delBookings.rows.length;

    // 2. Delete demo packages
    const delPackages = await client.query(
      `DELETE FROM packages WHERE metadata->>'demo' = 'true' AND metadata->>'seedSource' = 'zurii-v1-demo' RETURNING id`
    );
    summary.packages = delPackages.rows.length;

    // 3. Delete demo destinations
    const delDestinations = await client.query(
      `DELETE FROM destinations WHERE metadata->>'demo' = 'true' AND metadata->>'seedSource' = 'zurii-v1-demo' RETURNING id`
    );
    summary.destinations = delDestinations.rows.length;

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
    console.log('── Removing Demo Seed Data ──');
    const summary = await removeDemoData(pool);
    console.log(`Deleted demo bookings     : ${summary.bookings}`);
    console.log(`Deleted demo packages     : ${summary.packages}`);
    console.log(`Deleted demo destinations : ${summary.destinations}`);
    console.log('✓ Demo data successfully removed.');
  } catch (err) {
    console.error('✗ Demo removal failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

/**
 * Destructive operations that exist ONLY for the isolated test database.
 *
 * The caller must already hold a connection verified by db/safety.js; this
 * module verifies it AGAIN on the very same connection immediately before the
 * destructive statement, so no code path can reach the DROP with anything but
 * zurii_test (exact name, test marker, non-superuser role).
 */
const { verifyConnectedDatabase } = require('./safety');

/**
 * Return zurii_test to the state of a freshly created database: the public
 * schema is dropped and recreated exactly as initdb makes it (owned by
 * pg_database_owner, USAGE for PUBLIC, the standard comment), atomically.
 */
async function resetTestDatabase(client) {
  await verifyConnectedDatabase(client, 'test');
  await client.query('BEGIN');
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public AUTHORIZATION pg_database_owner');
    await client.query('GRANT USAGE ON SCHEMA public TO PUBLIC');
    await client.query(`COMMENT ON SCHEMA public IS 'standard public schema'`);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

module.exports = { resetTestDatabase };

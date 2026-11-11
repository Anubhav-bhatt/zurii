/**
 * Imported FIRST by every database-backed test file.
 *
 * At import (synchronously, before any test creates a pool): the process must
 * have been started by backend/scripts/run-tests.mjs — ZURII_DB_TARGET=test and
 * a DATABASE_URL naming zurii_test on an approved local host. A test file run
 * any other way (bare `node --test`, an IDE runner, a stray .env) throws here
 * and never connects.
 *
 * In each suite's before(): assertTestDatabase(pool) re-checks the LIVE
 * connection — current_database(), the test marker, a non-superuser role —
 * before the suite inserts or deletes a single row.
 */
import safetyModule from '../../db/safety.js';

const { assertTestProcess, verifyConnectedDatabase } = safetyModule;

export const TEST_DATABASE = assertTestProcess(process.env);

export async function assertTestDatabase(pool) {
  const client = await pool.connect();
  try {
    await verifyConnectedDatabase(client, 'test');
  } finally {
    client.release();
  }
}

/**
 * Create the base tables (`contacts`, `admins`) before any migration that
 * depends on them.
 *
 *   node scripts/initBaseSchema.mjs
 *
 * Run first by docker-entrypoint.sh. Until this existed, the entrypoint ran
 * migrateAnalyticsSchema.mjs (which needs `contacts`) and
 * migrateAdminSecuritySchema.mjs (which needs `admins`) BEFORE server.js — the
 * only thing that created either table. On an existing database that happened
 * to work; on a fresh one it was a permanent container restart loop, because
 * `set -e` killed the entrypoint at the failing migration and the step that
 * would have created the tables was never reached.
 *
 * All DDL lives in db/baseSchema.js and is shared with the server's own boot
 * path, so the two cannot drift. Every statement is idempotent and
 * non-destructive — no DROP, no TRUNCATE, no data rewrite — so this is safe to
 * run on every start and against a production database with real leads in it.
 */
import process from 'node:process';

import poolModule from '../db/pool.js';
import baseSchemaModule from '../db/baseSchema.js';

const { getPool } = poolModule;
const { ensureBaseSchema } = baseSchemaModule;

console.log('── Base schema (contacts, admins) ──');

const pool = getPool();

try {
  await ensureBaseSchema(pool);
  console.log('✓ Base schema is up to date.');
} catch (err) {
  // Message only, never the error object: a pg error carries the connection
  // configuration on its properties, and printing it would put the database
  // password in the container log.
  console.error(`✗ Base schema initialization failed: ${err.message}`);
  if (err.code) console.error(`  PostgreSQL error code: ${err.code}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}

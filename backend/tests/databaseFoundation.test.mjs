// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

import poolModule from '../db/pool.js';
import migratorModule from '../db/migrator.js';
import seedModule from '../db/catalogueSeed.js';
import snapshotModule from '../db/schemaSnapshot.js';
import schemaChangesModule from '../db/schemaChanges.js';

/**
 * The Phase 1 database foundation, against the isolated zurii_test database
 * that scripts/run-tests.mjs has just rebuilt (reset → migrate → seed):
 *
 *   - the ledger matches the migration files, and re-running is a no-op;
 *   - the schema is identical to the one the legacy boot path builds;
 *   - the catalogue equals the versioned artifact, field for field;
 *   - re-seeding is idempotent and never overwrites a hand-edited row;
 *   - a newer artifact updates only unedited rows (dry run leaves no trace).
 */
const { getPool } = poolModule;
const { status, migrate, loadMigrations, loadBaselineSnapshot, POST_BASELINE_INDEXES } = migratorModule;
const { seedCatalogue, verifyCatalogue, loadArtifact } = seedModule;
const { describeSchema, compareSchemas } = snapshotModule;
const { MIGRATION_SCHEMA_CHANGES, unexplainedDifferences } = schemaChangesModule;

let pool;
let client;

before(async () => {
  pool = getPool();
  await assertTestDatabase(pool);
  client = await pool.connect();
});

after(async () => {
  client?.release();
  await pool.end();
});

test('every migration is recorded exactly once with a matching checksum', async () => {
  const s = await status(client);
  assert.deepEqual(s.problems, []);
  assert.deepEqual(s.pending, []);
  assert.deepEqual(s.applied.map((a) => a.id), loadMigrations().map((m) => m.id));
});

test('running the migrations again changes nothing', async () => {
  const result = await migrate(client, { log: () => {} });
  assert.deepEqual(result.applied, []);
  assert.equal(result.alreadyApplied.length, loadMigrations().length);
});

// Everything 0004_lead_management adds on top of the legacy schema — and
// nothing else (db/schemaChanges.js, shared with `db:*:verify`). Additive only:
// new tables, new nullable columns, new indexes and constraints; the one
// changed constraint is bookings_status_check, widened to accept CANCELLED.
const ADDED_BY_0004 = MIGRATION_SCHEMA_CHANGES['0004_lead_management'].added;
// 0005_lead_attribution: nullable attribution columns on both lead tables,
// bookings.destination_id (+ its foreign key) and one analytics index.
const ADDED_BY_0005 = MIGRATION_SCHEMA_CHANGES['0005_lead_attribution'].added;

test('the migrated schema is the legacy boot path plus exactly what 0004 and 0005 add', async () => {
  const diffs = compareSchemas(loadBaselineSnapshot(), await describeSchema(client), {
    allowExtraIndexes: POST_BASELINE_INDEXES,
  });
  const widened = diffs.filter((d) => d.startsWith('bookings: constraint bookings_status_check is '));
  assert.equal(widened.length, 1, 'bookings_status_check is the one changed constraint');
  const [actualDef, expectedDef] = /is "(.*)", expected "(.*)"$/.exec(widened[0]).slice(1);
  assert.equal(actualDef, expectedDef.replace(`'CLOSED'::character varying]`, `'CLOSED'::character varying, 'CANCELLED'::character varying]`),
    'widened by CANCELLED only — every old value is still accepted');
  assert.deepEqual(diffs.filter((d) => d !== widened[0]).sort(), [...ADDED_BY_0004, ...ADDED_BY_0005].sort());
  assert.deepEqual(unexplainedDifferences(diffs, loadMigrations().map((m) => m.id)), [], 'verify accepts exactly this');
  assert.ok(unexplainedDifferences(diffs, ['0001_baseline_schema']).length > 0, 'without 0004 in the ledger, its objects are unexplained');
  assert.deepEqual(
    unexplainedDifferences(diffs, loadMigrations().map((m) => m.id).filter((id) => id !== '0005_lead_attribution')).sort(),
    [...ADDED_BY_0005].sort(),
    'without 0005 in the ledger, exactly its objects are unexplained'
  );
  const { rows } = await client.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'admins_username_lower_key'`);
  assert.equal(rows.length, 1, '0002 adds the case-insensitive username index');
});

test('the catalogue equals the versioned artifact, field for field', async () => {
  const result = await verifyCatalogue(client, loadArtifact());
  assert.deepEqual(result.failures, []);
  assert.equal(result.counts.destinations, 36);
  assert.equal(result.counts.packages, 68);
  assert.equal(result.counts.ledgerRows, 104);
});

test('seeding the same artifact again inserts and updates nothing', async () => {
  const summary = await seedCatalogue(client);
  for (const entity of ['destinations', 'packages']) {
    assert.equal(summary[entity].inserted, 0, entity);
    assert.equal(summary[entity].updated, 0, entity);
    assert.equal(summary[entity].edited + summary[entity].deleted + summary[entity].unmanaged, 0, entity);
  }
});

test('a hand-edited catalogue row survives a re-seed untouched', async () => {
  const victim = loadArtifact().packages.find((p) => p.slug !== 'bali' && p.destination_slug !== null);
  const { rows: [original] } = await client.query('SELECT difficulty FROM packages WHERE slug = $1', [victim.slug]);

  await client.query('UPDATE packages SET difficulty = $1 WHERE slug = $2', ['edited-by-test', victim.slug]);
  try {
    const summary = await seedCatalogue(client);
    assert.equal(summary.packages.edited, 1);
    assert.equal(summary.packages.updated, 0);
    assert.ok(summary.skipped.some((line) => line.startsWith(`package:${victim.slug}:`)));
    const { rows: [now] } = await client.query('SELECT difficulty FROM packages WHERE slug = $1', [victim.slug]);
    assert.equal(now.difficulty, 'edited-by-test', 'the edit must not be overwritten');
  } finally {
    await client.query('UPDATE packages SET difficulty = $1 WHERE slug = $2', [original.difficulty, victim.slug]);
  }

  const again = await seedCatalogue(client);
  assert.equal(again.packages.edited, 0, 'restoring the original content makes the row managed again');
});

test('a newer artifact updates only rows nobody edited — and a dry run leaves no trace', async () => {
  const artifact = structuredClone(loadArtifact());
  artifact.version += 1;
  const target = artifact.packages.find((p) => p.slug !== 'bali');
  const before = target.subtitle;
  target.subtitle = `${before ?? ''} (v2)`;

  const summary = await seedCatalogue(client, { artifact, dryRun: true });
  assert.equal(summary.packages.updated, 1);
  assert.equal(summary.packages.inserted, 0);
  assert.equal(summary.destinations.updated, 0);

  const { rows: [row] } = await client.query('SELECT subtitle FROM packages WHERE slug = $1', [target.slug]);
  assert.equal(row.subtitle, before, 'the dry run was rolled back');
});

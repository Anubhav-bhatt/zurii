/**
 * Pure unit tests — no database connection is opened anywhere in this file.
 *
 * Proves the guards in db/safety.js refuse every unsafe target before a
 * connection is attempted, and pins the invariants of the migration files,
 * the baseline snapshot and the catalogue artifact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import safetyModule from '../db/safety.js';
import migratorModule from '../db/migrator.js';
import seedModule from '../db/catalogueSeed.js';
import snapshotModule from '../db/schemaSnapshot.js';
import schemaChangesModule from '../db/schemaChanges.js';

const { assertTargetUrl, assertTestProcess, connectProductionVerified, DatabaseSafetyError } = safetyModule;
const { loadMigrations, checksumOf, loadBaselineSnapshot, APP_TABLES } = migratorModule;
const { loadArtifact, validateArtifact, isPortableImageRef, canonicalJson } = seedModule;
const { compareSchemas } = snapshotModule;
const { unexplainedDifferences } = schemaChangesModule;

const url = (user, password, host, port, database) => `postgres://${user}:${password}@${host}:${port}/${database}`;
const TEST_URL = url('zurii_test_app', 'test-only-secret', '127.0.0.1', 55432, 'zurii_test');
const DEV_URL = url('zurii_dev_app', 'dev-only-secret', '127.0.0.1', 55432, 'zurii_dev');

// ── target URL guard ───────────────────────────────────────────────

test('accepts the isolated test database on an approved local host, without exposing the password', () => {
  const info = assertTargetUrl('test', TEST_URL, { env: {} });
  assert.equal(info.database, 'zurii_test');
  assert.equal(info.host, '127.0.0.1');
  assert.equal(info.user, 'zurii_test_app');
  assert.ok(!JSON.stringify(info).includes('test-only-secret'));
});

test('rejects every database name except the exact one, even on localhost', () => {
  for (const database of ['zurii_dev', 'postgres', 'zurii', 'zurii_test_copy', 'ZURII_TEST', 'defaultdb']) {
    assert.throws(() => assertTargetUrl('test', url('u', 'p', '127.0.0.1', 55432, database), { env: {} }), DatabaseSafetyError, database);
  }
  assert.throws(() => assertTargetUrl('development', TEST_URL, { env: {} }), DatabaseSafetyError);
  assert.equal(assertTargetUrl('development', DEV_URL, { env: {} }).database, 'zurii_dev');
});

test('rejects non-local hosts, including managed-database and private-network hosts', () => {
  for (const host of ['db.example.com', 'pg-1a2b.aivencloud.com', '10.0.0.5', '192.168.1.20', 'zurii-local-db']) {
    assert.throws(() => assertTargetUrl('test', url('u', 'p', host, 5432, 'zurii_test'), { env: {} }), DatabaseSafetyError, host);
  }
});

test('a container host is accepted only when explicitly approved via ZURII_LOCAL_DB_HOSTS', () => {
  const containerUrl = url('zurii_test_app', 'p', 'zurii-local-db', 5432, 'zurii_test');
  assert.throws(() => assertTargetUrl('test', containerUrl, { env: {} }), DatabaseSafetyError);
  assert.equal(assertTargetUrl('test', containerUrl, { env: { ZURII_LOCAL_DB_HOSTS: 'zurii-local-db' } }).host, 'zurii-local-db');
});

test('rejects Unix-socket connection strings for guarded targets', () => {
  assert.throws(
    () => assertTargetUrl('test', 'postgres://u:p@/zurii_test?host=/var/run/postgresql', { env: {} }),
    DatabaseSafetyError
  );
});

test('missing or malformed URLs are refused — there is no default to fall back to', () => {
  for (const bad of [undefined, '', '   ', 'mysql://u:p@127.0.0.1/zurii_test', 'zurii_test']) {
    assert.throws(() => assertTargetUrl('test', bad, { env: {} }), DatabaseSafetyError, String(bad));
  }
});

test('a test URL may not reuse the credentials or the database of another configured URL', () => {
  const reusedCredentials = url('zurii_dev_app', 'dev-only-secret', '127.0.0.1', 55432, 'zurii_test');
  assert.throws(
    () => assertTargetUrl('test', reusedCredentials, { env: {}, compareWith: [{ label: 'DATABASE_URL', url: DEV_URL }] }),
    /reuses the credentials/
  );
  assert.throws(
    () => assertTargetUrl('test', TEST_URL, { env: {}, compareWith: [{ label: 'DATABASE_URL', url: TEST_URL }] }),
    /same database/
  );
  assert.doesNotThrow(() => assertTargetUrl('test', TEST_URL, { env: {}, compareWith: [{ label: 'DATABASE_URL', url: DEV_URL }] }));
});

test('error messages never contain a password', () => {
  for (const candidate of [
    url('u', 'super-secret-pw', 'evil.example.com', 5432, 'zurii_test'),
    url('u', 'super-secret-pw', '127.0.0.1', 5432, 'production'),
  ]) {
    assert.throws(() => assertTargetUrl('test', candidate, { env: {} }), (err) => !err.message.includes('super-secret-pw'));
  }
});

test('the live-connection check refuses a wrong database, a missing marker and a superuser', async () => {
  const { verifyConnectedDatabase } = safetyModule;
  const fakeClient = (row) => ({ query: async () => ({ rows: [row] }) });
  const good = { database: 'zurii_test', username: 'zurii_test_app', marker: 'test', superuser: false };

  assert.deepEqual(await verifyConnectedDatabase(fakeClient(good), 'test'), { database: 'zurii_test', user: 'zurii_test_app' });
  // e.g. a production database reached through a tunnel on 127.0.0.1 under the right URL
  await assert.rejects(verifyConnectedDatabase(fakeClient({ ...good, database: 'defaultdb' }), 'test'), /expected "zurii_test"/);
  await assert.rejects(verifyConnectedDatabase(fakeClient({ ...good, marker: null }), 'test'), /marker/);
  await assert.rejects(verifyConnectedDatabase(fakeClient({ ...good, marker: 'development' }), 'test'), /marker/);
  await assert.rejects(verifyConnectedDatabase(fakeClient({ ...good, superuser: true }), 'test'), /superuser/);
});

test('a test process not started by the guarded runner refuses before connecting', () => {
  assert.throws(() => assertTestProcess({ DATABASE_URL: TEST_URL }), /npm test/);
  assert.throws(() => assertTestProcess({ ZURII_DB_TARGET: 'test', DATABASE_URL: DEV_URL }), DatabaseSafetyError);
  assert.throws(() => assertTestProcess({ ZURII_DB_TARGET: 'test' }), DatabaseSafetyError);
  assert.equal(assertTestProcess({ ZURII_DB_TARGET: 'test', DATABASE_URL: TEST_URL }).database, 'zurii_test');
});

test('the production target refuses without explicit approval and confirmation (no connection attempted)', async () => {
  const prod = url('app', 'p', 'db.example.com', 5432, 'zurii');
  await assert.rejects(connectProductionVerified(prod, { env: {}, confirmDatabase: 'zurii' }), /ZURII_PRODUCTION_DB_APPROVED/);
  await assert.rejects(
    connectProductionVerified(prod, { env: { ZURII_PRODUCTION_DB_APPROVED: 'yes' }, confirmDatabase: 'other' }),
    /confirm-database/
  );
  await assert.rejects(connectProductionVerified(prod, { env: { ZURII_PRODUCTION_DB_APPROVED: 'yes' } }), /confirm-database/);
});

// ── migration files ────────────────────────────────────────────────

test('migrations are ordered, uniquely named and checksummed', () => {
  const migrations = loadMigrations();
  assert.deepEqual(migrations.map((m) => m.id), [
    '0001_baseline_schema',
    '0002_admins_username_case_insensitive',
    '0003_catalogue_seed_ledger',
    '0004_lead_management',
    '0005_lead_attribution',
  ]);
  for (const m of migrations) assert.match(m.checksum, /^[0-9a-f]{64}$/);
  assert.equal(new Set(migrations.map((m) => m.checksum)).size, migrations.length);
});

test('migrations never rename or drop anything and never touch data', () => {
  for (const m of loadMigrations()) {
    const sql = m.sql
      .replace(/--.*$/gm, '')
      // Foreign-key actions (ON DELETE SET NULL) are part of a constraint, not data changes.
      .replace(/\bON\s+(DELETE|UPDATE)\s+(SET\s+NULL|SET\s+DEFAULT|CASCADE|RESTRICT|NO\s+ACTION)\b/gi, '')
      // Trigger events (BEFORE UPDATE OR DELETE ON …) and TG_OP tests in a
      // trigger function name operations the trigger GUARDS; they change no data.
      .replace(/\bBEFORE\s+(INSERT|UPDATE|DELETE|TRUNCATE)(\s+OR\s+(INSERT|UPDATE|DELETE|TRUNCATE))*\s+ON\b/gi, '')
      .replace(/\bTG_OP\s+IN\s*\([^)]*\)/gi, '');

    // The one permitted DROP: replacing a CHECK constraint in place, under the
    // same name, in the same migration — how a constraint is widened. That it
    // only widens is asserted against the live schema in databaseFoundation.
    const replaced = [...sql.matchAll(/\bALTER\s+TABLE\s+(\w+)\s+DROP\s+CONSTRAINT\s+(\w+)\s*;/gi)];
    for (const [, table, name] of replaced) {
      assert.match(sql, new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+CONSTRAINT\\s+${name}\\s+CHECK\\b`, 'i'),
        `${m.id}: ${name} may only be dropped to be re-added under the same name`);
    }
    const checked = sql.replace(/\bALTER\s+TABLE\s+\w+\s+DROP\s+CONSTRAINT\s+\w+\s*;/gi, '');

    assert.doesNotMatch(checked, /\bRENAME\b/i, m.id);
    assert.doesNotMatch(checked, /\bDROP\b/i, m.id);
    assert.doesNotMatch(checked, /\b(INSERT|UPDATE|DELETE|TRUNCATE|COPY)\b/i, m.id);
  }
});

test('the policy above still catches real data changes', () => {
  // Guard against the allowances above being too broad.
  const strip = (sql) =>
    sql
      .replace(/\bBEFORE\s+(INSERT|UPDATE|DELETE|TRUNCATE)(\s+OR\s+(INSERT|UPDATE|DELETE|TRUNCATE))*\s+ON\b/gi, '')
      .replace(/\bTG_OP\s+IN\s*\([^)]*\)/gi, '')
      .replace(/\bALTER\s+TABLE\s+\w+\s+DROP\s+CONSTRAINT\s+\w+\s*;/gi, '');
  assert.match(strip('UPDATE contacts SET status = 1;'), /\bUPDATE\b/);
  assert.match(strip('DELETE FROM bookings;'), /\bDELETE\b/);
  assert.match(strip('ALTER TABLE contacts DROP COLUMN status;'), /\bDROP\b/);
  assert.match(strip('DROP TABLE contacts;'), /\bDROP\b/);
});

test('migrations never rename or drop anything and never touch data (legacy form)', () => {
  for (const m of loadMigrations().filter((x) => x.id < '0004')) {
    const sql = m.sql
      .replace(/--.*$/gm, '')
      .replace(/\bON\s+(DELETE|UPDATE)\s+(SET\s+NULL|SET\s+DEFAULT|CASCADE|RESTRICT|NO\s+ACTION)\b/gi, '');
    assert.doesNotMatch(sql, /\bRENAME\b/i, m.id);
    assert.doesNotMatch(sql, /\bDROP\b/i, m.id);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|COPY)\b/i, m.id);
  }
});

test('checksums ignore Windows line endings', () => {
  assert.equal(checksumOf('CREATE TABLE a ();\r\n'), checksumOf('CREATE TABLE a ();\n'));
});

test('the baseline snapshot describes exactly the seven application tables', () => {
  assert.deepEqual(Object.keys(loadBaselineSnapshot().tables).sort(), [...APP_TABLES].sort());
});

test('schema comparison catches a changed default, a missing index and a moved column', () => {
  const expected = loadBaselineSnapshot();
  const actual = structuredClone(expected);
  actual.tables.contacts.columns.find((c) => c.name === 'status').default = "'new'::character varying";
  actual.tables.packages.indexes = actual.tables.packages.indexes.filter((i) => i.name !== 'packages_price_idx');
  const cols = actual.tables.admins.columns;
  [cols[0].position, cols[1].position] = [cols[1].position, cols[0].position];

  const diffs = compareSchemas(expected, actual);
  assert.ok(diffs.some((d) => d.startsWith('contacts.status: default')), diffs.join('\n'));
  assert.ok(diffs.some((d) => d.includes('missing index packages_price_idx')), diffs.join('\n'));
  assert.ok(diffs.some((d) => d.includes('position')), diffs.join('\n'));
  assert.ok(!compareSchemas(expected, actual, { ignoreColumnOrder: true }).some((d) => d.includes('position')));
});

test('a pg_dump/pg_restore copy matches the baseline; a changed CHECK value set still does not (Phase 7)', () => {
  // How PostgreSQL 16 respells `col IN (...)` CHECKs after a dump/restore round
  // trip — observed on a restored copy in the Phase 7 upgrade rehearsal.
  const asRestored = (def) => def.replace(/ARRAY\[([^\]]*)\]::text\[\]/g,
    (_, inner) => `ARRAY[${inner.replace(/::character varying/g, '::character varying::text')}]`);
  const expected = loadBaselineSnapshot();
  const restored = structuredClone(expected);
  let respelled = 0;
  for (const table of Object.values(restored.tables)) {
    for (const con of table.constraints) {
      const next = asRestored(con.definition);
      if (next !== con.definition) respelled += 1;
      con.definition = next;
    }
  }
  assert.equal(respelled, 3, 'bookings_status_check, destinations_kind_check, packages_status_check');
  assert.deepEqual(compareSchemas(expected, restored), []);

  const narrowed = structuredClone(restored);
  const pkg = narrowed.tables.packages.constraints.find((c) => c.name === 'packages_status_check');
  pkg.definition = pkg.definition.replace("'ARCHIVED'", "'DELETED'");
  assert.ok(compareSchemas(expected, narrowed).some((d) => d.includes('packages_status_check')));

  // After 0004, a restored copy still counts as "baseline + the documented widening".
  const after0004 = structuredClone(restored);
  const bk = after0004.tables.bookings.constraints.find((c) => c.name === 'bookings_status_check');
  bk.definition = bk.definition.replace("'CLOSED'::character varying::text]", "'CLOSED'::character varying::text, 'CANCELLED'::character varying::text]");
  const diffs = compareSchemas(expected, after0004);
  assert.equal(diffs.length, 1, diffs.join('\n'));
  assert.deepEqual(unexplainedDifferences(diffs, ['0004_lead_management']), []);
  assert.equal(unexplainedDifferences(diffs, []).length, 1, 'without 0004 in the ledger it is unexplained');
});

// ── catalogue artifact ─────────────────────────────────────────────

test('the catalogue artifact is valid: 36 destinations and 68 packages with unique slugs', () => {
  const artifact = loadArtifact();
  assert.equal(artifact.destinations.length, 36);
  assert.equal(artifact.packages.length, 68);
  assert.equal(new Set(artifact.destinations.map((d) => d.slug)).size, 36);
  assert.equal(new Set(artifact.packages.map((p) => p.slug)).size, 68);
  assert.deepEqual(validateArtifact(artifact), []);
});

test('every package destination link resolves inside the artifact', () => {
  const artifact = loadArtifact();
  const slugs = new Set(artifact.destinations.map((d) => d.slug));
  for (const p of artifact.packages) {
    if (p.destination_slug !== null) assert.ok(slugs.has(p.destination_slug), p.slug);
  }
});

test('image references must be portable — never a machine path', () => {
  assert.equal(isPortableImageRef('https://images.unsplash.com/photo-1?w=800'), true);
  assert.equal(isPortableImageRef('/media/catalogue/kerala.webp'), true);
  assert.equal(isPortableImageRef(null), true);
  for (const bad of ['/Users/dev/kerala.jpg', '/home/dev/x.png', '/private/tmp/x.jpg', 'file:///x.jpg',
    'C:\\images\\x.jpg', 'data:image/png;base64,AAAA', '', ' https://x.example/a.jpg', '//cdn.example/x.jpg']) {
    assert.equal(isPortableImageRef(bad), false, bad);
  }
  const artifact = loadArtifact();
  const broken = structuredClone(artifact);
  broken.packages[0].cover_image = '/Users/somebody/Desktop/cover.jpg';
  assert.ok(validateArtifact(broken).some((p) => p.includes('non-portable image reference')));
});

test('canonical JSON is independent of key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: 3 } }), canonicalJson({ a: { c: 3, d: [2, { x: 0, y: 1 }] }, b: 1 }));
});

test('an artifact with problems is reported, not partially accepted', () => {
  const problems = validateArtifact({
    artifact: 'zurii-travel-catalogue',
    version: 1,
    counts: { destinations: 2, packages: 0 },
    destinations: [{ slug: 'x' }],
    packages: [],
  });
  assert.ok(problems.some((p) => p.includes('counts.destinations')));
  assert.ok(problems.some((p) => p.includes('missing "name"')));
});

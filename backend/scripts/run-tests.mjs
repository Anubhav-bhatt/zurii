/**
 * The only supported way to run the backend test suite.
 *
 *   npm test                                  all suites, on a freshly rebuilt zurii_test
 *   npm test -- tests/travel-api.test.mjs     a subset
 *   npm test -- --keep                        reuse zurii_test as is (migrate + seed only)
 *
 * What makes it safe:
 *   1. TEST_DATABASE_URL comes from the environment or backend/.env.test.
 *      It NEVER falls back to DATABASE_URL — and DATABASE_URL is not passed to
 *      the tests at all except as the verified test URL (step 4).
 *   2. Before anything is written, db/safety.js requires: database exactly
 *      zurii_test, an approved local host, credentials different from every
 *      configured DATABASE_URL, current_database() = zurii_test, the
 *      zurii.environment = 'test' marker, and a non-superuser role.
 *   3. zurii_test is rebuilt deterministically: reset → migrate → seed the
 *      versioned catalogue artifact.
 *   4. node --test runs with a MINIMAL environment in which DATABASE_URL is the
 *      verified test URL and ZURII_DB_TARGET=test. Every test pool and every
 *      server.js a suite spawns inherits it, and every DB-backed test file
 *      re-verifies its own connection (tests/helpers/testDatabaseGuard.mjs) —
 *      so running a test file any other way fails closed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import safetyModule from '../db/safety.js';
import migratorModule from '../db/migrator.js';
import seedModule from '../db/catalogueSeed.js';
import testDatabaseModule from '../db/testDatabase.js';

const { connectVerified } = safetyModule;
const { migrate } = migratorModule;
const { seedCatalogue } = seedModule;
const { resetTestDatabase } = testDatabaseModule;

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readEnvFile = (name) => {
  const file = path.join(BACKEND, name);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
};

/** Only these are inherited by the test processes; everything else is dropped. */
const PASSTHROUGH = ['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'TERM', 'CI', 'SystemRoot', 'ZURII_LOCAL_DB_HOSTS'];

async function main() {
  const args = process.argv.slice(2);
  const keep = args.includes('--keep');
  const requested = args.filter((a) => !a.startsWith('--'));

  const testEnv = readEnvFile('.env.test');
  const devEnv = readEnvFile('.env');
  const testUrl = process.env.TEST_DATABASE_URL ?? testEnv.TEST_DATABASE_URL;
  const jwtSecret = process.env.TEST_JWT_SECRET ?? testEnv.JWT_SECRET;
  const jwtRefreshSecret = process.env.TEST_JWT_REFRESH_SECRET ?? testEnv.JWT_REFRESH_SECRET;
  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error('backend/.env.test must define JWT_SECRET and JWT_REFRESH_SECRET for the test server (see infra/local-db/bootstrap-env.sh).');
  }
  const sslMode = testEnv.DATABASE_SSL ?? 'disable';

  const { client, info } = await connectVerified('test', testUrl, {
    env: { ...process.env, DATABASE_SSL: sslMode },
    compareWith: [
      { label: 'DATABASE_URL (environment)', url: process.env.DATABASE_URL },
      { label: 'DATABASE_URL (backend/.env)', url: devEnv.DATABASE_URL },
    ],
  });
  console.log(`── test database verified: ${info.database} on ${info.host}:${info.port} as ${info.user} ──`);
  try {
    if (!keep) {
      await resetTestDatabase(client);
      console.log('  ✓ reset to an empty schema');
    }
    const migrated = await migrate(client, { log: () => {} });
    console.log(`  ✓ migrations: ${migrated.applied.length} applied, ${migrated.alreadyApplied.length} already applied`);
    const seeded = await seedCatalogue(client);
    console.log(
      `  ✓ catalogue: ${seeded.destinations.inserted} destinations and ${seeded.packages.inserted} packages inserted ` +
        `(${seeded.destinations.unchanged + seeded.packages.unchanged} unchanged)`
    );
  } finally {
    await client.end();
  }

  const files = requested.length
    ? requested
    : [
        ...fs.readdirSync(path.join(BACKEND, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`),
        'scripts/normalize.test.mjs',
      ];

  const childEnv = {
    NODE_ENV: 'test',
    ZURII_DB_TARGET: 'test',
    DATABASE_URL: testUrl,
    DATABASE_SSL: sslMode,
    JWT_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtRefreshSecret,
  };
  for (const key of PASSTHROUGH) if (process.env[key] !== undefined) childEnv[key] = process.env[key];

  console.log(`── node --test (${files.length} file${files.length === 1 ? '' : 's'}) ──`);
  const child = spawn(process.execPath, ['--test', ...files], { cwd: BACKEND, env: childEnv, stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
});

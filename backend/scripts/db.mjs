/**
 * Zurii database tooling — one entry point for schema, catalogue and
 * test-database operations. Every command connects through db/safety.js.
 *
 *   node scripts/db.mjs <command> --target <development|test|production> [options]
 *
 * Commands
 *   status            migration ledger vs db/migrations                         (read-only)
 *   migrate           apply pending migrations            [--adopt-baseline]
 *   seed-catalogue    import db/catalogue/catalogue.v2.json  [--dry-run]
 *   verify            schema vs baseline + catalogue integrity                  (read-only)
 *   image-inventory   every catalogue image reference as CSV [--out <file>]     (read-only)
 *   retention-report  stored data counted by age, for retention decisions       (read-only)
 *   reset             drop and recreate the public schema         test target ONLY
 *   prepare           reset + migrate + seed-catalogue            test target ONLY
 *   snapshot          write the live schema description to --out  test target ONLY
 *
 * Targets
 *   development  DATABASE_URL      (env, else backend/.env)       must be zurii_dev  + marker
 *   test         TEST_DATABASE_URL (env, else backend/.env.test)  must be zurii_test + marker
 *   production   DATABASE_URL from the environment only, plus ZURII_PRODUCTION_DB_APPROVED=yes
 *                and --confirm-database <name>. status / verify / migrate / seed-catalogue
 *                only, never reset. Prepared for a later approved phase; unused in Phase 1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import safetyModule from '../db/safety.js';
import migratorModule from '../db/migrator.js';
import seedModule from '../db/catalogueSeed.js';
import snapshotModule from '../db/schemaSnapshot.js';
import schemaChangesModule from '../db/schemaChanges.js';
import testDatabaseModule from '../db/testDatabase.js';
import retentionModule from '../db/retention.js';

const { connectVerified, connectProductionVerified, DatabaseSafetyError } = safetyModule;
const { migrate, status, loadBaselineSnapshot, baselineDifferences, POST_BASELINE_INDEXES } = migratorModule;
const { seedCatalogue, verifyCatalogue, imageInventory, loadArtifact } = seedModule;
const { describeSchema, compareSchemas } = snapshotModule;
const { unexplainedDifferences } = schemaChangesModule;
const { resetTestDatabase } = testDatabaseModule;

const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = {
  status: ['development', 'test', 'production'],
  migrate: ['development', 'test', 'production'],
  'seed-catalogue': ['development', 'test', 'production'],
  verify: ['development', 'test', 'production'],
  'image-inventory': ['development', 'test', 'production'],
  'retention-report': ['development', 'test', 'production'],
  reset: ['test'],
  prepare: ['test'],
  snapshot: ['test'],
};

function readEnvFile(name) {
  const file = path.join(BACKEND, name);
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (!arg.startsWith('--')) throw new Error(`Unexpected argument "${arg}"`);
    const key = arg.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      opts[key] = next;
      i += 1;
    } else {
      opts[key] = true;
    }
  }
  return { command, opts };
}

/** TLS settings travel with the URL's own env file; a stray shell value never wins over it. */
function tlsEnv(file) {
  const env = { ...process.env };
  for (const key of ['DATABASE_SSL', 'DATABASE_CA_CERT']) if (file[key] !== undefined) env[key] = file[key];
  return env;
}

async function connect(target, opts) {
  if (target === 'development') {
    const file = readEnvFile('.env');
    return connectVerified('development', process.env.DATABASE_URL ?? file.DATABASE_URL, { env: tlsEnv(file) });
  }
  if (target === 'test') {
    const file = readEnvFile('.env.test');
    const dev = readEnvFile('.env');
    return connectVerified('test', process.env.TEST_DATABASE_URL ?? file.TEST_DATABASE_URL, {
      env: tlsEnv(file),
      compareWith: [
        { label: 'DATABASE_URL (environment)', url: process.env.DATABASE_URL },
        { label: 'DATABASE_URL (backend/.env)', url: dev.DATABASE_URL },
      ],
    });
  }
  if (target === 'production') {
    return connectProductionVerified(process.env.DATABASE_URL, {
      env: process.env,
      confirmDatabase: typeof opts['confirm-database'] === 'string' ? opts['confirm-database'] : undefined,
    });
  }
  throw new DatabaseSafetyError(`--target must be development, test or production (got "${target ?? ''}")`);
}

const log = (line) => console.log(line);

function printSeedSummary(summary) {
  const fmt = (c) =>
    `inserted ${c.inserted}, updated ${c.updated}, unchanged ${c.unchanged}, ` +
    `skipped: edited ${c.edited} / deleted ${c.deleted} / unmanaged ${c.unmanaged}`;
  log(`  artifact v${summary.artifactVersion}${summary.dryRun ? '  [DRY RUN — rolled back]' : ''}`);
  log(`  destinations: ${fmt(summary.destinations)}`);
  log(`  packages    : ${fmt(summary.packages)}`);
  for (const line of summary.skipped.slice(0, 20)) log(`    • ${line}`);
  if (summary.skipped.length > 20) log(`    • … ${summary.skipped.length - 20} more`);
}

async function runVerify(client, target) {
  let ok = true;
  const s = await status(client);
  log(`  migrations : ${s.applied.length} applied, ${s.pending.length} pending${s.problems.length ? `, ${s.problems.length} problem(s)` : ''}`);
  if (s.pending.length || s.problems.length) {
    ok = false;
    for (const p of [...s.pending.map((id) => `pending: ${id}`), ...s.problems]) log(`    ✗ ${p}`);
  }

  // Local databases are built from the migrations, so they must match strictly
  // (column order included). An existing production database is judged by the
  // exact rules --adopt-baseline would apply.
  const rawDiffs = target === 'production'
    ? await baselineDifferences(client)
    : compareSchemas(loadBaselineSnapshot(), await describeSchema(client), { allowExtraIndexes: POST_BASELINE_INDEXES });
  // Later migrations change the schema on purpose; each documents exactly how
  // (db/schemaChanges.js), and only the ones the ledger says were applied count.
  const diffs = unexplainedDifferences(rawDiffs, s.applied.map((a) => a.id));
  log(`  schema     : ${diffs.length === 0 ? 'identical to 0001_baseline_schema snapshot + the documented changes of later migrations' : `${diffs.length} difference(s)`}`);
  for (const d of diffs) log(`    ✗ ${d}`);
  if (diffs.length) ok = false;

  const { rows: idx } = await client.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'admins_username_lower_key'`);
  log(`  0002 index : ${idx.length ? 'admins_username_lower_key present' : 'MISSING'}`);
  if (!idx.length) ok = false;

  const result = await verifyCatalogue(client, loadArtifact());
  log(`  catalogue  : ${result.counts.destinations} destinations, ${result.counts.packages} packages ` +
    `(${result.counts.published} published), ${result.counts.ledgerRows} ledger rows`);
  log(`  unlinked   : ${result.packagesWithoutDestination.length} package(s) have no destination in the source data` +
    `${result.packagesWithoutDestination.length ? ` (${result.packagesWithoutDestination.join(', ')})` : ''}`);
  for (const f of result.failures) log(`    ✗ ${f}`);
  for (const n of result.notes) log(`    • ${n}`);
  if (result.failures.length) ok = false;
  return ok;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const { command, opts } = parseArgs(process.argv.slice(2));
  if (!COMMANDS[command]) {
    throw new Error(`Usage: node scripts/db.mjs <${Object.keys(COMMANDS).join('|')}> --target <development|test|production>`);
  }
  const target = opts.target;
  if (!COMMANDS[command].includes(target)) {
    throw new DatabaseSafetyError(`"${command}" is not available for target "${target ?? '(none)'}" (allowed: ${COMMANDS[command].join(', ')}).`);
  }

  const { client, info } = await connect(target, opts);
  log(`── ${command} · target ${info.target} · database ${info.database} on ${info.host} ──`);
  try {
    switch (command) {
      case 'status': {
        const s = await status(client);
        log(`  ledger present : ${s.ledgerPresent}`);
        for (const a of s.applied) log(`  ✓ ${a.id}${a.adopted ? ' (adopted)' : ''}  ${new Date(a.appliedAt).toISOString()}`);
        for (const p of s.pending) log(`  · pending ${p}`);
        for (const p of s.problems) log(`  ✗ ${p}`);
        log(`  app tables     : ${s.appTables.length ? s.appTables.join(', ') : 'none'}`);
        if (s.problems.length) process.exitCode = 1;
        break;
      }
      case 'migrate': {
        const result = await migrate(client, { adoptBaseline: opts['adopt-baseline'] === true, log });
        log(`  ${result.applied.length} applied, ${result.alreadyApplied.length} already applied, ${result.total} total`);
        break;
      }
      case 'seed-catalogue': {
        printSeedSummary(await seedCatalogue(client, { dryRun: opts['dry-run'] === true }));
        break;
      }
      case 'verify': {
        const ok = await runVerify(client, target);
        log(ok ? '✓ verification passed' : '✗ verification FAILED');
        if (!ok) process.exitCode = 1;
        break;
      }
      case 'retention-report': {
        // Counts only — no rows, identifiers or personal data, and nothing deleted.
        const report = await retentionModule.retentionReport(client);
        const labels = retentionModule.BUCKETS.map(([label]) => label);
        log(`  ${'dataset'.padEnd(40)} ${'total'.padStart(7)}  ${labels.map((l) => l.padStart(15)).join('')}  oldest`);
        for (const r of report) {
          log(`  ${r.dataset.padEnd(40)} ${String(r.total).padStart(7)}  ${labels.map((l) => String(r.byAge[l]).padStart(15)).join('')}  ${r.oldest ?? '—'}`);
        }
        log('  Read-only. Proposed retention periods: docs/PRIVACY_AND_RETENTION.md (awaiting owner approval).');
        break;
      }
      case 'image-inventory': {
        const rows = await imageInventory(client);
        const lines = ['entity,slug,field,position,kind,host,reference'];
        for (const r of rows) lines.push([r.entity, r.slug, r.field, r.position, r.kind, r.host, r.reference].map(csvCell).join(','));
        const csv = `${lines.join('\n')}\n`;
        if (typeof opts.out === 'string') {
          fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
          fs.writeFileSync(path.resolve(opts.out), csv);
          log(`  wrote ${rows.length} reference(s) to ${opts.out}`);
        } else {
          process.stdout.write(csv);
        }
        const unique = new Set(rows.map((r) => r.reference));
        const byField = rows.reduce((acc, r) => ({ ...acc, [`${r.entity}.${r.field}`]: (acc[`${r.entity}.${r.field}`] || 0) + 1 }), {});
        const hosts = rows.reduce((acc, r) => ({ ...acc, [r.host || '(local)']: (acc[r.host || '(local)'] || 0) + 1 }), {});
        log(`  ${rows.length} references, ${unique.size} unique; by field ${JSON.stringify(byField)}; by host ${JSON.stringify(hosts)}`);
        break;
      }
      case 'reset': {
        await resetTestDatabase(client);
        log('  ✓ zurii_test public schema dropped and recreated');
        break;
      }
      case 'prepare': {
        await resetTestDatabase(client);
        log('  ✓ reset');
        await migrate(client, { log });
        printSeedSummary(await seedCatalogue(client));
        break;
      }
      case 'snapshot': {
        if (typeof opts.out !== 'string') throw new Error('snapshot requires --out <file>');
        const description = await describeSchema(client);
        fs.writeFileSync(path.resolve(opts.out), `${JSON.stringify(description, null, 2)}\n`);
        log(`  wrote ${Object.keys(description.tables).length} table description(s) to ${opts.out}`);
        break;
      }
      default:
        break;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
});

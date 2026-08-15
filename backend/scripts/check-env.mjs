/**
 * Configuration pre-flight check.
 *
 *   npm run check:env
 *
 * Reports whether every variable the backend needs is present and well-formed,
 * WITHOUT connecting to anything and WITHOUT printing a single value. Intended
 * to be the first thing a deployment engineer runs: it turns "the container
 * restarts and I don't know why" into a list of named variables, before the
 * stack is ever started.
 *
 * Exit codes are meaningful so this can gate a deploy:
 *   0  every required variable is present and valid
 *   1  at least one is missing or invalid
 *
 * What it deliberately does NOT do: open a database connection. Reachability is
 * a different question from configuration, it is slow, and it needs credentials
 * this script should not be in the business of exercising. `docker compose logs
 * backend` and GET /api/ready answer that one.
 */
import process from 'node:process';
import envModule from '../config/env.js';

const { inspectEnv, SPEC } = envModule;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Colour only when writing to a terminal, so redirected output and CI logs stay
// free of escape sequences.
const paint = (colour, text) => (process.stdout.isTTY ? `${colour}${text}${RESET}` : text);

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';

console.log(`\nZurii backend — configuration check (${mode})\n`);

const { ok, results, errors } = inspectEnv();

const width = Math.max(...Object.keys(SPEC).map((k) => k.length));

for (const result of results) {
  const name = result.name.padEnd(width);

  if (result.status === 'ok') {
    // "configured", never the value. This line is the whole reason an operator
    // can paste this output into a ticket.
    console.log(`  ${paint(GREEN, '✓')} ${name}  configured`);
  } else if (result.status === 'optional') {
    console.log(`  ${paint(DIM, '·')} ${name}  ${paint(DIM, 'not set (optional)')}`);
  } else if (result.status === 'missing') {
    console.log(`  ${paint(RED, '✗')} ${name}  ${paint(RED, 'MISSING — required')}`);
  } else {
    console.log(`  ${paint(RED, '✗')} ${name}  ${paint(RED, 'INVALID')}`);
  }
}

if (!ok) {
  console.log(`\n${paint(RED, 'Configuration is incomplete:')}\n`);
  for (const error of errors) console.log(`  - ${error}`);
  console.log('\n  Descriptions of each variable:\n');
  for (const result of results) {
    if (result.status === 'missing' || result.status === 'invalid') {
      console.log(`    ${result.name}`);
      console.log(`      ${result.description}`);
    }
  }
  console.log(
    '\n  Fill these in backend/.env (copy backend/.env.example), or set them in the\n' +
    '  deployment environment. See DEPLOYMENT.md.\n'
  );
  process.exit(1);
}

// Advisories: valid configuration that is nonetheless worth a second look
// before production. None of these fail the check.
const advisories = [];

if (mode === 'production') {
  const sslMode = process.env.DATABASE_SSL?.trim();
  if (!sslMode || sslMode === 'no-verify') {
    advisories.push(
      'DATABASE_SSL is not "verify" — the database connection is encrypted but the\n' +
      '    server certificate is not authenticated. Set DATABASE_SSL=verify (plus\n' +
      '    DATABASE_CA_CERT if your provider issues its own CA) once you have the bundle.'
    );
  }
  if (!process.env.TRUST_PROXY) {
    advisories.push(
      'TRUST_PROXY is unset. Behind nginx or an ingress every visitor appears with the\n' +
      '    proxy\'s IP, so the per-IP rate limits throttle all traffic as one caller.\n' +
      '    Set TRUST_PROXY=1 behind a single proxy; leave unset if exposed directly.'
    );
  }
  if (process.env.ADMIN_SEED) {
    advisories.push(
      'ADMIN_SEED is set. It is bootstrap-only: the password sits in the environment,\n' +
      '    readable by any process on the host. Prefer `node create-admin.js add <user>`,\n' +
      '    and unset ADMIN_SEED once the account exists.'
    );
  }
}

if (advisories.length > 0) {
  console.log(`\n${paint(YELLOW, 'Advisories:')}\n`);
  for (const advisory of advisories) console.log(`  ${paint(YELLOW, '!')} ${advisory}`);
}

console.log(`\n${paint(GREEN, 'Configuration OK.')} Reachability is a separate question — start the stack and check GET /api/ready.\n`);

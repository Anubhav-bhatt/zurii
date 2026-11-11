/**
 * Phase 6 — structured logging (ZT-12) and outage responses.
 *
 *   - the logger's scrubbing, redaction and database-error classes
 *   - request ids, the access-log line and its outcome levels
 *   - a catalogue outage answers 503 + Retry-After; a query bug answers 500;
 *     neither names the database
 *   - through the real server: no password, token, cookie, form value or
 *     search text reaches stdout/stderr, and rate-limit refusals are logged
 *
 * Writes only contact rows under its own email domain, removed afterwards.
 */
// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import express from 'express';

import poolModule from '../db/pool.js';
import loggerModule from '../lib/logger.js';
import requestLogModule from '../middleware/requestLog.js';
import createTravelRouter from '../routes/travel.js';
import leadSchemaModule from '../db/leadSchema.js';
import retentionModule from '../db/retention.js';

const { getPool } = poolModule;
const { createLogger, scrub, clean, classifyDbError, errorFields } = loggerModule;
const { createRequestLogger } = requestLogModule;
const RUN = crypto.randomBytes(4).toString('hex');
const DOMAIN = `obs-${RUN}.test`;
const pool = getPool();

let child;
let base;
let output = '';

before(async () => {
  await assertTestDatabase(pool);
  const port = 6100 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  child = spawn('node', ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), TRUST_PROXY: '1', LOG_LEVEL: 'info' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).status) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
});

after(async () => {
  child?.kill('SIGTERM');
  await pool.query('DELETE FROM contacts WHERE email LIKE $1', [`%@${DOMAIN}`]);
  await pool.end();
});

const lines = () => output.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
const settle = () => new Promise((r) => setTimeout(r, 150));

describe('logger', () => {
  it('scrubs emails, phone numbers, tokens and connection strings from text', () => {
    const text = scrub('Key (email)=(jane.doe@example.com) failed; call +91 98765 43210; '
      + 'Bearer abc.def-ghi; eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl; postgres://app:pw@db:5432/zurii');
    for (const leak of ['jane.doe@example.com', '98765', 'abc.def-ghi', 'eyJhbGciOiJI', 'app:pw']) assert.ok(!text.includes(leak), leak);
  });

  it('redacts sensitive keys but keeps our identifiers verbatim', () => {
    const reqId = '3f1e2d4c-9a8b-4c7d-8e6f-123456789abc';
    const out = clean({ reqId, password: 'x', authorization: 'Bearer y', email: 'a@b.co', phone: '1', cookie: 'z', status: 500, route: '/api/x' });
    assert.equal(out.reqId, reqId);
    for (const k of ['password', 'authorization', 'email', 'phone', 'cookie']) assert.equal(out[k], '[redacted]', k);
    assert.equal(out.status, 500);
  });

  it('classifies database errors', () => {
    assert.equal(classifyDbError({ code: 'ECONNREFUSED' }), 'db_unavailable');
    assert.equal(classifyDbError({ message: 'timeout exceeded when trying to connect' }), 'db_unavailable');
    assert.equal(classifyDbError({ code: '57P01' }), 'db_unavailable');
    assert.equal(classifyDbError({ code: '57014' }), 'db_timeout');
    assert.equal(classifyDbError({ code: '23505' }), 'db_constraint');
    assert.equal(classifyDbError({ code: '42703' }), 'db_query');
    assert.equal(classifyDbError(new TypeError('x')), null);
  });

  it('never copies a pg error\'s detail, parameters or query into the log', () => {
    const err = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505', detail: 'Key (email)=(leak@example.com) already exists.', parameters: ['leak@example.com'], query: 'INSERT …',
    });
    const fields = errorFields(err, { withStack: true });
    assert.deepEqual(Object.keys(fields).filter((k) => fields[k] !== undefined).sort(), ['dbClass', 'errCode', 'errMessage', 'errName', 'stack']);
    assert.ok(!JSON.stringify(fields).includes('leak@example.com'));
  });

  it('writes errors to stderr and info to stdout, one JSON object per line', () => {
    const out = []; const err = [];
    const log = createLogger({ out: { write: (l) => out.push(l) }, err: { write: (l) => err.push(l) } });
    log.info('a', { count: 1 });
    log.error('b', { reason: 'mail me at x@y.co' });
    assert.equal(JSON.parse(out[0]).event, 'a');
    assert.equal(JSON.parse(err[0]).level, 'error');
    assert.ok(!err[0].includes('x@y.co'));
  });
});

describe('boot-time schema check', () => {
  it('passes on the migrated test database and names the migration that is missing', async () => {
    assert.deepEqual(await leadSchemaModule.missingLeadSchema(pool), []);
    assert.deepEqual(leadSchemaModule.migrationsFor(['column bookings.destination_id', 'column contacts.attribution_channel']), ['0005_lead_attribution']);
    assert.deepEqual(leadSchemaModule.migrationsFor(['table lead_notes', 'column bookings.submission_source']), ['0004_lead_management', '0005_lead_attribution']);
  });
});

describe('retention report', () => {
  it('counts rows by age with SELECT statements only, and returns no row data', async () => {
    const email = `ret@${DOMAIN}`;
    await pool.query(
      `INSERT INTO contacts (name, email, phone, status, priority, source, created_at)
       VALUES ('Retention probe', $1, '+91 90000 00099', 'pending', 'normal', 'Website', NOW() - interval '400 days')`, [email]);
    const statements = [];
    const recording = { query: (text, params) => { statements.push(text); return pool.query(text, params); } };
    const report = await retentionModule.retentionReport(recording);
    assert.ok(statements.every((sql) => /^\s*SELECT\b/i.test(sql)), 'read-only');
    const active = report.find((r) => r.dataset === 'contact leads (active)');
    assert.ok(active.byAge['over 365 days'] >= 1);
    assert.deepEqual(Object.keys(active).sort(), ['byAge', 'dataset', 'oldest', 'total']);
    assert.ok(!JSON.stringify(report).includes(email));
  });
});

describe('request log', () => {
  const app = express();
  const captured = [];
  const log = createLogger({ out: { write: (l) => captured.push(JSON.parse(l)) }, err: { write: (l) => captured.push(JSON.parse(l)) } });
  app.use(createRequestLogger({ log }));
  app.get('/api/things/:id', (req, res) => res.json({ ok: true }));
  app.get('/api/broken', () => { throw new Error('boom'); });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ success: false }));
  let srv;
  let url;
  before(async () => { srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); url = `http://127.0.0.1:${srv.address().port}`; });
  after(() => srv.close());

  it('echoes a well-formed X-Request-Id and replaces a malformed one', async () => {
    assert.equal((await fetch(`${url}/api/things/1`, { headers: { 'X-Request-Id': 'trace-abc-123' } })).headers.get('x-request-id'), 'trace-abc-123');
    const replaced = (await fetch(`${url}/api/things/1`, { headers: { 'X-Request-Id': 'not ok!' } })).headers.get('x-request-id');
    assert.match(replaced, /^[0-9a-f-]{36}$/);
  });

  it('logs the route pattern, never the URL or its query, with outcome levels', async () => {
    captured.length = 0;
    await fetch(`${url}/api/things/42?q=private@example.com`);
    await fetch(`${url}/api/nowhere`);
    await fetch(`${url}/api/broken`);
    await settle();
    const [ok, missing, broken] = captured;
    assert.deepEqual([ok.route, ok.outcome, ok.level], ['/api/things/:id', 'ok', 'info']);
    assert.deepEqual([missing.route, missing.outcome, missing.level], ['unmatched', 'client_error', 'info']);
    assert.deepEqual([broken.status, broken.outcome, broken.level], [500, 'server_error', 'error']);
    assert.ok(!JSON.stringify(captured).includes('private@example.com'));
    assert.ok(typeof ok.ms === 'number' && ok.reqId);
  });
});

describe('catalogue outage responses', () => {
  const serve = async (pool) => {
    const app = express();
    app.use(createRequestLogger({ log: createLogger({ out: { write() {} }, err: { write() {} } }) }));
    app.use('/api', createTravelRouter(pool));
    return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  };

  it('answers an unreachable database with 503, Retry-After and a plain sentence', async () => {
    const down = { query: async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' }); } };
    const srv = await serve(down);
    try {
      for (const p of ['/api/packages', '/api/packages/bali', '/api/destinations', '/api/destinations/kerala']) {
        const res = await fetch(`http://127.0.0.1:${srv.address().port}${p}`);
        const body = await res.json();
        assert.equal(res.status, 503, p);
        assert.equal(res.headers.get('retry-after'), '30');
        assert.equal(body.code, 'SERVICE_UNAVAILABLE');
        assert.match(body.error, /temporarily unavailable/);
        assert.doesNotMatch(JSON.stringify(body), /ECONN|postgres|database|5432/i);
      }
    } finally { srv.close(); }
  });

  it('answers a query bug with 500 and no database detail', async () => {
    const broken = { query: async () => { throw Object.assign(new Error('column "nope" does not exist'), { code: '42703' }); } };
    const srv = await serve(broken);
    try {
      const res = await fetch(`http://127.0.0.1:${srv.address().port}/api/packages`);
      assert.equal(res.status, 500);
      assert.doesNotMatch(JSON.stringify(await res.json()), /column|nope|42703/);
    } finally { srv.close(); }
  });
});

describe('the real server never logs secrets or form values', () => {
  it('keeps passwords, tokens, cookies, form fields and search text out of the log', async () => {
    const secrets = {
      name: `Zed Obscure ${RUN}`, email: `zed.${RUN}@${DOMAIN}`, phone: '+91 98111 22333', message: `private note ${RUN}`,
      password: `Sup3r-Secret-${RUN}`, search: `searchterm${RUN}`, cookie: `refresh-${RUN}`, bearer: `eyJabc${RUN}.eyJdef.sig${RUN}`,
    };
    const contact = await fetch(`${base}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.7' },
      body: JSON.stringify({ name: secrets.name, email: secrets.email, phone: secrets.phone, message: secrets.message,
        attribution: { utmSource: 'newsletter', utmMedium: 'email' }, submissionSource: 'contact_page' }),
    });
    assert.equal(contact.status, 201);
    await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.8' },
      body: JSON.stringify({ username: `nobody-${RUN}`, password: secrets.password }),
    });
    await fetch(`${base}/api/packages?q=${secrets.search}`);
    await fetch(`${base}/api/admin/leads`, { headers: { Cookie: `zurii_refresh=${secrets.cookie}`, Authorization: `Bearer ${secrets.bearer}` } });
    await settle();
    for (const [what, value] of Object.entries(secrets)) assert.ok(!output.includes(value), `${what} leaked into the log`);
    const routes = lines().filter((l) => l.event === 'request').map((l) => `${l.method} ${l.route} ${l.status} ${l.outcome}`);
    assert.ok(routes.includes('POST /api/contact 201 ok'), routes.join('\n'));
    assert.ok(routes.some((r) => /^GET \/api\/admin\/leads\S* 401 client_error$/.test(r)), routes.join('\n'));
  });

  it('catalogue responses are identical with or without admin credentials, and carry no lead data', async () => {
    const jwt = (await import('jsonwebtoken')).default;
    const token = jwt.sign({ id: 1, username: 'nobody', tokenVersion: 0, mustChangePassword: false }, process.env.JWT_SECRET, { expiresIn: '5m' });
    for (const url of ['/api/packages?limit=3', '/api/destinations', '/api/destinations/kerala']) {
      const anonymous = await fetch(`${base}${url}`);
      const asAdmin = await fetch(`${base}${url}`, { headers: { Authorization: `Bearer ${token}`, Cookie: 'zurii_refresh=anything' } });
      const [a, b] = [await anonymous.text(), await asAdmin.text()];
      assert.equal(a, b, `${url} must not vary by who asks`);
      assert.equal(asAdmin.headers.get('cache-control'), 'public, max-age=60, stale-while-revalidate=300');
      assert.doesNotMatch(a, /"(email|phone|visitorId|sessionId|status":"(DRAFT|ARCHIVED)|deleted_?at|admin)/i, url);
    }
  });

  it('does not log successful health checks', async () => {
    const before = lines().filter((l) => l.event === 'request' && l.route === '/api/health').length;
    await fetch(`${base}/api/health`);
    await settle();
    assert.equal(lines().filter((l) => l.event === 'request' && l.route === '/api/health').length, before);
  });

  it('logs every rate-limit refusal as a structured event, without the client address', async () => {
    let refused;
    for (let i = 0; i < 40 && !refused; i += 1) {
      const res = await fetch(`${base}/api/contact`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.99' }, body: '{}',
      });
      if (res.status === 429) refused = res;
    }
    assert.ok(refused, 'the lead limiter refused the burst');
    await settle();
    const event = lines().find((l) => l.event === 'rate_limited' && l.limiter === 'lead');
    assert.ok(event, 'rate_limited event written');
    assert.equal(event.route, '/api/contact');
    assert.ok(event.count >= 1);
    assert.ok(!output.includes('203.0.113.99'), 'no client address in the log');
  });
});

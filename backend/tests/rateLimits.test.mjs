/**
 * Phase 3 (ZT-04, ZT-07, ZT-08, ZT-09): sign-in and lead limiters, client keys
 * behind a trusted proxy, the bcrypt work gate, and requireAuth's answer to a
 * database outage. No database: limiters run against a tiny Express app whose
 * handler stands in for the login route, and requireAuth gets a pool that
 * always fails.
 */
import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';

import security from '../middleware/security.js';
import workGateModule from '../lib/workGate.js';

const {
  LOGIN_POLICY,
  LEAD_POLICY,
  clientKey,
  createLoginClientLimiter,
  createLoginAccountLimiter,
  createLeadLimiter,
} = security;
const { createWorkGate, WorkGateBusyError, LOGIN_WORK_GATE } = workGateModule;

const servers = [];
after(() => servers.forEach((s) => s.close()));

/** An app shaped like the login route: one trusted proxy hop, fresh limiters. */
async function loginApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', createLoginClientLimiter(), createLoginAccountLimiter(), (req, res) =>
    req.body.password === 'right' ? res.json({ success: true }) : res.status(401).json({ success: false })
  );
  return listen(app);
}

async function listen(app) {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}

const attempt = (base, { ip, username = 'alice', password = 'wrong', xff } = {}) =>
  fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff ?? ip },
    body: JSON.stringify({ username, password }),
  });

describe('sign-in limits (ZT-08 / ZT-09)', () => {
  it('keeps one client\'s budget per username below the account lock threshold', () => {
    assert.ok(
      LOGIN_POLICY.perAccountPerClient < LOGIN_POLICY.lockThreshold,
      'a single client must not be able to lock an account on its own'
    );
    assert.ok(LOGIN_POLICY.perClient > LOGIN_POLICY.perAccountPerClient);
  });

  it('answers 429 after the per-account budget, with one consistent shape', async () => {
    const base = await loginApp();
    for (let i = 0; i < LOGIN_POLICY.perAccountPerClient; i += 1) {
      assert.equal((await attempt(base, { ip: '198.51.100.1' })).status, 401);
    }
    const blocked = await attempt(base, { ip: '198.51.100.1' });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.deepEqual(Object.keys(body).sort(), ['code', 'error', 'success']);
    assert.equal(body.success, false);
    assert.equal(body.code, 'RATE_LIMITED');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0, 'Retry-After must be set');
    assert.ok(blocked.headers.get('ratelimit'), 'RateLimit header must be set');

    // Another network is unaffected, so the account itself stays reachable.
    assert.equal((await attempt(base, { ip: '198.51.100.2' })).status, 401);
  });

  it('caps one client rotating through usernames', async () => {
    const base = await loginApp();
    for (let i = 0; i < LOGIN_POLICY.perClient; i += 1) {
      assert.equal((await attempt(base, { ip: '198.51.100.3', username: `user-${i}` })).status, 401);
    }
    assert.equal((await attempt(base, { ip: '198.51.100.3', username: 'one-more' })).status, 429);
    assert.equal((await attempt(base, { ip: '198.51.100.4', username: 'one-more' })).status, 401);
  });

  it('does not count successful sign-ins', async () => {
    const base = await loginApp();
    const ip = '198.51.100.5';
    for (let i = 0; i < LOGIN_POLICY.perAccountPerClient - 1; i += 1) await attempt(base, { ip });
    assert.equal((await attempt(base, { ip, password: 'right' })).status, 200);
    assert.equal((await attempt(base, { ip })).status, 401, 'the success must not have used up the budget');
    assert.equal((await attempt(base, { ip })).status, 429);
  });

  it('ignores X-Forwarded-For entries added before the trusted proxy', async () => {
    const base = await loginApp();
    for (let i = 0; i < LOGIN_POLICY.perAccountPerClient; i += 1) {
      const res = await attempt(base, { xff: `10.9.${i}.1, 198.51.100.6` });
      assert.equal(res.status, 401);
    }
    const spoofed = await attempt(base, { xff: '10.99.99.99, 198.51.100.6' });
    assert.equal(spoofed.status, 429, 'a forged leading entry must not open a new bucket');
  });
});

describe('client keys', () => {
  it('keeps IPv4 addresses distinct', () => {
    assert.notEqual(clientKey({ ip: '203.0.113.1' }), clientKey({ ip: '203.0.113.2' }));
  });

  it('groups an IPv6 client by its /56 prefix', () => {
    assert.equal(clientKey({ ip: '2001:db8:1:1::1' }), clientKey({ ip: '2001:db8:1:2::ffff' }));
    assert.notEqual(clientKey({ ip: '2001:db8:1:1::1' }), clientKey({ ip: '2001:db8:1:100::1' }));
  });

  it('never throws on a missing address', () => {
    assert.equal(clientKey({}), 'unknown');
  });
});

describe('lead limiter', () => {
  it('allows a full advertising-sized budget per client, then points to WhatsApp', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.post('/lead', createLeadLimiter(), (req, res) => res.status(201).json({ success: true }));
    const base = await listen(app);
    const post = (ip) => fetch(`${base}/lead`, { method: 'POST', headers: { 'X-Forwarded-For': ip } });

    for (let i = 0; i < LEAD_POLICY.perClient; i += 1) assert.equal((await post('203.0.113.10')).status, 201);
    const blocked = await post('203.0.113.10');
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /WhatsApp/);
    assert.equal((await post('203.0.113.11')).status, 201, 'other visitors keep their own bucket');
  });
});

describe('sign-in work gate', () => {
  it('runs at most `concurrency` tasks and refuses beyond the queue', async () => {
    const gate = createWorkGate({ concurrency: 2, maxQueue: 1 });
    const releases = [];
    const task = () => new Promise((resolve) => releases.push(resolve));
    const running = [gate.run(task), gate.run(task), gate.run(task)];
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(gate.stats(), { active: 2, queued: 1 });
    await assert.rejects(gate.run(task), WorkGateBusyError);

    while (releases.length) {
      releases.shift()();
      await new Promise((r) => setImmediate(r));
    }
    await Promise.all(running);
    assert.deepEqual(gate.stats(), { active: 0, queued: 0 });
  });

  it('is configured small enough to protect a half-CPU instance', () => {
    assert.ok(LOGIN_WORK_GATE.concurrency <= 4);
    assert.ok(LOGIN_WORK_GATE.maxQueue >= LOGIN_WORK_GATE.concurrency);
  });
});

describe('requireAuth during a database outage (ZT-07)', () => {
  let createRequireAuth;
  before(async () => {
    // Imported after the runner has set JWT_SECRET (auth.js reads it at load).
    ({ createRequireAuth } = (await import('../middleware/auth.js')).default);
  });

  it('answers 503, not 401, so the client keeps a valid session', async () => {
    const failingPool = { query: async () => { throw new Error('connect ECONNREFUSED'); } };
    const app = express();
    app.get('/protected', createRequireAuth(failingPool), (req, res) => res.json({ success: true }));
    const base = await listen(app);

    const token = jwt.sign({ id: 1, username: 'x', tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const down = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(down.status, 503);
    assert.equal((await down.json()).code, 'SERVICE_UNAVAILABLE');
    assert.ok(down.headers.get('retry-after'));

    const forged = await fetch(`${base}/protected`, { headers: { Authorization: 'Bearer not-a-token' } });
    assert.equal(forged.status, 401, 'a bad token is still a credential failure');
  });
});

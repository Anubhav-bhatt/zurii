/**
 * Phase 5 — public catalogue API: search, pagination, sorting, batch lookup,
 * caching headers, unknown routes, analytics back-pressure and pool timeouts.
 *
 * Reads the catalogue the test runner seeds into zurii_test (36 destinations,
 * 68 published packages). Writes nothing.
 */
// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import express from 'express';

import poolModule from '../db/pool.js';
import createTravelRouter from '../routes/travel.js';
import createAnalyticsRouter from '../routes/analytics.js';

const { getPool } = poolModule;
const pool = getPool();
let base;
let server;
let serverBase;
let child;
let published;

before(async () => {
  await assertTestDatabase(pool);
  published = (await pool.query(`SELECT COUNT(*)::int AS n FROM packages WHERE status = 'PUBLISHED'`)).rows[0].n;

  const app = express();
  app.use('/api', createTravelRouter(pool));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}/api`;

  const port = 6900 + Math.floor(Math.random() * 300);
  serverBase = `http://127.0.0.1:${port}`;
  child = spawn('node', ['server.js'], { cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${serverBase}/api/health`)).status) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
});

after(async () => {
  child?.kill('SIGTERM');
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const get = async (query) => {
  const res = await fetch(`${base}/packages${query ? `?${query}` : ''}`);
  return { status: res.status, body: await res.json(), headers: res.headers };
};
const slugsOf = (r) => r.body.data.map((p) => p.slug);

describe('package search', () => {
  it('ignores case, spacing and punctuation', async () => {
    const plain = await get('q=kerala');
    assert.ok(plain.body.meta.total > 0);
    for (const variant of ['q=%20%20KERALA%20', 'q=Kerala!', "q=kerala's"]) {
      assert.deepEqual(slugsOf(await get(variant)), slugsOf(plain), variant);
    }
  });

  it('treats LIKE wildcards literally — a bare % or _ no longer matches everything', async () => {
    for (const q of ['%25', '_', '%25%25', 'a']) {
      const r = await get(`q=${q}`);
      assert.equal(r.status, 200, q);
      assert.equal(r.body.meta.total, 0, q);
    }
  });

  it('requires every word, in any order', async () => {
    const both = await get('q=kashmir%20family');
    const reversed = await get('q=family%20kashmir');
    assert.ok(both.body.meta.total > 0);
    assert.deepEqual(slugsOf(reversed), slugsOf(both));
    for (const p of both.body.data) {
      const text = JSON.stringify(p).toLowerCase();
      assert.ok(text.includes('kashmir') || p.destination?.slug === 'kashmir', p.slug);
    }
    assert.ok((await get('q=kashmir')).body.meta.total >= both.body.meta.total);
  });

  it('ranks title and destination matches first', async () => {
    const r = await get('q=bali');
    const first = r.body.data[0];
    assert.ok(/bali/i.test(first.title) || /bali/i.test(first.destination?.name ?? ''), first.title);
  });

  it('answers an unknown place with zero results, not an error', async () => {
    for (const q of ['q=atlantis', 'destination=atlantis', `q=${'x'.repeat(5000)}`]) {
      const r = await get(q);
      assert.equal(r.status, 200, q.slice(0, 20));
      assert.equal(r.body.meta.total, 0, q.slice(0, 20));
      assert.deepEqual(r.body.data, []);
    }
  });
});

describe('pagination, totals and sorting', () => {
  it('pages through the whole catalogue with exact totals and no overlap', async () => {
    const seen = [];
    for (let offset = 0; offset < published; offset += 24) {
      const r = await get(`limit=24&offset=${offset}`);
      assert.equal(r.body.meta.total, published);
      assert.equal(r.body.data.length, Math.min(24, published - offset));
      seen.push(...slugsOf(r));
    }
    assert.equal(new Set(seen).size, published);
  });

  it('reports the true total on a page past the end, and clamps bad offsets', async () => {
    const past = await get('limit=24&offset=1000');
    assert.deepEqual(past.body.data, []);
    assert.equal(past.body.meta.total, published);
    const negative = await get('limit=5&offset=-10');
    assert.equal(negative.body.meta.offset, 0);
    assert.equal((await get('limit=5000')).body.data.length, Math.min(100, published));
  });

  it('counts a filtered set exactly', async () => {
    const r = await get('destination=kerala&limit=1');
    const expected = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM packages p JOIN destinations d ON d.id = p.destination_id WHERE p.status = 'PUBLISHED' AND d.slug = 'kerala'`
    )).rows[0].n;
    assert.equal(r.body.meta.total, expected);
  });

  it('sorts by price and duration across pages', async () => {
    const prices = [];
    for (let offset = 0; offset < published; offset += 30) prices.push(...(await get(`sort=price_asc&limit=30&offset=${offset}`)).body.data.map((p) => p.price));
    const numeric = prices.filter((x) => x !== null);
    assert.deepEqual(numeric, [...numeric].sort((a, b) => a - b));
    const days = (await get('sort=duration_asc&limit=100')).body.data.map((p) => p.durationDays).filter((x) => x !== null);
    assert.deepEqual(days, [...days].sort((a, b) => a - b));
  });
});

describe('batch lookup (wishlist, recently viewed)', () => {
  it('returns exactly the requested cards, in the requested order, in one request', async () => {
    const all = slugsOf(await get('limit=5'));
    const wanted = [all[3], 'no-such-trip', all[0], 'Bad Slug!', all[2]];
    const r = await get(`slugs=${encodeURIComponent(wanted.join(','))}`);
    assert.deepEqual(slugsOf(r), [all[3], all[0], all[2]]);
    assert.equal(r.body.meta.requested, 4, 'the malformed slug is ignored');
  });

  it('caps the list at 50', async () => {
    const many = Array.from({ length: 80 }, (_, i) => `trip-${i}`).join(',');
    assert.equal((await get(`slugs=${many}`)).body.meta.requested, 50);
  });
});

describe('HTTP caching and unknown routes (through the real server)', () => {
  const head = async (url, init) => (await fetch(`${serverBase}${url}`, init)).headers.get('cache-control');

  it('lets browsers reuse public catalogue data briefly', async () => {
    for (const url of ['/api/packages?limit=1', '/api/destinations', '/api/destinations/kerala', `/api/packages/${(await get('limit=1')).body.data[0].slug}`]) {
      assert.equal(await head(url), 'public, max-age=60, stale-while-revalidate=300', url);
    }
  });

  it('never lets anything personal or authenticated be stored', async () => {
    for (const [url, init] of [
      ['/api/admin/leads', {}],
      ['/api/contact', {}],
      ['/api/auth/refresh', { method: 'POST' }],
      ['/api/packages/no-such-trip', {}],
      ['/api/health', {}],
    ]) {
      assert.equal(await head(url, init), 'no-store', url);
    }
  });

  it('does not mark fire-and-forget POST responses no-store (browsers would hold them open)', async () => {
    const res = await fetch(`${serverBase}/api/analytics/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'abcdefgh12345678', type: 'package_view', entitySlug: 'bali' }),
    });
    assert.equal(res.status, 202);
    assert.equal(res.headers.get('cache-control'), null);
  });

  it('answers unknown API routes with JSON, not an HTML page', async () => {
    const res = await fetch(`${serverBase}/api/no-such-route`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal((await res.json()).code, 'NOT_FOUND');
  });
});

describe('leads come before analytics', () => {
  it('drops analytics events beyond the concurrency cap instead of queueing for the pool', async () => {
    let release;
    const held = new Promise((r) => { release = r; });
    const slowPool = { query: () => held };
    const app = express();
    app.use(express.json());
    app.use('/api', createAnalyticsRouter(slowPool, { gate: { concurrency: 1, maxQueue: 0 }, rateLimit: 1000 }));
    const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const url = `http://127.0.0.1:${srv.address().port}/api/events`;
      const event = { visitorId: 'abcdefgh12345678', type: 'package_view', entitySlug: 'bali' };
      const post = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
      const first = post();
      await new Promise((r) => setTimeout(r, 50));
      const second = await post();
      assert.equal(second.status, 503);
      assert.equal((await second.json()).code, 'ANALYTICS_BUSY');
      release({ rows: [] });
      assert.equal((await first).status, 202);
    } finally {
      srv.close();
    }
  });

  it('bounds every application query and idle transaction', async () => {
    const { rows } = await pool.query('SHOW statement_timeout');
    assert.equal(rows[0].statement_timeout, '15s');
    const idle = await pool.query('SHOW idle_in_transaction_session_timeout');
    assert.equal(idle.rows[0].idle_in_transaction_session_timeout, '30s');
  });
});

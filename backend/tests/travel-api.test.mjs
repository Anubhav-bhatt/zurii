/**
 * Integration tests for the public travel API.
 *
 *   npm test          (from backend/)
 *
 * These run against the real database, because the value being tested is that
 * the migrated rows are queryable and correctly shaped. They only read — no
 * test writes to any table.
 *
 * The travel router is mounted on a throwaway Express app on an ephemeral port
 * rather than booting server.js, so the tests do not depend on auth setup or a
 * fixed port being free.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import poolModule from '../db/pool.js';
import createTravelRouter from '../routes/travel.js';

const { getPool } = poolModule;

let server;
let baseUrl;
let pool;

before(async () => {
  pool = getPool();
  const app = express();
  app.use('/api', createTravelRouter(pool));

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const get = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
};

// ── Destinations ───────────────────────────────────────────────────

test('GET /api/destinations returns 200 with the migrated destinations', async () => {
  const { status, body } = await get('/api/destinations');

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.data.length > 0, 'expected destinations to exist');

  const kerala = body.data.find((d) => d.slug === 'kerala');
  assert.ok(kerala, 'expected the kerala destination');
  assert.equal(kerala.name, 'Kerala');
  assert.equal(kerala.country, 'India');
  assert.equal(kerala.kind, 'domestic');
  assert.equal(typeof kerala.packageCount, 'number');
});

test('GET /api/destinations filters by kind', async () => {
  const { body } = await get('/api/destinations?kind=international');

  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((d) => d.kind === 'international'));
});

test('GET /api/destinations/:slug returns the destination with its packages', async () => {
  const { status, body } = await get('/api/destinations/bali');

  assert.equal(status, 200);
  assert.equal(body.data.slug, 'bali');
  assert.equal(body.data.region, 'South East Asia');
  assert.ok(Array.isArray(body.data.packages));
  assert.ok(body.data.packages.length > 0, 'bali should have trips');
  assert.ok(body.data.packages.every((p) => p.destination?.slug === 'bali'));
});

test('GET /api/destinations/:slug returns 404 for an unknown slug', async () => {
  const { status, body } = await get('/api/destinations/not-a-real-place');

  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error, 'Destination not found');
});

// ── Packages ───────────────────────────────────────────────────────

test('GET /api/packages returns published packages with a total', async () => {
  const { status, body } = await get('/api/packages');

  assert.equal(status, 200);
  assert.ok(body.data.length > 0);
  assert.equal(typeof body.meta.total, 'number');
  assert.ok(body.data.every((p) => p.status === 'PUBLISHED'));
});

test('GET /api/packages/:slug returns the full package with its destination', async () => {
  const { status, body } = await get('/api/packages/bali');
  const pkg = body.data;

  assert.equal(status, 200);
  assert.equal(pkg.slug, 'bali');
  assert.equal(typeof pkg.price, 'number', 'price must be numeric, not a formatted string');
  assert.equal(pkg.currency, 'INR');
  assert.equal(pkg.durationDays, 7);
  assert.equal(pkg.durationNights, 6);
  assert.equal(pkg.destination.name, 'Bali');
});

test('GET /api/packages/:slug preserves the migrated JSONB content', async () => {
  const { body } = await get('/api/packages/bali');
  const pkg = body.data;

  assert.ok(Array.isArray(pkg.itinerary));
  assert.equal(pkg.itinerary.length, 7, 'the 7-day itinerary should survive migration');
  for (const day of pkg.itinerary) {
    assert.ok(day.day, 'each itinerary entry keeps its day number');
    assert.ok(day.title, 'each itinerary entry keeps its title');
    assert.ok(day.description, 'each itinerary entry keeps its description');
  }

  assert.ok(pkg.inclusions.length > 0);
  assert.ok(pkg.exclusions.length > 0);
  assert.ok(pkg.gallery.length > 0);
  assert.ok(pkg.gallery.every((url) => /^https?:\/\//.test(url)), 'gallery holds usable URLs');
});

test('GET /api/packages/:slug returns 404 for an unknown slug', async () => {
  const { status, body } = await get('/api/packages/no-such-trip');

  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error, 'Package not found');
});

// ── Filters ────────────────────────────────────────────────────────

test('featured and popular filters narrow the result set', async () => {
  const all = await get('/api/packages');
  const featured = await get('/api/packages?featured=true');
  const popular = await get('/api/packages?popular=true');

  assert.ok(featured.body.data.every((p) => p.featured === true));
  assert.ok(popular.body.data.every((p) => p.popular === true));
  assert.ok(featured.body.meta.total < all.body.meta.total);
  assert.ok(popular.body.meta.total < all.body.meta.total);
});

test('destination filter returns only that destination', async () => {
  const { body } = await get('/api/packages?destination=kerala');

  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((p) => p.destination.slug === 'kerala'));
});

test('price filters bound the results', async () => {
  const { body } = await get('/api/packages?minPrice=50000&maxPrice=100000');

  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((p) => p.price >= 50000 && p.price <= 100000));
});

test('duration buckets map to day ranges', async () => {
  const short = await get('/api/packages?duration=1-3');
  const long = await get('/api/packages?duration=7%2B');

  assert.ok(short.body.data.every((p) => p.durationDays >= 1 && p.durationDays <= 3));
  assert.ok(long.body.data.every((p) => p.durationDays >= 7));
});

test('tag filter matches the JSONB tags array', async () => {
  const { body } = await get('/api/packages?tag=beach');

  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((p) => p.tags.includes('beach')));
});

test('text query matches titles and destination names', async () => {
  const { body } = await get('/api/packages?q=kashmir');

  assert.ok(body.data.length > 0);
  assert.ok(
    body.data.every((p) =>
      `${p.title} ${p.subtitle ?? ''} ${p.destination?.name ?? ''}`.toLowerCase().includes('kashmir')
    )
  );
});

// ── Sorting ────────────────────────────────────────────────────────

test('sort=price_asc and price_desc order by price', async () => {
  const asc = await get('/api/packages?sort=price_asc&limit=10');
  const desc = await get('/api/packages?sort=price_desc&limit=10');

  const ascPrices = asc.body.data.map((p) => p.price);
  const descPrices = desc.body.data.map((p) => p.price);

  assert.deepEqual(ascPrices, [...ascPrices].sort((a, b) => a - b));
  assert.deepEqual(descPrices, [...descPrices].sort((a, b) => b - a));
});

test('sort=duration_asc orders by duration', async () => {
  const { body } = await get('/api/packages?sort=duration_asc&limit=10');
  const days = body.data.map((p) => p.durationDays);

  assert.deepEqual(days, [...days].sort((a, b) => a - b));
});

// ── Hostile input ──────────────────────────────────────────────────

test('invalid query parameters are ignored rather than failing', async () => {
  const baseline = await get('/api/packages');

  for (const query of [
    '?minPrice=abc',
    '?maxPrice=%27%3B--',
    '?duration=random',
    '?sort=nonsense',
    '?limit=-5',
    '?offset=abc',
    '?tag=',
  ]) {
    const { status, body } = await get(`/api/packages${query}`);
    assert.equal(status, 200, `${query} should not error`);
    assert.equal(body.success, true);
    assert.equal(body.meta.total, baseline.body.meta.total, `${query} should not change the result set`);
  }
});

test('a SQL injection attempt in a slug is treated as data', async () => {
  const { status, body } = await get(`/api/packages/${encodeURIComponent("bali' OR 1=1--")}`);

  assert.equal(status, 404, 'the string is matched as a slug, not executed');
  assert.equal(body.success, false);

  // The table is still there afterwards.
  const after = await get('/api/packages');
  assert.ok(after.body.meta.total > 0);
});

test('limit is capped and offset paginates', async () => {
  const capped = await get('/api/packages?limit=500');
  assert.ok(capped.body.data.length <= 100, 'limit must be clamped to the maximum');

  const first = await get('/api/packages?limit=2&sort=price_asc');
  const second = await get('/api/packages?limit=2&offset=2&sort=price_asc');

  const firstSlugs = first.body.data.map((p) => p.slug);
  const secondSlugs = second.body.data.map((p) => p.slug);
  assert.equal(firstSlugs.filter((slug) => secondSlugs.includes(slug)).length, 0, 'pages must not overlap');
});

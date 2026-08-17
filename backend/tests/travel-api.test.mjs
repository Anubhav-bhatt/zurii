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

// ── the list/detail projection boundary ─────────────────────────────
//
// GET /packages selects card columns; GET /packages/:slug selects everything.
// Both sides are asserted here because both are silently breakable and the
// failure modes are opposite:
//
//   - Widening the list back to `p.*` costs nothing visible and restores ~136 kB
//     to a response measured at 185,974 bytes before the split. Nothing would go
//     wrong, so nothing would be noticed.
//   - Narrowing it further to save more bytes would take `metadata` or
//     `short_description` with it, and silently blank every card's badge or
//     tagline — a visual regression with no error anywhere.
//
// The heavy fields are asserted EMPTY rather than absent: serializePackage maps
// an unselected column through `?? []`, so the property still exists. That is
// deliberate — frontend services/adapters.js defaults them the same way, so a
// card never has to care which endpoint it came from.
test('GET /api/packages returns the card contract, without the detail payload', async () => {
  const { status, body } = await get('/api/packages?limit=3');
  assert.equal(status, 200);
  assert.ok(body.data.length > 0, 'the catalogue must return rows to assert against');

  for (const pkg of body.data) {
    // What a card renders. Losing any of these is a visible regression.
    for (const field of ['id', 'slug', 'title', 'coverImage', 'price', 'currency', 'tags']) {
      assert.ok(field in pkg, `list rows must carry ${field}`);
    }
    assert.equal(typeof pkg.price, 'number', 'price stays numeric for client-side sorting');
    // Derived from `metadata`, which is why that column stays in the projection.
    for (const field of ['badge', 'savings', 'locationLabel']) {
      assert.ok(field in pkg, `list rows must carry ${field} (read from metadata)`);
    }
    // The card tagline — TrendingTrips renders it on the homepage.
    assert.ok('shortDescription' in pkg, 'list rows must carry the card tagline');

    // The detail-only payload must not ride along.
    assert.equal(pkg.description, undefined, 'the long description belongs to the detail view');
    for (const field of ['itinerary', 'inclusions', 'exclusions', 'batches', 'gallery']) {
      assert.deepEqual(pkg[field], [], `${field} must not be sent to a list view`);
    }
  }
});

test('GET /api/packages/:slug still carries what the list omits', async () => {
  const list = await get('/api/packages?limit=1');
  const slug = list.body.data[0].slug;
  const { body } = await get(`/api/packages/${encodeURIComponent(slug)}`);
  const pkg = body.data;

  // The same record, fetched the other way, is complete — this is the contrast
  // that makes the narrow list safe rather than lossy.
  assert.ok(pkg.description === null || typeof pkg.description === 'string',
    'the detail view selects the description column');
  for (const field of ['itinerary', 'inclusions', 'exclusions', 'batches', 'gallery', 'highlights']) {
    assert.ok(Array.isArray(pkg[field]), `the detail view must carry ${field}`);
  }
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

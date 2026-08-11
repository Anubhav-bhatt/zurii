/**
 * Integration tests for the anonymous analytics API and lead attribution.
 *
 *   npm test          (from backend/)
 *
 * These run against the real database, because the value being tested is that
 * an event actually lands in PostgreSQL, that a lead stores its attribution
 * ids, and that the journey query stitches the two together — a mocked pool
 * would prove none of that.
 *
 * These tests WRITE. The database is shared, so every row created here carries
 * a marker — visitor ids start with a unique per-run prefix, and booking
 * emails use the `@analytics-test.invalid` domain — and after() deletes by
 * those markers, then asserts none remain. Marker-scoped counting (rather than
 * whole-table counts) keeps this file honest even while other test files write
 * to the same tables in parallel.
 *
 * The routers are mounted on a throwaway Express app on an ephemeral port
 * rather than booting server.js, so the tests do not depend on a fixed port
 * being free. The JSON body limit and the parse-failure handler match
 * server.js. Admin requests sign a real JWT with the same secret requireAuth
 * verifies, so the auth path under test is the production one.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';

import poolModule from '../db/pool.js';
import jwt from 'jsonwebtoken';
import createAnalyticsRouter from '../routes/analytics.js';
import createAdminAnalyticsRouter from '../routes/adminAnalytics.js';
import createBookingsRouter from '../routes/bookings.js';

const { getPool } = poolModule;

/** Unique per run, so parallel runs and leftover rows can never collide. */
const RUN = crypto.randomBytes(4).toString('hex');
const VISITOR_PREFIX = `zztest${RUN}`;
const visitor = (suffix) => `${VISITOR_PREFIX}-${suffix}`;

const TEST_EMAIL_DOMAIN = 'analytics-test.invalid';

let server;
let baseUrl;
let pool;
let authHeader;
let samplePackage; // a real PUBLISHED package for the attribution bookings
let testAdmin; // throwaway admin row backing authHeader; removed in after()

const createdBookingIds = [];

before(async () => {
  pool = getPool();

  assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be set (backend/.env) to test admin routes');

  // A real admin row, not a synthetic id.
  //
  // requireAuth used to check only the signature, so `{ id: 0 }` was enough.
  // It now also compares the token's `tokenVersion` against `admins.token_version`
  // so that logout and password changes can revoke sessions — which means a
  // token must name an admin that actually exists. This creates a throwaway one
  // (removed in after()) and signs against its real id and version.
  const passwordHash = `$2b$12$${crypto.randomBytes(16).toString('hex').slice(0, 53)}`;
  const admin = await pool.query(
    `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
     RETURNING id, username, token_version`,
    [`zzanalytics-${RUN}`, passwordHash]
  );
  testAdmin = admin.rows[0];
  authHeader = {
    Authorization: `Bearer ${jwt.sign(
      { id: testAdmin.id, username: testAdmin.username, tokenVersion: testAdmin.token_version },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    )}`,
  };

  const { rows } = await pool.query(
    `SELECT id, slug FROM packages WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1`
  );
  assert.ok(rows.length > 0, 'expected at least one published package');
  samplePackage = rows[0];

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/analytics', createAnalyticsRouter(pool));
  // A second router instance with a tiny injected limit, so the 429 test does
  // not have to send 120 requests (and does not exhaust the main bucket).
  app.use('/api/limited/analytics', createAnalyticsRouter(pool, { rateLimit: 2 }));
  app.use('/api', createBookingsRouter(pool));
  app.use('/api/admin', createAdminAnalyticsRouter(pool));
  // Same parse-failure handling as server.js, so malformed JSON is a clean 400.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'That request body is not valid JSON.' });
    }
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  });

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // Sweep by marker, then prove nothing this file created survives.
  await pool.query('DELETE FROM analytics_events WHERE visitor_id LIKE $1', [`${VISITOR_PREFIX}%`]);
  if (createdBookingIds.length > 0) {
    await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [createdBookingIds]);
  }
  await pool.query('DELETE FROM bookings WHERE email LIKE $1', [`%@${TEST_EMAIL_DOMAIN}`]);

  const events = await pool.query(
    'SELECT COUNT(*)::int AS n FROM analytics_events WHERE visitor_id LIKE $1',
    [`${VISITOR_PREFIX}%`]
  );
  const bookings = await pool.query('SELECT COUNT(*)::int AS n FROM bookings WHERE email LIKE $1', [
    `%@${TEST_EMAIL_DOMAIN}`,
  ]);
  assert.equal(events.rows[0].n, 0, 'tests must leave no analytics rows behind');
  assert.equal(bookings.rows[0].n, 0, 'tests must leave no booking rows behind');

  // The throwaway admin backing authHeader, plus any audit rows the rejected
  // token attempts recorded against it.
  if (testAdmin) {
    await pool.query('DELETE FROM admin_audit_logs WHERE admin_id = $1', [testAdmin.id]);
    await pool.query('DELETE FROM admins WHERE id = $1', [testAdmin.id]);
    const leftover = await pool.query('SELECT COUNT(*)::int AS n FROM admins WHERE id = $1', [testAdmin.id]);
    assert.equal(leftover.rows[0].n, 0, 'tests must leave no admin rows behind');
  }

  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

const postJson = async (path, payload, headers = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
};

const getJson = async (path, headers = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  return { status: response.status, body: await response.json() };
};

const validEvent = (overrides = {}) => ({
  visitorId: visitor('generic'),
  sessionId: visitor('session'),
  type: 'package_view',
  entityType: 'package',
  entitySlug: 'bali',
  path: '/packages/bali',
  ...overrides,
});

let emailSeq = 0;
const testEmail = () => `attr${(emailSeq += 1)}@${TEST_EMAIL_DOMAIN}`;

const validBooking = (overrides = {}) => ({
  name: 'Asha Menon',
  email: testEmail(),
  phone: '+91 98765 43210',
  packageSlug: samplePackage.slug,
  ...overrides,
});

const postBooking = async (payload) => {
  const result = await postJson('/api/bookings', payload);
  if (result.body?.data?.id) createdBookingIds.push(result.body.data.id);
  return result;
};

// ── POST /api/analytics/events ─────────────────────────────────────

test('a valid event returns 202 and lands in analytics_events', async () => {
  const visitorId = visitor('lands');
  const { status, body } = await postJson('/api/analytics/events', validEvent({
    visitorId,
    referrer: 'https://www.google.com/',
    utm: { utm_source: 'google', utm_medium: 'cpc' },
    meta: { position: 3 },
  }));

  assert.equal(status, 202);
  assert.deepEqual(body, { success: true }, 'the client needs nothing but the acknowledgement');

  const { rows } = await pool.query(
    `SELECT visitor_id, session_id, event_type, entity_type, entity_slug,
            page_path, referrer, utm, metadata
       FROM analytics_events WHERE visitor_id = $1`,
    [visitorId]
  );
  assert.equal(rows.length, 1, 'exactly one row was recorded');
  const row = rows[0];
  assert.equal(row.event_type, 'package_view');
  assert.equal(row.entity_type, 'package');
  assert.equal(row.entity_slug, 'bali');
  assert.equal(row.page_path, '/packages/bali');
  assert.equal(row.referrer, 'https://www.google.com/');
  assert.deepEqual(row.utm, { utm_source: 'google', utm_medium: 'cpc' });
  assert.deepEqual(row.metadata, { position: 3 });
});

test('an unknown event type returns 400 and stores nothing', async () => {
  const visitorId = visitor('badtype');
  const { status, body } = await postJson('/api/analytics/events', validEvent({
    visitorId,
    type: 'password_typed',
  }));

  assert.equal(status, 400);
  assert.equal(body.success, false);

  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM analytics_events WHERE visitor_id = $1',
    [visitorId]
  );
  assert.equal(rows[0].n, 0);
});

test('a bad visitor or session id shape returns 400', async () => {
  const cases = [
    validEvent({ visitorId: 'short' }), // under 8 chars
    validEvent({ visitorId: 'not valid because spaces!' }),
    validEvent({ visitorId: 'x'.repeat(65) }), // over 64 chars
    validEvent({ visitorId: null }),
    validEvent({ sessionId: 'nope nope!' }),
  ];

  for (const payload of cases) {
    const { status, body } = await postJson('/api/analytics/events', payload);
    assert.equal(status, 400, `${JSON.stringify(payload.visitorId ?? payload.sessionId)} should be rejected`);
    assert.equal(body.success, false);
  }
});

test('meta or utm serialized over 2KB returns 400', async () => {
  const oversizedMeta = await postJson('/api/analytics/events', validEvent({
    meta: { blob: 'x'.repeat(3000) },
  }));
  assert.equal(oversizedMeta.status, 400);
  assert.equal(oversizedMeta.body.success, false);

  const oversizedUtm = await postJson('/api/analytics/events', validEvent({
    utm: { utm_source: 'y'.repeat(3000) },
  }));
  assert.equal(oversizedUtm.status, 400);
});

test('a malformed JSON body is a clean 400, not a crash', async () => {
  const { status, body } = await postJson('/api/analytics/events', '{"visitorId": "broken');

  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('the per-IP rate limit answers 429 once the injected limit is hit', async () => {
  const statuses = [];
  for (let i = 0; i < 3; i += 1) {
    const { status } = await postJson(
      '/api/limited/analytics/events',
      validEvent({ visitorId: visitor('ratelimit') })
    );
    statuses.push(status);
  }

  assert.deepEqual(statuses, [202, 202, 429], 'the third request crosses the limit of 2');
});

// ── Admin endpoints are locked ─────────────────────────────────────

test('every admin analytics endpoint answers 401 without a token', async () => {
  const endpoints = [
    '/api/admin/analytics/overview',
    '/api/admin/analytics/searches',
    '/api/admin/analytics/destinations',
    '/api/admin/analytics/packages',
    '/api/admin/analytics/funnel',
    '/api/admin/bookings',
    '/api/admin/bookings/1',
    '/api/admin/bookings/1/journey',
  ];

  for (const endpoint of endpoints) {
    const { status, body } = await getJson(endpoint);
    assert.equal(status, 401, `${endpoint} must require auth`);
    assert.equal(body.success, false);
    assert.equal(body.data, undefined, 'nothing leaks to an unauthenticated caller');
  }
});

test('the admin analytics dashboards answer 200 with the contracted shapes', async () => {
  const overview = await getJson('/api/admin/analytics/overview?days=7', authHeader);
  assert.equal(overview.status, 200);
  for (const key of [
    'visitors', 'sessions', 'packageViews', 'destinationViews', 'wishlistAdds',
    'whatsappClicks', 'enquiries', 'contacts', 'viewToEnquiryRate',
  ]) {
    assert.equal(typeof overview.body.data[key], 'number', `overview.${key} is a number`);
  }

  const destinations = await getJson('/api/admin/analytics/destinations?days=30', authHeader);
  assert.equal(destinations.status, 200);
  assert.ok(Array.isArray(destinations.body.data));
  assert.ok(destinations.body.data.length <= 20, 'destination list is capped');

  const packages = await getJson('/api/admin/analytics/packages', authHeader);
  assert.equal(packages.status, 200);
  for (const key of ['mostViewed', 'mostWishlisted', 'mostEnquired', 'whatsapp']) {
    assert.ok(Array.isArray(packages.body.data[key]), `packages.${key} is a list`);
    assert.ok(packages.body.data[key].length <= 20, `packages.${key} is capped`);
  }

  const funnel = await getJson('/api/admin/analytics/funnel', authHeader);
  assert.equal(funnel.status, 200);
  assert.deepEqual(
    funnel.body.data.map((stage) => stage.stage),
    ['package_view', 'plan_trip_click', 'enquiry_form_opened', 'enquiry_form_started', 'enquiries']
  );
});

// ── Lead attribution ───────────────────────────────────────────────

test('a booking with a valid visitorId stores the attribution ids', async () => {
  const visitorId = visitor('withlead');
  const sessionId = visitor('withleadsession');
  const { status, body } = await postBooking(validBooking({ visitorId, sessionId }));

  assert.equal(status, 201);

  const { rows } = await pool.query(
    'SELECT visitor_id, session_id FROM bookings WHERE id = $1',
    [body.data.id]
  );
  assert.equal(rows[0].visitor_id, visitorId);
  assert.equal(rows[0].session_id, sessionId);
});

test('a booking with an INVALID visitorId shape still creates the lead, with NULL ids', async () => {
  const { status, body } = await postBooking(
    validBooking({ visitorId: 'not a valid id at all!!', sessionId: 'x' })
  );

  assert.equal(status, 201, 'a malformed analytics id must never fail a lead submission');
  assert.equal(body.success, true);

  const { rows } = await pool.query(
    'SELECT visitor_id, session_id FROM bookings WHERE id = $1',
    [body.data.id]
  );
  assert.equal(rows[0].visitor_id, null);
  assert.equal(rows[0].session_id, null);
});

// ── Journey ────────────────────────────────────────────────────────

test('the journey endpoint returns the pre-lead events for that visitor only', async () => {
  const journeyVisitor = visitor('journey');
  const otherVisitor = visitor('bystander');
  const dest = `zzdest-${RUN}`;
  const pkg1 = `zzpkg-one-${RUN}`;
  const pkg2 = `zzpkg-two-${RUN}`;
  const strayPkg = `zzpkg-stray-${RUN}`;

  const send = (payload) => postJson('/api/analytics/events', payload);

  // The journey, in order.
  const trail = [
    { type: 'destination_view', entityType: 'destination', entitySlug: dest },
    { type: 'package_view', entityType: 'package', entitySlug: pkg1 },
    { type: 'package_view', entityType: 'package', entitySlug: pkg1 },
    { type: 'package_view', entityType: 'package', entitySlug: pkg2 },
    { type: 'search_performed', meta: { query: '  ZZ Journey Query  ', results: 3 } },
    { type: 'wishlist_add', entityType: 'package', entitySlug: pkg1 },
    { type: 'whatsapp_click', entityType: 'package', entitySlug: pkg1 },
  ];
  for (const event of trail) {
    const { status } = await send({ visitorId: journeyVisitor, ...event });
    assert.equal(status, 202);
  }

  // Another visitor's event, which must never appear in this journey.
  await send({
    visitorId: otherVisitor,
    type: 'package_view',
    entityType: 'package',
    entitySlug: strayPkg,
  });

  // Out-of-window events for the SAME visitor: too old, and after the lead.
  await pool.query(
    `INSERT INTO analytics_events (visitor_id, event_type, entity_slug, created_at)
     VALUES ($1, 'package_view', $2, NOW() - interval '8 days'),
            ($1, 'package_view', $2, NOW() + interval '10 minutes')`,
    [journeyVisitor, strayPkg]
  );

  const booking = await postBooking(validBooking({ visitorId: journeyVisitor }));
  assert.equal(booking.status, 201);

  const { status, body } = await getJson(
    `/api/admin/bookings/${booking.body.data.id}/journey`,
    authHeader
  );

  assert.equal(status, 200);
  const { summary, events } = body.data;

  assert.equal(events.length, trail.length, 'exactly the in-window events of this visitor');
  assert.ok(
    events.every((event) => event.entitySlug !== strayPkg),
    'no other visitor and no out-of-window event leaks into the journey'
  );
  assert.deepEqual(
    events.map((event) => event.type),
    trail.map((event) => event.type),
    'events come back in chronological order'
  );

  assert.equal(summary.primaryDestination, dest);
  assert.equal(summary.packagesViewed, 2);
  assert.equal(summary.mostViewedPackage, pkg1);
  assert.deepEqual(summary.wishlisted, [pkg1]);
  assert.deepEqual(summary.searches, ['zz journey query']);
  assert.equal(summary.whatsappClicked, true);

  // The list marks this lead as having a journey to open.
  const list = await getJson('/api/admin/bookings', authHeader);
  assert.equal(list.status, 200);
  const listed = list.body.data.find((row) => row.id === booking.body.data.id);
  assert.ok(listed, 'the new lead is in the admin list');
  assert.equal(listed.hasJourney, true);
  assert.equal(listed.email, undefined, 'the list row carries no personal contact details');
});

test('a lead without attribution has an empty journey, not an error', async () => {
  const booking = await postBooking(validBooking());
  const { status, body } = await getJson(
    `/api/admin/bookings/${booking.body.data.id}/journey`,
    authHeader
  );

  assert.equal(status, 200);
  assert.deepEqual(body.data.events, []);
  assert.equal(body.data.summary.primaryDestination, null);
  assert.equal(body.data.summary.whatsappClicked, false);
});

// ── Search aggregation ─────────────────────────────────────────────

test('zero-result searches surface in /api/admin/analytics/searches', async () => {
  const searchVisitor = visitor('search');
  const zeroQuery = `zzq zero ${RUN}`;
  const hitQuery = `zzq hit ${RUN}`;

  const searches = [
    { query: `  ${zeroQuery.toUpperCase()}  `, results: 0 }, // grouping is lowercased+trimmed
    { query: zeroQuery, results: 0 },
    { query: hitQuery, results: 12 },
  ];
  for (const meta of searches) {
    const { status } = await postJson('/api/analytics/events', {
      visitorId: searchVisitor,
      type: 'search_performed',
      meta,
    });
    assert.equal(status, 202);
  }

  const { status, body } = await getJson('/api/admin/analytics/searches?days=1', authHeader);
  assert.equal(status, 200);

  const zero = body.data.zeroResults.find((row) => row.query === zeroQuery);
  assert.ok(zero, 'the zero-result query is aggregated');
  assert.equal(zero.count, 2, 'case and whitespace variants group as one query');

  const hit = body.data.top.find((row) => row.query === hitQuery);
  assert.ok(hit, 'the successful query ranks in top searches');
  assert.equal(hit.avgResults, 12);
  assert.ok(
    !body.data.zeroResults.some((row) => row.query === hitQuery),
    'a query with results never appears under zeroResults'
  );
});

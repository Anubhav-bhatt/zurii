/**
 * Integration tests for the public enquiry API.
 *
 *   npm test          (from backend/)
 *
 * These run against the real database, because the value being tested is that a
 * submitted enquiry actually lands in PostgreSQL with the right package linked
 * and the right starting status — a mocked pool would prove none of that.
 *
 * Unlike travel-api.test.mjs these tests WRITE. The database is shared, so
 * every row created here is tracked and deleted in after(), which then asserts
 * the table is back to the count it started at. Payloads also share the
 * `@bookings-test.invalid` email domain, so cleanup can sweep by that marker
 * even if a test dies before its id is recorded.
 *
 * The bookings router is mounted on a throwaway Express app on an ephemeral
 * port rather than booting server.js, so the tests do not depend on auth setup
 * or a fixed port being free. The JSON body limit matches server.js.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import poolModule from '../db/pool.js';
import createBookingsRouter from '../routes/bookings.js';

const { getPool } = poolModule;

/** Shared marker so cleanup can find rows this file created. */
const TEST_EMAIL_DOMAIN = 'bookings-test.invalid';
const VALIDATION_ERROR = 'Please check the highlighted fields.';

let server;
let baseUrl;
let pool;
let startingCount;
let samplePackage; // a real PUBLISHED package, read rather than assumed

/** Every id this file inserts, so after() can remove exactly those rows. */
const createdIds = [];

before(async () => {
  pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, slug FROM packages WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1`
  );
  assert.ok(rows.length > 0, 'expected at least one published package to enquire about');
  samplePackage = rows[0];

  const counted = await pool.query('SELECT COUNT(*)::int AS n FROM bookings');
  startingCount = counted.rows[0].n;

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', createBookingsRouter(pool));

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // Remove tracked ids first, then sweep the marker domain as a safety net.
  if (createdIds.length > 0) {
    await pool.query('DELETE FROM bookings WHERE id = ANY($1::int[])', [createdIds]);
  }
  await pool.query('DELETE FROM bookings WHERE email LIKE $1', [`%@${TEST_EMAIL_DOMAIN}`]);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM bookings');
  assert.equal(rows[0].n, startingCount, 'tests must leave the bookings table exactly as they found it');

  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

/** POST an enquiry; any row it creates is recorded for cleanup. */
const post = async (payload) => {
  const response = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (body?.data?.id) createdIds.push(body.data.id);
  return { status: response.status, body };
};

/** Dates are relative to the run: a fixed literal would rot into the past. */
function isoOffsetDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

let emailSeq = 0;
const testEmail = () => `enquiry${(emailSeq += 1)}@${TEST_EMAIL_DOMAIN}`;

const validPayload = (overrides = {}) => ({
  name: 'Asha Menon',
  email: testEmail(),
  phone: '+91 98765 43210',
  ...overrides,
});

/** travel_date is read back as text so a timezone offset cannot shift the day. */
const readBooking = async (id) => {
  const { rows } = await pool.query(
    `SELECT id, package_id, name, email, phone, travellers, departure_city, message,
            status, source, admin_notes,
            to_char(travel_date, 'YYYY-MM-DD') AS travel_date
       FROM bookings WHERE id = $1`,
    [id]
  );
  return rows[0];
};

const countByEmail = async (email) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM bookings WHERE email = $1', [email]);
  return rows[0].n;
};

// ── Successful enquiries ───────────────────────────────────────────

test('POST /api/bookings creates an enquiry for a real package', async () => {
  const { status, body } = await post(
    validPayload({
      packageSlug: samplePackage.slug,
      travelDate: isoOffsetDays(45),
      travellers: 2,
      departureCity: 'Bengaluru',
      message: 'Anniversary trip — please share sea-facing options.',
    })
  );

  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(typeof body.data.id, 'number');
  assert.equal(body.data.status, 'NEW');
  assert.ok(body.data.createdAt, 'the response carries a creation timestamp');
  assert.equal(body.data.name, undefined, 'the response is a receipt, not an echo of the submission');
});

test('the enquiry row lands in PostgreSQL with the package linked', async () => {
  const travelDate = isoOffsetDays(60);
  const { body } = await post(
    validPayload({
      packageSlug: samplePackage.slug,
      travelDate,
      travellers: 4,
      departureCity: 'Kochi',
      message: 'Two rooms please.',
    })
  );

  const row = await readBooking(body.data.id);

  assert.ok(row, 'the enquiry is persisted, not just acknowledged');
  assert.equal(row.package_id, samplePackage.id, 'the slug resolved to the right package id');
  assert.equal(row.status, 'NEW');
  assert.equal(row.source, 'Website', 'source comes from the column default');
  assert.equal(row.admin_notes, null);
  assert.equal(row.name, 'Asha Menon');
  assert.equal(row.phone, '+91 98765 43210', 'the phone is stored as the visitor typed it');
  assert.equal(row.travel_date, travelDate);
  assert.equal(row.travellers, 4);
  assert.equal(row.departure_city, 'Kochi');
  assert.equal(row.message, 'Two rooms please.');
});

test('POST /api/bookings works without a packageSlug', async () => {
  const { status, body } = await post(validPayload({ message: 'Looking for ideas for December.' }));

  assert.equal(status, 201);
  assert.equal(body.data.status, 'NEW');

  const row = await readBooking(body.data.id);
  assert.equal(row.package_id, null, 'a general enquiry stores no package');
  assert.equal(row.travel_date, null);
  assert.equal(row.travellers, null);
});

test('a same-day travel date is accepted', async () => {
  const today = isoOffsetDays(0);
  const { status, body } = await post(validPayload({ travelDate: today }));

  assert.equal(status, 201);
  const row = await readBooking(body.data.id);
  assert.equal(row.travel_date, today);
});

// ── Rejected enquiries ─────────────────────────────────────────────

test('missing name, email and phone all return 400 with a field map', async () => {
  const { status, body } = await post({});

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, VALIDATION_ERROR);
  assert.equal(body.fields.name, 'Please enter your name.');
  assert.equal(body.fields.email, 'Please enter your email address.');
  assert.equal(body.fields.phone, 'Please enter your phone number.');
  assert.equal(body.data, undefined);
});

test('each required field is reported on its own', async () => {
  const cases = [
    ['name', validPayload({ name: '' })],
    ['email', validPayload({ email: 'not-an-email' })],
    ['phone', validPayload({ phone: '123' })],
  ];

  for (const [field, payload] of cases) {
    const { status, body } = await post(payload);
    assert.equal(status, 400, `${field} should be rejected`);
    assert.ok(body.fields[field], `expected a message on ${field}`);
    assert.equal(await countByEmail(payload.email), 0, 'a rejected enquiry must not be stored');
  }
});

// -2 rather than -1: the validator deliberately allows one day of grace so a
// visitor west of UTC is not rejected for picking their own today. See the note
// on earliestAcceptedDate() in lib/validateBooking.js.
test('a travel date in the past returns 400', async () => {
  const payload = validPayload({ travelDate: isoOffsetDays(-2) });
  const { status, body } = await post(payload);

  assert.equal(status, 400);
  assert.equal(body.error, VALIDATION_ERROR);
  assert.equal(body.fields.travelDate, 'Please choose today or a later date.');
  assert.equal(await countByEmail(payload.email), 0);
});

test('a travel date that does not exist on the calendar returns 400', async () => {
  const { status, body } = await post(validPayload({ travelDate: '2026-02-31' }));

  assert.equal(status, 400);
  assert.match(body.fields.travelDate, /valid date/);
});

test('travellers below 1 or above 50 returns 400', async () => {
  for (const travellers of [0, 51]) {
    const payload = validPayload({ travellers });
    const { status, body } = await post(payload);

    assert.equal(status, 400, `${travellers} travellers should be rejected`);
    assert.equal(body.error, VALIDATION_ERROR);
    assert.match(body.fields.travellers, /between 1 and 50/);
    assert.equal(await countByEmail(payload.email), 0);
  }
});

test('an unknown packageSlug returns 400 rather than storing NULL', async () => {
  const payload = validPayload({ packageSlug: 'no-such-trip-anywhere' });
  const { status, body } = await post(payload);

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error, VALIDATION_ERROR);
  assert.equal(body.fields.packageSlug, 'That trip is no longer available.');
  assert.equal(
    await countByEmail(payload.email),
    0,
    'losing which trip the enquiry was about is worse than rejecting it'
  );
});

test('a 3000 character message is rejected', async () => {
  const payload = validPayload({ message: 'x'.repeat(3000) });
  const { status, body } = await post(payload);

  assert.equal(status, 400);
  assert.match(body.fields.message, /2000/);
  assert.equal(await countByEmail(payload.email), 0);
});

// ── Hostile input ──────────────────────────────────────────────────

test('a SQL injection attempt in name is stored as literal text', async () => {
  const injection = "Robert'); DROP TABLE bookings;--";
  const { status, body } = await post(validPayload({ name: injection }));

  assert.equal(status, 201, 'the string is data, so the enquiry is accepted');

  const row = await readBooking(body.data.id);
  assert.equal(row.name, injection, 'stored character for character, never executed');

  // The table is still there afterwards, and still accepts writes.
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM bookings');
  assert.ok(rows[0].n >= 1, 'the bookings table survived');

  const followUp = await post(validPayload({ name: 'After Injection' }));
  assert.equal(followUp.status, 201);
});

test('an unexpected status or source in the body is ignored', async () => {
  const { status, body } = await post(
    validPayload({ status: 'CONFIRMED', source: 'Spoofed', admin_notes: 'promote me', id: 1 })
  );

  assert.equal(status, 201);
  const row = await readBooking(body.data.id);
  assert.equal(row.status, 'NEW', 'a visitor cannot self-confirm a booking');
  assert.equal(row.source, 'Website');
  assert.equal(row.admin_notes, null);
});

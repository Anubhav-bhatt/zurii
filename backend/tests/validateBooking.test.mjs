/**
 * Unit tests for the enquiry validator.
 *
 *   npm test           (from backend/)
 *
 * No database and no HTTP — validateBooking is pure, so every rule can be
 * probed directly, including the boundaries where off-by-one bugs live.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import validateBookingModule from '../lib/validateBooking.js';

const { validateBooking } = validateBookingModule;

/** A payload that passes everything, so each test can spoil exactly one field. */
const validBody = () => ({
  name: 'Asha Menon',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
});

/** Dates are relative to the run: a fixed literal would rot into the past. */
function isoOffsetDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// ── Happy path ─────────────────────────────────────────────────────

test('a complete valid payload passes and is normalised', () => {
  const { valid, fields, value } = validateBooking({
    ...validBody(),
    name: '  Asha Menon  ',
    travelDate: isoOffsetDays(30),
    travellers: 4,
    departureCity: 'Bengaluru',
    message: 'Anniversary trip, prefer a sea-facing room.',
    packageSlug: 'bali',
  });

  assert.equal(valid, true);
  assert.deepEqual(fields, {});
  assert.equal(value.name, 'Asha Menon', 'surrounding whitespace is trimmed');
  assert.equal(value.email, 'asha@example.com');
  assert.equal(value.phone, '+91 98765 43210', 'the phone text is stored as typed');
  assert.equal(value.travellers, 4);
  assert.equal(value.departureCity, 'Bengaluru');
  assert.equal(value.packageSlug, 'bali');
});

test('the minimum payload is name, email and phone', () => {
  const { valid, value } = validateBooking(validBody());

  assert.equal(valid, true);
  assert.equal(value.travelDate, null);
  assert.equal(value.travellers, null);
  assert.equal(value.departureCity, null);
  assert.equal(value.message, null);
  assert.equal(value.packageSlug, null, 'absent optionals normalise to null, not undefined');
});

// ── name ───────────────────────────────────────────────────────────

test('name is required', () => {
  for (const name of [undefined, null, '', '   ', {}, [], true]) {
    const { valid, fields } = validateBooking({ ...validBody(), name });
    assert.equal(valid, false, `${JSON.stringify(name)} should not pass as a name`);
    assert.equal(fields.name, 'Please enter your name.');
  }
});

test('name length boundaries are 2 and 120', () => {
  assert.equal(validateBooking({ ...validBody(), name: 'A' }).valid, false);
  assert.equal(validateBooking({ ...validBody(), name: 'Al' }).valid, true);
  assert.equal(validateBooking({ ...validBody(), name: 'x'.repeat(120) }).valid, true);

  const tooLong = validateBooking({ ...validBody(), name: 'x'.repeat(121) });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.fields.name, /120/);
});

test('a single character surrounded by spaces is still too short', () => {
  const { valid, fields } = validateBooking({ ...validBody(), name: '  A  ' });
  assert.equal(valid, false);
  assert.match(fields.name, /2 characters/);
});

// ── email ──────────────────────────────────────────────────────────

test('email is required', () => {
  const { valid, fields } = validateBooking({ ...validBody(), email: '' });
  assert.equal(valid, false);
  assert.equal(fields.email, 'Please enter your email address.');
});

test('email must look like an address', () => {
  for (const email of ['asha', 'asha@', '@example.com', 'asha@example', 'asha example.com', 'a@b.c', 'as ha@example.com']) {
    const { valid, fields } = validateBooking({ ...validBody(), email });
    assert.equal(valid, false, `${email} should be rejected`);
    assert.equal(fields.email, 'Please enter a valid email address.');
  }
});

test('email validation stays permissive about real-world addresses', () => {
  for (const email of [
    'asha.menon+bali@example.co.in',
    "o'brien@example.com",
    'a_b-c@sub.domain.travel',
  ]) {
    assert.equal(validateBooking({ ...validBody(), email }).valid, true, `${email} should pass`);
  }
});

test('email is capped at 255 characters', () => {
  const local = 'a'.repeat(255 - '@example.com'.length);
  assert.equal(validateBooking({ ...validBody(), email: `${local}@example.com` }).valid, true);

  const tooLong = validateBooking({ ...validBody(), email: `${local}x@example.com` });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.fields.email, /255/);
});

// ── phone ──────────────────────────────────────────────────────────

test('phone is required', () => {
  const { valid, fields } = validateBooking({ ...validBody(), phone: '  ' });
  assert.equal(valid, false);
  assert.equal(fields.phone, 'Please enter your phone number.');
});

test('phone accepts human formatting around 7 to 15 digits', () => {
  for (const phone of [
    '+91 98765 43210',
    '(080) 4123-4567',
    '9876543210',
    '+1-555-000-0000',
    '1234567',
  ]) {
    assert.equal(validateBooking({ ...validBody(), phone }).valid, true, `${phone} should pass`);
  }
});

test('phone digit-count boundaries are 7 and 15', () => {
  assert.equal(validateBooking({ ...validBody(), phone: '123456' }).valid, false);
  assert.equal(validateBooking({ ...validBody(), phone: '1234567' }).valid, true);
  assert.equal(validateBooking({ ...validBody(), phone: '1'.repeat(15) }).valid, true);

  const tooMany = validateBooking({ ...validBody(), phone: '1'.repeat(16) });
  assert.equal(tooMany.valid, false);
  assert.match(tooMany.fields.phone, /7 to 15 digits/);
});

test('phone rejects text with no usable digits', () => {
  const { valid, fields } = validateBooking({ ...validBody(), phone: 'call me maybe' });
  assert.equal(valid, false);
  assert.match(fields.phone, /digits/);
});

test('phone text longer than the column is rejected, not truncated', () => {
  // Only 10 digits, but 40 characters of padding — VARCHAR(32) would raise 22001.
  const { valid, fields } = validateBooking({
    ...validBody(),
    phone: '+ 9 1 - 9 8 7 6 5 4 3 2 1 0 - - - - -',
  });
  assert.equal(valid, false);
  assert.match(fields.phone, /32 characters/);
});

// ── travelDate ─────────────────────────────────────────────────────

test('travelDate is optional', () => {
  for (const travelDate of [undefined, null, '', '   ']) {
    const { valid, value } = validateBooking({ ...validBody(), travelDate });
    assert.equal(valid, true);
    assert.equal(value.travelDate, null);
  }
});

test('today is an allowed travel date', () => {
  const today = isoOffsetDays(0);
  const { valid, value } = validateBooking({ ...validBody(), travelDate: today });

  assert.equal(valid, true, 'a same-day enquiry is legitimate');
  assert.equal(value.travelDate, today);
});

test('a travelDate clearly in the past is rejected', () => {
  for (const travelDate of [isoOffsetDays(-2), isoOffsetDays(-400), '1999-01-01']) {
    const { valid, fields } = validateBooking({ ...validBody(), travelDate });
    assert.equal(valid, false, `${travelDate} is in the past`);
    assert.equal(fields.travelDate, 'Please choose today or a later date.');
  }
});

/**
 * One day of grace is intentional, not an off-by-one.
 *
 * The container runs UTC while the browser's date picker sets its `min` from the
 * visitor's own calendar, so a visitor west of UTC is on an earlier date than
 * the server. Enforcing a strict server-side "today" would reject the exact date
 * their picker offered them. The rule is "not obviously in the past", and losing
 * a real lead costs more than accepting a date a human will spot as a typo.
 */
test('yesterday is accepted, to absorb the server/visitor timezone gap', () => {
  const yesterday = isoOffsetDays(-1);
  const { valid, value } = validateBooking({ ...validBody(), travelDate: yesterday });

  assert.equal(valid, true, 'a visitor west of UTC must not be rejected for picking their own today');
  assert.equal(value.travelDate, yesterday);
});

test('a date that does not exist on the calendar is rejected', () => {
  // The trap: new Date('2026-02-31') rolls forward to March 3 instead of failing.
  for (const travelDate of ['2026-02-31', '2027-02-29', '2030-04-31', '2030-13-01', '2030-00-10', '2030-06-00', '2030-06-32']) {
    const { valid, fields } = validateBooking({ ...validBody(), travelDate });
    assert.equal(valid, false, `${travelDate} is not a real date`);
    assert.equal(fields.travelDate, 'Please choose a valid date (YYYY-MM-DD).');
  }
});

test('travelDate must be YYYY-MM-DD and nothing else', () => {
  for (const travelDate of ['31-12-2030', '2030/12/31', '2030-1-5', 'next summer', '2030-12-31T00:00:00Z', 20301231, {}]) {
    const { valid, fields } = validateBooking({ ...validBody(), travelDate });
    assert.equal(valid, false, `${JSON.stringify(travelDate)} should be rejected`);
    assert.equal(fields.travelDate, 'Please choose a valid date (YYYY-MM-DD).');
  }
});

test('a leap day in a leap year is accepted', () => {
  assert.equal(validateBooking({ ...validBody(), travelDate: '2028-02-29' }).valid, true);
});

// ── travellers ─────────────────────────────────────────────────────

test('travellers is optional', () => {
  for (const travellers of [undefined, null, '']) {
    const { valid, value } = validateBooking({ ...validBody(), travellers });
    assert.equal(valid, true);
    assert.equal(value.travellers, null);
  }
});

test('travellers boundaries are 1 and 50', () => {
  assert.equal(validateBooking({ ...validBody(), travellers: 0 }).valid, false);
  assert.equal(validateBooking({ ...validBody(), travellers: 1 }).valid, true);
  assert.equal(validateBooking({ ...validBody(), travellers: 50 }).valid, true);
  assert.equal(validateBooking({ ...validBody(), travellers: 51 }).valid, false);
  assert.equal(validateBooking({ ...validBody(), travellers: -3 }).valid, false);
});

test('travellers accepts a numeric string from a form field', () => {
  const { valid, value } = validateBooking({ ...validBody(), travellers: '6' });
  assert.equal(valid, true);
  assert.equal(value.travellers, 6, 'stored as a number, not a string');
});

test('travellers must be a whole number', () => {
  for (const travellers of [2.5, '2.5', 'two', true, {}, [], NaN, Infinity]) {
    const { valid, fields } = validateBooking({ ...validBody(), travellers });
    assert.equal(valid, false, `${JSON.stringify(travellers)} should be rejected`);
    assert.match(fields.travellers, /whole number/);
  }
});

// ── departureCity, message, packageSlug ────────────────────────────

test('departureCity is optional and capped at 120', () => {
  assert.equal(validateBooking({ ...validBody(), departureCity: 'x'.repeat(120) }).valid, true);

  const tooLong = validateBooking({ ...validBody(), departureCity: 'x'.repeat(121) });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.fields.departureCity, /120/);
});

test('message is optional and capped at 2000', () => {
  assert.equal(validateBooking({ ...validBody(), message: 'x'.repeat(2000) }).valid, true);

  const tooLong = validateBooking({ ...validBody(), message: 'x'.repeat(2001) });
  assert.equal(tooLong.valid, false);
  assert.match(tooLong.fields.message, /2000/);
});

test('packageSlug is optional and capped at 250', () => {
  assert.equal(validateBooking({ ...validBody(), packageSlug: 'x'.repeat(250) }).valid, true);

  const tooLong = validateBooking({ ...validBody(), packageSlug: 'x'.repeat(251) });
  assert.equal(tooLong.valid, false);
  assert.equal(tooLong.fields.packageSlug, 'That trip reference is not valid.');
});

// ── Hostile and malformed input ────────────────────────────────────

test('every failing field is reported at once', () => {
  const { valid, fields } = validateBooking({ travellers: 0, travelDate: '2020-01-01' });

  assert.equal(valid, false);
  assert.deepEqual(Object.keys(fields).sort(), ['email', 'name', 'phone', 'travelDate', 'travellers']);
});

test('a missing or non-object body fails instead of throwing', () => {
  for (const body of [undefined, null, 'name=asha', 42, []]) {
    const { valid, fields } = validateBooking(body);
    assert.equal(valid, false);
    assert.equal(fields.name, 'Please enter your name.');
  }
});

test('injection and markup payloads are data, not errors', () => {
  // Validation is not escaping: the text is accepted and stored verbatim, and
  // the parameterised INSERT is what keeps it inert.
  const injection = "Robert'); DROP TABLE bookings;--";
  const { valid, value } = validateBooking({ ...validBody(), name: injection });

  assert.equal(valid, true);
  assert.equal(value.name, injection, 'the string is preserved exactly');
});

test('status, source and admin_notes cannot be set from the request', () => {
  const { value } = validateBooking({
    ...validBody(),
    status: 'CONFIRMED',
    source: 'Spoofed',
    adminNotes: 'promote me',
    admin_notes: 'promote me',
    id: 9999,
  });

  // visitorId/sessionId are the anonymous analytics attribution ids — the only
  // extra keys a request may pass through, and only when they match the id shape.
  assert.deepEqual(Object.keys(value).sort(), [
    'departureCity', 'email', 'message', 'name', 'packageSlug', 'phone',
    'sessionId', 'travelDate', 'travellers', 'visitorId',
  ]);
});

test('a malformed visitorId or sessionId is dropped, never a field error', () => {
  const { valid, fields, value } = validateBooking({
    ...validBody(),
    visitorId: 'not valid!!',
    sessionId: 'x',
  });

  assert.equal(valid, true, 'a bad analytics id must never cost the lead');
  assert.deepEqual(fields, {});
  assert.equal(value.visitorId, null);
  assert.equal(value.sessionId, null);
});

test('shape-valid visitorId and sessionId pass through', () => {
  const { valid, value } = validateBooking({
    ...validBody(),
    visitorId: '3f0a2b1c-9d8e-4f00-a1b2-c3d4e5f60718',
    sessionId: 'session-1234',
  });

  assert.equal(valid, true);
  assert.equal(value.visitorId, '3f0a2b1c-9d8e-4f00-a1b2-c3d4e5f60718');
  assert.equal(value.sessionId, 'session-1234');
});

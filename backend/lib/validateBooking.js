/**
 * Server-side validation for a public enquiry (POST /api/bookings).
 *
 * The browser form validates too, but that is a convenience for the visitor —
 * this module is the truth. Anything can POST to a public endpoint, so nothing
 * here trusts a type, a length or a date from the client.
 *
 * Pure and dependency-free: no database, no Express, no throwing. It returns a
 * verdict and lets the route decide the status code, which keeps it unit
 * testable (see tests/validateBooking.test.mjs).
 *
 *   validateBooking(body) -> { valid, fields, value }
 *
 *   valid   true when `fields` is empty
 *   fields  { name: 'Please enter your name.' } — one user-safe message per
 *           failing field, ready to render next to the input
 *   value   the normalised row to insert; absent optional fields are null, so
 *           the caller can bind it straight into SQL without any ?? juggling
 *
 * Every maximum below matches the column it lands in (see
 * scripts/migrateBookingsSchema.mjs). Rejecting an over-long value here turns
 * what would be a Postgres 22001 and a 500 into a helpful 400.
 */

const NAME_MIN = 2;
const NAME_MAX = 120;
const EMAIL_MAX = 255;
const PHONE_TEXT_MAX = 32; // phone VARCHAR(32) — the stored text, not the digits
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 15; // E.164 caps a subscriber number at 15 digits
const CITY_MAX = 120;
const MESSAGE_MAX = 2000;
const SLUG_MAX = 250;
const TRAVELLERS_MIN = 1;
const TRAVELLERS_MAX = 50;

/**
 * Deliberately permissive: the only thing a regex can honestly prove about an
 * address is that it has a local part, an `@` and a dotted domain. Anything
 * stricter rejects real addresses, and only a delivered mail proves the rest.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Shape of an anonymous analytics id (see lib/validateEvent.js — the pattern
 * is duplicated here on purpose so this module stays dependency-free, as its
 * header promises). Attribution is a bonus, never a gate: an id that fails
 * this shape is silently dropped to null and NEVER added to `fields`, because
 * a malformed analytics id must not cost a lead.
 */
const ANALYTICS_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** Absent means "not supplied" — null, undefined and blank text are all absent. */
const isAbsent = (value) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

/**
 * Text fields accept strings and finite numbers, because a phone number or a
 * postal-style city typed into a JSON client can arrive unquoted. Objects,
 * arrays and booleans are treated as empty so a hostile body can never reach
 * SQL as '[object Object]'.
 */
function asText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/**
 * Integer or nothing. '3' from a form field counts; '3.5', '3abc', true and
 * 1e400 do not. Returns NaN for anything that is not a whole number, which the
 * range check below then reports.
 */
function asInteger(value) {
  if (typeof value === 'number') return Number.isInteger(value) ? value : NaN;
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return Number(value.trim());
  return NaN;
}

/**
 * True only for a date that exists on the calendar. A plain `new Date(...)`
 * silently rolls 2026-02-31 forward to 2026-03-03, so the parsed parts are
 * compared back against the input.
 */
function isRealCalendarDate(text) {
  const match = DATE_RE.exec(text);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * The earliest travel date the server will accept, as YYYY-MM-DD. Zero-padded
 * ISO dates sort lexicographically in calendar order, so comparing two strings
 * needs no Date arithmetic and cannot be knocked off by DST.
 *
 * One day of slack is deliberate. "Today" depends on where you are: the
 * container runs UTC (the Dockerfile sets no TZ), while the browser's date
 * picker sets its `min` from the visitor's own calendar. A visitor in
 * America/Los_Angeles at 18:00 on the 10th is already on the 11th in UTC, so a
 * strict server-side "today" would reject the very date their picker offered.
 *
 * The rule being enforced is "not obviously in the past", and accepting one
 * extra day costs nothing — a travel enquiry for yesterday is a typo a human
 * will spot, whereas rejecting a legitimate date loses the lead.
 */
function earliestAcceptedDate() {
  // Local date arithmetic, NOT toISOString(): the first version subtracted a
  // day in UTC, so on a UTC+5:30 server the boundary was "UTC yesterday" —
  // which, between midnight and 05:30 local, is TWO local days ago. The grace
  // window silently widened depending on the time of day, and the suite failed
  // only when run in the early hours. One LOCAL day of slack is also exactly
  // enough for any visitor west of the server (max offset < 24h).
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Validate an enquiry body. Never throws — a malformed body just fails every
 * rule it touches.
 */
function validateBooking(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fields = {};

  // ── name (required) ──────────────────────────────────────────────
  const name = asText(input.name);
  if (!name) {
    fields.name = 'Please enter your name.';
  } else if (name.length < NAME_MIN) {
    fields.name = `Please enter at least ${NAME_MIN} characters.`;
  } else if (name.length > NAME_MAX) {
    fields.name = `Please keep your name under ${NAME_MAX} characters.`;
  }

  // ── email (required) ─────────────────────────────────────────────
  const email = asText(input.email);
  if (!email) {
    fields.email = 'Please enter your email address.';
  } else if (email.length > EMAIL_MAX) {
    fields.email = `Please keep your email under ${EMAIL_MAX} characters.`;
  } else if (!EMAIL_RE.test(email)) {
    fields.email = 'Please enter a valid email address.';
  }

  // ── phone (required) ─────────────────────────────────────────────
  // The digits decide validity; the original text is what gets stored, so a
  // '+91 98765 43210' stays readable for whoever calls the lead back.
  const phone = asText(input.phone);
  const phoneDigits = phone.replace(/\D/g, '');
  if (!phone) {
    fields.phone = 'Please enter your phone number.';
  } else if (phone.length > PHONE_TEXT_MAX) {
    fields.phone = `Please keep your phone number under ${PHONE_TEXT_MAX} characters.`;
  } else if (phoneDigits.length < PHONE_DIGITS_MIN || phoneDigits.length > PHONE_DIGITS_MAX) {
    fields.phone = `Please enter a phone number with ${PHONE_DIGITS_MIN} to ${PHONE_DIGITS_MAX} digits.`;
  }

  // ── travelDate (optional) ────────────────────────────────────────
  let travelDate = null;
  if (!isAbsent(input.travelDate)) {
    const text = typeof input.travelDate === 'string' ? input.travelDate.trim() : '';
    if (!isRealCalendarDate(text)) {
      fields.travelDate = 'Please choose a valid date (YYYY-MM-DD).';
    } else if (text < earliestAcceptedDate()) {
      fields.travelDate = 'Please choose today or a later date.';
    } else {
      travelDate = text;
    }
  }

  // ── travellers (optional) ────────────────────────────────────────
  let travellers = null;
  if (!isAbsent(input.travellers)) {
    const count = asInteger(input.travellers);
    if (!Number.isInteger(count) || count < TRAVELLERS_MIN || count > TRAVELLERS_MAX) {
      fields.travellers = `Please enter a whole number of travellers between ${TRAVELLERS_MIN} and ${TRAVELLERS_MAX}.`;
    } else {
      travellers = count;
    }
  }

  // ── departureCity (optional) ─────────────────────────────────────
  let departureCity = null;
  if (!isAbsent(input.departureCity)) {
    const city = asText(input.departureCity);
    if (city.length > CITY_MAX) {
      fields.departureCity = `Please keep the departure city under ${CITY_MAX} characters.`;
    } else {
      departureCity = city || null;
    }
  }

  // ── message (optional) ───────────────────────────────────────────
  let message = null;
  if (!isAbsent(input.message)) {
    const text = asText(input.message);
    if (text.length > MESSAGE_MAX) {
      fields.message = `Please keep your message under ${MESSAGE_MAX} characters.`;
    } else {
      message = text || null;
    }
  }

  // ── packageSlug (optional) ───────────────────────────────────────
  // Only shape is checked here; whether the slug exists is a database question
  // and belongs to the route.
  let packageSlug = null;
  if (!isAbsent(input.packageSlug)) {
    const slug = asText(input.packageSlug);
    if (slug.length > SLUG_MAX) {
      fields.packageSlug = 'That trip reference is not valid.';
    } else {
      packageSlug = slug || null;
    }
  }

  // ── visitorId / sessionId (optional, shape-check-or-drop) ────────
  // These attribute the lead to the anonymous journey that preceded it. They
  // can never fail validation — see the note on ANALYTICS_ID_RE above.
  const visitorId =
    typeof input.visitorId === 'string' && ANALYTICS_ID_RE.test(input.visitorId)
      ? input.visitorId
      : null;
  const sessionId =
    typeof input.sessionId === 'string' && ANALYTICS_ID_RE.test(input.sessionId)
      ? input.sessionId
      : null;

  return {
    valid: Object.keys(fields).length === 0,
    fields,
    value: {
      name, email, phone, travelDate, travellers, departureCity, message, packageSlug,
      visitorId, sessionId,
    },
  };
}

module.exports = { validateBooking };

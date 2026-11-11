/**
 * Trip-planning context (Phase 5 — ZT-26, ZT-38).
 *
 * Month and travellers from the home search are planning preferences, not
 * package properties: the catalogue has no reliable availability data (its
 * legacy "batches" are placeholder dates), so they never filter results.
 * Instead they travel with the visitor — in the /packages URL, and in this
 * tab's sessionStorage — and pre-fill the enquiry, where they reach the team.
 * Destination and budget ride along the same way into Plan My Trip.
 *
 * Every value is validated against the fixed choices below; anything else is
 * dropped, so a hand-edited URL cannot inject text into an enquiry.
 */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const TRAVELLER_OPTIONS = ['1', '2', '3-4', '5-6', '7+'];

export const DURATIONS = ['1-3', '4-6', '7+'];

/** Budget bands, worded as the home search and the enquiry form word them. */
export const BUDGET_BANDS = [
  { label: 'Up to ₹25,000', maxPrice: '25000' },
  { label: '₹25,000 – ₹50,000', minPrice: '25000', maxPrice: '50000' },
  { label: '₹50,000 – ₹1,00,000', minPrice: '50000', maxPrice: '100000' },
  { label: '₹1,00,000 – ₹2,00,000', minPrice: '100000', maxPrice: '200000' },
  { label: 'Above ₹2,00,000', minPrice: '200000' },
];

const KEY = 'zurii_trip_plan';
const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;
const FIELDS = ['destination', 'month', 'travellers', 'budget', 'duration'];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Keep only values that are one of the known choices. */
export function normalisePlan(raw = {}) {
  const plan = {};
  const destination = text(raw?.destination).toLowerCase();
  if (SLUG.test(destination)) plan.destination = destination;
  const month = MONTHS.find((m) => m.toLowerCase() === text(raw?.month).toLowerCase());
  if (month) plan.month = month;
  const travellers = text(raw?.travellers);
  if (TRAVELLER_OPTIONS.includes(travellers)) plan.travellers = travellers;
  const budget = BUDGET_BANDS.find((b) => b.label === text(raw?.budget));
  if (budget) plan.budget = budget.label;
  const duration = text(raw?.duration);
  if (DURATIONS.includes(duration)) plan.duration = duration;
  return plan;
}

/** The plan carried by a URL (/packages, /plan-my-trip). */
export function planFromSearchParams(params) {
  const raw = {};
  for (const field of FIELDS) raw[field] = params.get(field) ?? '';
  return normalisePlan(raw);
}

/** Query string for a link that carries the plan, e.g. to /plan-my-trip. */
export function planToQuery(plan, fields = FIELDS) {
  const clean = normalisePlan(plan);
  const params = new URLSearchParams();
  for (const field of fields) if (clean[field]) params.set(field, clean[field]);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readTripPlan(storage = session()) {
  try {
    return normalisePlan(JSON.parse(storage?.getItem(KEY) ?? '{}'));
  } catch {
    return {};
  }
}

/** Merge into the saved plan; a field set to '' or null is removed. */
export function saveTripPlan(patch, storage = session()) {
  const next = { ...readTripPlan(storage) };
  for (const field of FIELDS) {
    if (!(field in (patch ?? {}))) continue;
    if (patch[field] === null || patch[field] === '' || patch[field] === undefined) delete next[field];
    else next[field] = patch[field];
  }
  const clean = normalisePlan(next);
  try {
    if (Object.keys(clean).length) storage?.setItem(KEY, JSON.stringify(clean));
    else storage?.removeItem(KEY);
  } catch {
    // storage blocked or full: the URL still carries the plan
  }
  return clean;
}

/** '3-4' → 3: the enquiry form's travellers field takes one number. */
export function travellersCount(value) {
  const match = /^(\d+)/.exec(text(value));
  return match ? Number(match[1]) : null;
}

export function travellersLabel(value) {
  const v = text(value);
  if (!v) return '';
  if (v === '1') return '1 traveller';
  return `${v.replace('-', '–')} travellers`;
}

/** Lines added above the visitor's message, so the team sees the plan. */
export function planContextLines(plan, { destinationName } = {}) {
  const lines = [];
  if (destinationName) lines.push(`Destination: ${destinationName}`);
  if (plan?.month) lines.push(`Preferred month: ${plan.month}`);
  if (plan?.travellers) lines.push(`Travellers: ${plan.travellers.replace('-', '–')}`);
  if (plan?.budget) lines.push(`Budget: ${plan.budget}`);
  return lines;
}

/**
 * Departure dates ("batches") on a trip page (Phase 5).
 *
 * The catalogue's batches are written as text — "Apr 25 – May 1, 2026" — and
 * were shown under "Upcoming departures" whatever the date, so a page could
 * advertise a departure months in the past as "Available" or "Filling fast".
 * Only departures that start today or later are shown now. A date that cannot
 * be read is left out rather than guessed. (The slot counts and statuses are
 * static catalogue values, not live availability — flagged for the owner.)
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Start date of "Mon D – Mon D, YYYY" (also "Mon D, YYYY – Mon D, YYYY"); null if unreadable. */
export function departureStart(text) {
  if (typeof text !== 'string') return null;
  const years = text.match(/\b(20\d{2})\b/g);
  const parts = [...text.matchAll(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})\b/g)];
  if (!years || parts.length === 0) return null;
  const month = MONTHS.indexOf(parts[0][1].toLowerCase());
  const day = Number(parts[0][2]);
  if (month < 0 || day < 1 || day > 31) return null;
  let year = Number(years[0]);
  // "Dec 28 – Jan 3, 2027": one year given, at the end, and the trip crosses it.
  if (years.length === 1 && parts.length > 1) {
    const endMonth = MONTHS.indexOf(parts[1][1].toLowerCase());
    if (endMonth >= 0 && endMonth < month) year -= 1;
  }
  const date = new Date(year, month, day);
  return date.getMonth() === month ? date : null;
}

/** Batches that start today or later, in their original order. */
export function upcomingBatches(batches, today = new Date()) {
  if (!Array.isArray(batches)) return [];
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return batches.filter((batch) => {
    const start = departureStart(batch?.date);
    return start !== null && start >= startOfToday;
  });
}

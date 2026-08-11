/**
 * Pure normalization helpers for the travel-data migration.
 *
 * Kept free of database and filesystem access so they can be unit tested
 * directly — see normalize.test.mjs.
 */

/**
 * Latin letters that NFKD does not decompose into base + combining mark.
 * Without these, 'Tromsø' would slug to 'troms' — the letter silently dropped
 * rather than transliterated.
 */
const TRANSLITERATIONS = {
  ø: 'o', Ø: 'o',
  æ: 'ae', Æ: 'ae',
  œ: 'oe', Œ: 'oe',
  ß: 'ss',
  đ: 'd', Đ: 'd',
  ð: 'd', Ð: 'd',
  þ: 'th', Þ: 'th',
  ł: 'l', Ł: 'l',
  ı: 'i',
};

const TRANSLITERATION_RE = new RegExp(`[${Object.keys(TRANSLITERATIONS).join('')}]`, 'g');

/** Fold a string to plain ASCII letters and digits, preserving pronunciation. */
function foldToAscii(input) {
  return String(input)
    .replace(TRANSLITERATION_RE, (ch) => TRANSLITERATIONS[ch])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, ''); // strip combining accents
}

/**
 * URL-safe slug. Diacritics are folded, `&` becomes `and`, everything else
 * non-alphanumeric collapses to single hyphens.
 *
 *   'Bali Romantic Escape'      → 'bali-romantic-escape'
 *   'Eastern Europe & Caucasus' → 'eastern-europe-and-caucasus'
 *   'Tromsø'                    → 'tromso'
 */
export function slugify(input) {
  if (input === null || input === undefined) return '';
  return foldToAscii(input)
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deterministic collision resolution: 'bali', 'bali-2', 'bali-3'...
 * `taken` is a Set that this function adds to.
 */
export function uniqueSlug(base, taken) {
  const root = base || 'item';
  if (!taken.has(root)) {
    taken.add(root);
    return root;
  }
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  const resolved = `${root}-${n}`;
  taken.add(resolved);
  return resolved;
}

/**
 * Currency string → number.
 *
 *   '₹59,700'          → 59700
 *   '₹1,59,999'        → 159999   (Indian grouping)
 *   '₹ 42,999/-'       → 42999
 *   '42,999 per person'→ 42999
 *   42999              → 42999
 *
 * Returns null when no digits are present. Commas are treated as grouping
 * separators only — never as a decimal point — so '42,999' can not collapse
 * to 42.
 */
export function parsePrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const match = String(value).match(/\d[\d,\s]*(?:\.\d+)?/);
  if (!match) return null;

  const numeric = Number(match[0].replace(/[,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Duration string → { days, nights }. Either side may be null; nothing is
 * inferred from the other, so unstated nights stay null rather than being
 * invented as days - 1. Callers keep the original text alongside.
 *
 *   '7 Days / 6 Nights'   → { days: 7, nights: 6 }
 *   '5N / 6D'             → { days: 6, nights: 5 }
 *   '6 Days 5 Nights'     → { days: 6, nights: 5 }
 *   '5 Nights & 6 Days'   → { days: 6, nights: 5 }
 *   '7 Days'              → { days: 7, nights: null }
 *   'Flexible'            → { days: null, nights: null }
 */
export function parseDuration(value) {
  const text = value === null || value === undefined ? '' : String(value);
  const days = text.match(/(\d+)\s*d(?:ays?)?\b/i);
  const nights = text.match(/(\d+)\s*n(?:ights?)?\b/i);
  return {
    days: days ? Number(days[1]) : null,
    nights: nights ? Number(nights[1]) : null,
  };
}

/**
 * Comparison key for destination names. Case, whitespace and punctuation are
 * flattened so 'Bali', 'bali', 'BALI' and ' Bali ' all collide — while the
 * original display name is always stored untouched.
 */
export function normalizeName(name) {
  if (name === null || name === undefined) return '';
  return foldToAscii(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s{2,}/g, ' ');
}

/**
 * Every key a destination name should be findable by, so that
 * 'Bali, Indonesia' and 'Indonesia - Bali' both resolve to 'bali'.
 */
export function nameKeys(name) {
  const keys = new Set();
  const full = normalizeName(name);
  if (full) keys.add(full);
  for (const part of String(name ?? '').split(/[,\-–|/]/)) {
    const key = normalizeName(part);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * True when `needle` appears in `haystack` on word boundaries, so 'oman' does
 * not match 'romantic' and 'italy' does not match 'italyish'.
 */
export function containsName(haystack, needle) {
  const key = normalizeName(needle);
  if (!key) return false;
  const text = ` ${normalizeName(haystack)} `;
  return text.includes(` ${key} `);
}

/** Images must be usable at runtime — never a JS import identifier. */
export function isUsableImage(value) {
  if (typeof value !== 'string') return false;
  return /^(https?:\/\/|\/)/.test(value.trim());
}

/**
 * Trip-type / theme tags, derived with the keyword rules the frontend already
 * applies at render time in ExplorePage.jsx. Derived rather than invented:
 * the same package lands in the same category it does today.
 */
const TAG_KEYWORDS = {
  adventure: ['adventure', 'trek', 'rafting', 'safari', 'expedition', 'circuit', 'kheerganga', 'spiti', 'ladakh', 'rishikesh'],
  beach: ['beach', 'island', 'coast', 'backwater', 'bali', 'andaman', 'maldives', 'goa', 'havelock'],
  heritage: ['heritage', 'cultural', 'spiritual', 'temple', 'fort', 'palace', 'varanasi', 'pushkar', 'udaipur', 'jaipur'],
};

const TAG_EXCLUSIONS = {
  beach: ['dubai', 'singapore', 'ha long', 'vietnam'],
  adventure: ['bali', 'indonesia'],
};

export function deriveTags({ slug, title, subtitle, tagline, overview, tripType, kind }) {
  const blob = [title, subtitle, tagline, overview].filter(Boolean).join(' ').toLowerCase();
  const id = String(slug ?? '').toLowerCase();
  const tags = [];

  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    const excluded = (TAG_EXCLUSIONS[tag] || []).some((ex) => blob.includes(ex) || id.includes(ex));
    if (excluded) continue;
    if (keywords.some((k) => blob.includes(k))) tags.push(tag);
  }

  if (tripType) tags.push(normalizeName(tripType));
  if (kind) tags.push(kind);

  return [...new Set(tags)];
}

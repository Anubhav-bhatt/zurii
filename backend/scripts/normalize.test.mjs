/**
 * Unit tests for the migration's normalization helpers.
 *
 *   npm test           (from backend/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  slugify,
  uniqueSlug,
  parsePrice,
  parseDuration,
  normalizeName,
  nameKeys,
  containsName,
  isUsableImage,
  deriveTags,
} from './normalize.mjs';

test('slugify produces url-safe slugs', () => {
  assert.equal(slugify('Bali Romantic Escape'), 'bali-romantic-escape');
  assert.equal(slugify('  Spiti   Valley  '), 'spiti-valley');
  assert.equal(slugify('Eastern Europe & Caucasus'), 'eastern-europe-and-caucasus');
  assert.equal(slugify('Turkey (Europe)'), 'turkey-europe');
  assert.equal(slugify('Nur-Sultan'), 'nur-sultan');
  assert.equal(slugify('Zermatt---Zurich'), 'zermatt-zurich');
  assert.equal(slugify('Tromsø'), 'tromso');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});

test('uniqueSlug resolves collisions deterministically', () => {
  const taken = new Set();
  assert.equal(uniqueSlug('bali', taken), 'bali');
  assert.equal(uniqueSlug('bali', taken), 'bali-2');
  assert.equal(uniqueSlug('bali', taken), 'bali-3');
  assert.equal(uniqueSlug('goa', taken), 'goa');
  assert.equal(uniqueSlug('', taken), 'item');
});

test('parsePrice handles every format present in the source data', () => {
  assert.equal(parsePrice('₹59,700'), 59700);
  assert.equal(parsePrice('₹1,59,999'), 159999); // Indian grouping
  assert.equal(parsePrice('₹2,09,999'), 209999);
  assert.equal(parsePrice('42999'), 42999);
  assert.equal(parsePrice(42999), 42999);
  assert.equal(parsePrice('₹ 42,999/-'), 42999);
  assert.equal(parsePrice('42,999 per person'), 42999);
  assert.equal(parsePrice('₹35,001'), 35001);
});

test('parsePrice never truncates a thousands separator to its first group', () => {
  // The classic bug: '42,999' parsed as 42.
  assert.notEqual(parsePrice('42,999'), 42);
  assert.equal(parsePrice('42,999'), 42999);
  assert.equal(parsePrice('1,00,000'), 100000);
});

test('parsePrice returns null when there is no number', () => {
  assert.equal(parsePrice('On request'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(undefined), null);
  assert.equal(parsePrice(NaN), null);
});

test('parseDuration reads days and nights in any order or notation', () => {
  assert.deepEqual(parseDuration('7 Days / 6 Nights'), { days: 7, nights: 6 });
  assert.deepEqual(parseDuration('5N / 6D'), { days: 6, nights: 5 });
  assert.deepEqual(parseDuration('6 Days 5 Nights'), { days: 6, nights: 5 });
  assert.deepEqual(parseDuration('6D 5N'), { days: 6, nights: 5 });
  assert.deepEqual(parseDuration('5 Nights & 6 Days'), { days: 6, nights: 5 });
  assert.deepEqual(parseDuration('10 Days / 9 Nights'), { days: 10, nights: 9 });
});

test('parseDuration never invents the unstated half', () => {
  assert.deepEqual(parseDuration('7 Days'), { days: 7, nights: null });
  assert.deepEqual(parseDuration('4 Nights'), { days: null, nights: 4 });
  assert.deepEqual(parseDuration('Flexible'), { days: null, nights: null });
  assert.deepEqual(parseDuration(''), { days: null, nights: null });
  assert.deepEqual(parseDuration(null), { days: null, nights: null });
});

test('normalizeName collapses trivial naming differences', () => {
  const expected = 'bali';
  for (const variant of ['Bali', 'bali', 'BALI', '  Bali  ', 'Bali!']) {
    assert.equal(normalizeName(variant), expected);
  }
  assert.equal(normalizeName('Himachal   Pradesh'), 'himachal pradesh');
  assert.equal(normalizeName('Sri Lanka'), 'sri lanka');
});

test('nameKeys exposes both the full name and its segments', () => {
  assert.deepEqual(nameKeys('Bali, Indonesia'), ['bali indonesia', 'bali', 'indonesia']);
  assert.deepEqual(nameKeys('Indonesia - Bali'), ['indonesia bali', 'indonesia', 'bali']);
  assert.deepEqual(nameKeys('Kerala'), ['kerala']);
});

test('containsName matches on word boundaries only', () => {
  assert.equal(containsName('Oman Desert Adventure', 'Oman'), true);
  assert.equal(containsName('Paris Romance Special', 'Paris'), true);
  assert.equal(containsName('Romantic Getaway', 'Oman'), false); // not a substring hit
  assert.equal(containsName('Italyish Tour', 'Italy'), false);
  assert.equal(containsName('Santorini, Greece', 'Greece'), true);
  assert.equal(containsName('', 'Greece'), false);
  assert.equal(containsName('Greece', ''), false);
});

test('isUsableImage rejects anything a browser cannot load', () => {
  assert.equal(isUsableImage('https://images.unsplash.com/photo-1?w=800'), true);
  assert.equal(isUsableImage('/assets/bali.jpg'), true);
  assert.equal(isUsableImage('baliImage'), false); // a JS import identifier
  assert.equal(isUsableImage('../assets/bali.jpg'), false);
  assert.equal(isUsableImage(''), false);
  assert.equal(isUsableImage(null), false);
  assert.equal(isUsableImage(undefined), false);
});

test('deriveTags reproduces the frontend keyword rules', () => {
  const ladakh = deriveTags({
    slug: 'ladakh-circuit',
    title: 'Ladakh Circuit',
    overview: 'A high-altitude trek across the passes.',
    kind: 'domestic',
  });
  assert.ok(ladakh.includes('adventure'));
  assert.ok(ladakh.includes('domestic'));

  const andaman = deriveTags({ slug: 'andaman-explorer', title: 'Havelock Island Explorer', kind: 'domestic' });
  assert.ok(andaman.includes('beach'));

  const varanasi = deriveTags({ slug: 'varanasi-heritage', title: 'Varanasi Heritage Walk', kind: 'domestic' });
  assert.ok(varanasi.includes('heritage'));
});

test('deriveTags honours the exclusion rules', () => {
  // 'bali' is a beach keyword but is explicitly excluded from adventure.
  const bali = deriveTags({ slug: 'bali-adventure', title: 'Bali Adventure', overview: 'Trek and rafting.' });
  assert.ok(bali.includes('beach'));
  assert.ok(!bali.includes('adventure'));

  // Dubai is excluded from beach.
  const dubai = deriveTags({ slug: 'dubai-luxury', title: 'Dubai Luxury Escape', overview: 'Island of gold beach club.' });
  assert.ok(!dubai.includes('beach'));
});

test('deriveTags adds trip type and de-duplicates', () => {
  const family = deriveTags({ slug: 'kashmir-family', title: 'Kashmir Family Grandeur', tripType: 'Family', kind: 'domestic' });
  assert.ok(family.includes('family'));
  assert.equal(new Set(family).size, family.length);
});

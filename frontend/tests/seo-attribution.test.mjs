/**
 * Phase 6: page metadata (ZT-17), lead attribution capture (ZT-16) and
 * plain-language API error fallbacks.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Browser storage stand-ins, installed before the modules that read them load.
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() };
};
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();

const meta = await import('../src/seo/meta.js');
const attribution = await import('../src/services/leadAttribution.js');
const consent = await import('../src/services/consent.js');
const { fallbackMessage } = await import('../src/services/errorMessages.js');
const { SITE } = await import('../src/config/site.js');

const ORIGIN = 'https://zurii.example';

describe('page metadata', () => {
  it('cuts descriptions at a word boundary under the limit', () => {
    const long = 'word '.repeat(80);
    const out = meta.clip(long);
    assert.ok(out.length <= 158 && out.endsWith('…'));
    assert.equal(meta.clip('  short   text '), 'short text');
  });

  it('reads the guide dates the site prints', () => {
    assert.equal(meta.isoDate('Apr 15, 2026'), '2026-04-15');
    assert.equal(meta.isoDate('Feb 30, 2026'), null);
    assert.equal(meta.isoDate('soon'), null);
  });

  it('every static page has a unique title under 70 characters and a description', () => {
    const titles = Object.values(meta.STATIC_PAGES).map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length);
    for (const [path, page] of Object.entries(meta.STATIC_PAGES)) {
      assert.ok(page.title.length <= 70, path);
      assert.ok(page.description.length >= 40 && page.description.length <= 160, path);
    }
  });

  it('a trip description leads with duration and place, as sentences', () => {
    const m = meta.packageMeta({ slug: 'bali', title: 'Bali', summary: 'Island of Gods', description: 'Temples and beaches.', durationText: '7 Days', destinationName: 'Bali' });
    assert.equal(m.description, '7 Days in Bali. Island of Gods. Temples and beaches.');
    assert.equal(m.path, '/trip/bali');
  });

  it('canonical and og:url only with an origin, never on noindex pages, never with a query string', () => {
    const page = meta.staticPageMeta('/packages?q=x');
    const withOrigin = Object.fromEntries(meta.headTags(page, { origin: ORIGIN }).map(([, a]) => [a.name ?? a.property ?? a.rel, a.content ?? a.href]));
    assert.equal(withOrigin.canonical, `${ORIGIN}/packages`);
    assert.equal(withOrigin['og:url'], `${ORIGIN}/packages`);
    const noOrigin = meta.headTags(page, { origin: '' }).map(([, a]) => a.rel ?? a.property);
    assert.ok(!noOrigin.includes('canonical') && !noOrigin.includes('og:url'));
    const hidden = meta.headTags(meta.staticPageMeta('/wishlist'), { origin: ORIGIN });
    assert.ok(!hidden.some(([, a]) => a.rel === 'canonical'));
    assert.equal(hidden.find(([, a]) => a.name === 'robots')[1].content, 'noindex, nofollow');
  });

  it('a preview or staging build is noindex everywhere', () => {
    const tags = meta.headTags(meta.staticPageMeta('/'), { origin: ORIGIN, indexable: false });
    assert.equal(tags.find(([, a]) => a.name === 'robots')[1].content, 'noindex, nofollow');
    assert.ok(!tags.some(([, a]) => a.rel === 'canonical'));
  });

  it('structured data carries only published facts — no ratings, reviews, prices or availability', () => {
    const home = JSON.stringify(meta.structuredData(meta.staticPageMeta('/'), { origin: ORIGIN, site: SITE }));
    const trip = JSON.stringify(meta.structuredData(meta.packageMeta({ slug: 'x', title: 'X', image: '/a.jpg' }), { origin: ORIGIN, site: SITE }));
    for (const json of [home, trip]) assert.doesNotMatch(json, /rating|review|offer|price|availab|award/i);
    assert.match(home, /"TravelAgency"/);
    assert.match(home, new RegExp(SITE.email.label));
    assert.equal(meta.structuredData(meta.staticPageMeta('/'), { origin: '', site: SITE }), null, 'no origin, no JSON-LD');
  });
});

describe('lead attribution', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); consent.setMarketingConsent('denied'); });

  it('reads UTM tags, the referring host, the landing path and the click-id TYPE only', () => {
    const t = attribution.touchFromLocation('https://site.example/destination/kashmir?utm_source=google&utm_medium=cpc&utm_campaign=spring&gclid=SECRET123&email=a@b.co',
      'https://www.google.com/search?q=private');
    assert.deepEqual(t, { landingPage: '/destination/kashmir', utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'spring', clickIdType: 'gclid', referrerHost: 'www.google.com' });
    assert.ok(!JSON.stringify(t).includes('SECRET123') && !JSON.stringify(t).includes('private'));
    assert.equal(attribution.touchFromLocation('https://site.example/x', 'https://site.example/y').referrerHost, undefined, 'own site is not a referrer');
  });

  it('keeps the session\'s landing page; a later ad click replaces it; a reload does not', () => {
    attribution.captureAttribution({ href: 'https://s.example/?utm_source=a&utm_campaign=one', referrer: '' });
    attribution.captureAttribution({ href: 'https://s.example/packages', referrer: 'https://s.example/' });
    assert.equal(attribution.leadAttribution().attribution.utmCampaign, 'one');
    attribution.captureAttribution({ href: 'https://s.example/trip/x?utm_source=b&utm_campaign=two', referrer: '' });
    assert.equal(attribution.leadAttribution().attribution.utmCampaign, 'two');
  });

  it('remembers a campaign across visits only with marketing consent, and forgets it when consent is withdrawn', () => {
    attribution.captureAttribution({ href: 'https://s.example/?utm_source=a&utm_campaign=c1', referrer: '' });
    assert.equal(localStorage.getItem(attribution.PERSIST_KEY), null, 'nothing kept across visits without consent');

    consent.setMarketingConsent('granted');
    attribution.applyConsent('granted');
    assert.ok(localStorage.getItem(attribution.PERSIST_KEY), 'kept once consent is given');

    sessionStorage.clear(); // a new visit, arriving directly
    attribution.captureAttribution({ href: 'https://s.example/contact-us', referrer: '' });
    assert.equal(attribution.leadAttribution().attribution.utmCampaign, 'c1', 'the earlier campaign is credited');

    consent.setMarketingConsent('denied');
    attribution.applyConsent('denied');
    assert.equal(localStorage.getItem(attribution.PERSIST_KEY), null, 'withdrawal deletes it');
    assert.equal(attribution.leadAttribution().attribution.utmCampaign, undefined);
  });

  it('a cross-visit campaign older than 30 days is not used', () => {
    consent.setMarketingConsent('granted');
    const old = Date.now() - 31 * 24 * 60 * 60 * 1000;
    attribution.captureAttribution({ href: 'https://s.example/?utm_source=a&utm_campaign=stale', referrer: '', now: old });
    sessionStorage.clear();
    attribution.captureAttribution({ href: 'https://s.example/', referrer: '' });
    assert.equal(attribution.leadAttribution().attribution.utmCampaign, undefined);
  });

  it('never throws, and sends nothing when storage is unavailable', () => {
    const saved = globalThis.sessionStorage;
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
      assert.doesNotThrow(() => attribution.captureAttribution({ href: 'https://s.example/?utm_source=x', referrer: '' }));
      assert.deepEqual(attribution.leadAttribution(), {});
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, writable: true, value: saved });
    }
  });
});

describe('API error fallbacks', () => {
  it('never shows a status code to a visitor', () => {
    for (const status of [400, 404, 429, 500, 502, 503, 504]) assert.doesNotMatch(fallbackMessage(status), /\d{3}|failed/i, String(status));
    assert.match(fallbackMessage(503), /temporarily unavailable/);
  });
});

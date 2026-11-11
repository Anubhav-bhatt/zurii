// Marketing consent store: opt-in, persisted, and safe without storage.
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { CONSENT_STORAGE_KEY, getMarketingConsent, setMarketingConsent, subscribeConsent } = await import(
  '../src/services/consent.js'
);

describe('marketing consent', () => {
  beforeEach(() => store.clear());

  it('defaults to unset (no tracking) and stores only the choice and a timestamp', () => {
    assert.equal(getMarketingConsent(), 'unset');
    setMarketingConsent('granted');
    const saved = JSON.parse(store.get(CONSENT_STORAGE_KEY));
    assert.deepEqual(Object.keys(saved).sort(), ['marketing', 'updatedAt', 'version']);
    assert.equal(saved.marketing, 'granted');
    assert.equal(getMarketingConsent(), 'granted');
  });

  it('notifies subscribers on every change', () => {
    const seen = [];
    const stop = subscribeConsent((choice) => seen.push(choice));
    setMarketingConsent('granted');
    setMarketingConsent('denied');
    stop();
    setMarketingConsent('granted');
    assert.deepEqual(seen, ['granted', 'denied']);
  });

  it('rejects unknown values and ignores a corrupted record', () => {
    assert.throws(() => setMarketingConsent('maybe'));
    setMarketingConsent('denied');
    // A damaged record falls back to this page's own last choice — it can
    // never turn into 'granted' by itself.
    store.set(CONSENT_STORAGE_KEY, '{not json');
    assert.equal(getMarketingConsent(), 'denied');
    store.set(CONSENT_STORAGE_KEY, JSON.stringify({ marketing: 'everything' }));
    assert.equal(getMarketingConsent(), 'denied');
  });

  it('keeps the choice for the page when storage is blocked', () => {
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    try {
      setMarketingConsent('denied');
      assert.equal(getMarketingConsent(), 'denied');
    } finally {
      globalThis.localStorage = original;
    }
  });
});

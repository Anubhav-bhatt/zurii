// Phase 5: trip-plan context, image density cap, scroll memory and restoration.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  BUDGET_BANDS,
  normalisePlan,
  planContextLines,
  planFromSearchParams,
  planToQuery,
  readTripPlan,
  saveTripPlan,
  travellersCount,
  travellersLabel,
} from '../src/services/tripPlan.js';
import { capDensity } from '../src/utils/imageSizes.js';
import { createScrollMemory, jumpTo, restoreScroll } from '../src/utils/scrollMemory.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

describe('trip plan (ZT-26 / ZT-38)', () => {
  it('keeps only known choices, whatever the URL says', () => {
    assert.deepEqual(
      normalisePlan({ destination: 'Kerala', month: 'may', travellers: '3-4', budget: BUDGET_BANDS[1].label, duration: '4-6' }),
      { destination: 'kerala', month: 'May', travellers: '3-4', budget: BUDGET_BANDS[1].label, duration: '4-6' }
    );
    assert.deepEqual(
      normalisePlan({ destination: '../admin', month: 'Smarch', travellers: '999', budget: 'free', duration: '30' }),
      {},
      'nothing unexpected reaches an enquiry'
    );
  });

  it('round-trips through a URL and builds a Plan My Trip link', () => {
    const plan = planFromSearchParams(new URLSearchParams('destination=kashmir&month=October&travellers=2&q=ignored'));
    assert.deepEqual(plan, { destination: 'kashmir', month: 'October', travellers: '2' });
    assert.equal(planToQuery(plan), '?destination=kashmir&month=October&travellers=2');
    assert.equal(planToQuery({}), '');
  });

  it('merges into this tab’s saved plan and removes cleared fields', () => {
    const storage = memoryStorage();
    saveTripPlan({ destination: 'bali', month: 'June' }, storage);
    saveTripPlan({ travellers: '2', month: null }, storage);
    assert.deepEqual(readTripPlan(storage), { destination: 'bali', travellers: '2' });
    saveTripPlan({ destination: null, travellers: '' }, storage);
    assert.deepEqual(readTripPlan(storage), {});
    assert.deepEqual(readTripPlan({ getItem: () => '{not json' }), {}, 'a damaged record is ignored');
  });

  it('turns traveller ranges into a starting number and readable text', () => {
    assert.equal(travellersCount('3-4'), 3);
    assert.equal(travellersCount('7+'), 7);
    assert.equal(travellersCount(''), null);
    assert.equal(travellersLabel('1'), '1 traveller');
    assert.equal(travellersLabel('5-6'), '5–6 travellers');
  });

  it('writes the plan into the enquiry as labelled lines', () => {
    assert.deepEqual(planContextLines({ month: 'May', travellers: '3-4' }, { destinationName: 'Kerala' }), [
      'Destination: Kerala',
      'Preferred month: May',
      'Travellers: 3–4',
    ]);
  });
});

describe('image density cap', () => {
  it('adds a two-thirds slot for very dense screens in front of each entry', () => {
    assert.equal(
      capDensity('(min-width: 1024px) 400px, 85vw'),
      '(min-resolution: 2.5dppx) and (min-width: 1024px) calc(400px * 0.6667), (min-resolution: 2.5dppx) calc(85vw * 0.6667), (min-width: 1024px) 400px, 85vw'
    );
  });

  it('keeps calc() lengths and compound conditions intact', () => {
    const out = capDensity('(min-width: 640px) and (max-width: 1023px) calc(50vw - 2rem), 100vw');
    assert.ok(out.includes('(min-resolution: 2.5dppx) and ((min-width: 640px) and (max-width: 1023px)) calc(calc(50vw - 2rem) * 0.6667)'), out);
    assert.ok(out.endsWith('(min-width: 640px) and (max-width: 1023px) calc(50vw - 2rem), 100vw'), 'originals last, unchanged');
  });

  it('leaves auto and empty values alone', () => {
    assert.equal(capDensity('auto'), 'auto');
    assert.equal(capDensity(''), '');
    assert.equal(capDensity(undefined), undefined);
  });
});

describe('scroll restoration (ZT-24)', () => {
  it('remembers positions per history entry and survives a reload', () => {
    const storage = memoryStorage();
    const memory = createScrollMemory(storage, 3);
    memory.set('a', 1200);
    memory.set('b', 300.6);
    assert.equal(memory.get('b'), 301);
    const afterReload = createScrollMemory(storage, 3);
    assert.equal(afterReload.get('a'), 1200);
  });

  it('keeps only the most recent entries', () => {
    const memory = createScrollMemory(memoryStorage(), 2);
    memory.set('a', 1);
    memory.set('b', 2);
    memory.set('c', 3);
    assert.equal(memory.get('a'), undefined);
    assert.equal(memory.size(), 2);
  });

  it('retries until the page is tall enough, then stops', () => {
    let height = 900; // page grows as data arrives
    const win = {
      scrollY: 0,
      scrollTo(a, b) { const y = typeof a === 'object' ? a.top : b; this.calls.push(a); this.scrollY = Math.min(y, height); },
      calls: [],
    };
    const frames = [];
    restoreScroll(2000, { win, raf: (fn) => frames.push(fn), caf: () => {}, now: () => 0 });
    assert.equal(win.scrollY, 900);
    height = 1500;
    frames.shift()();
    assert.equal(win.scrollY, 1500);
    height = 5000;
    frames.shift()();
    assert.equal(win.scrollY, 2000);
    assert.equal(frames.length, 0, 'no more retries once restored');
    assert.ok(win.calls.every((c) => c.behavior === 'instant'), 'never glides (the site CSS sets smooth scrolling)');
  });

  it('jumps instantly, and falls back where "instant" is rejected', () => {
    const calls = [];
    jumpTo(0, { scrollTo: (...a) => calls.push(a) });
    assert.deepEqual(calls, [[{ top: 0, left: 0, behavior: 'instant' }]]);
    const old = [];
    jumpTo(40, { scrollTo: (...a) => { if (typeof a[0] === 'object') throw new TypeError('bad enum'); old.push(a); } });
    assert.deepEqual(old, [[0, 40]]);
  });

  it('gives up after the timeout, and on the visitor’s own input', () => {
    let t = 0;
    const win = { scrollY: 0, scrollTo() {} };
    const frames = [];
    restoreScroll(800, { win, raf: (fn) => frames.push(fn), caf: () => {}, now: () => t, timeoutMs: 100 });
    t = 150;
    frames.shift()();
    assert.equal(frames.length, 0);

    const listeners = {};
    const win2 = { scrollY: 0, scrollTo() {}, addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener() {} };
    const frames2 = [];
    restoreScroll(800, { win: win2, raf: (fn) => frames2.push(fn), caf: () => {}, now: () => 0 });
    listeners.wheel();
    frames2.shift()();
    assert.equal(frames2.length, 0, 'scrolling by hand cancels the restore');
  });
});

// ── departures: never advertise a past date as upcoming ──
import { departureStart, upcomingBatches } from '../src/utils/departures.js';

describe('upcoming departures', () => {
  it('reads the catalogue date formats', () => {
    assert.deepEqual(departureStart('Apr 25 – May 1, 2026'), new Date(2026, 3, 25));
    assert.deepEqual(departureStart('Dec 28 – Jan 3, 2027'), new Date(2026, 11, 28), 'crosses the new year');
    assert.deepEqual(departureStart('Sept 5, 2027 – Sept 9, 2027'), new Date(2027, 8, 5));
    assert.equal(departureStart('Flexible dates'), null);
    assert.equal(departureStart('Feb 30 – Mar 2, 2027'), null, 'impossible dates are not guessed');
  });

  it('keeps only departures from today on, in order', () => {
    const batches = [
      { date: 'Apr 25 – May 1, 2026' },
      { date: 'Nov 10 – Nov 15, 2026' },
      { date: 'Jan 4 – Jan 9, 2027' },
      { date: 'On request' },
    ];
    assert.deepEqual(upcomingBatches(batches, new Date(2026, 10, 10, 18)).map((b) => b.date), ['Nov 10 – Nov 15, 2026', 'Jan 4 – Jan 9, 2027']);
    assert.deepEqual(upcomingBatches(null), []);
  });
});

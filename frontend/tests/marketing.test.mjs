// Meta Pixel adapter, loader and consent store. Everything Meta-facing is a
// recording fake: no script is loaded and nothing leaves the process.
import { strict as assert } from 'node:assert';
import { beforeEach, describe, it } from 'node:test';

import { LEAD_FORMS, createMarketingTracker, isAdminPath } from '../src/services/marketingCore.js';
import {
  META_PIXEL_SCRIPT_ID,
  META_PIXEL_SCRIPT_SRC,
  clearMetaCookies,
  loadMetaPixel,
  resetMetaPixelForTests,
  sendMetaPixelEvent,
  setMetaPixelConsent,
} from '../src/services/metaPixel.js';

const PIXEL_ID = '4858424197723199';
const ALLOWED_PARAMS = new Set(['content_type', 'content_ids', 'content_category']);

/** A tracker wired to fakes; `world.path` is the current pathname. */
function setup({ consent = 'unset', pixelId = PIXEL_ID, path = '/' } = {}) {
  const world = { consent, path, loads: 0, sent: [], consentCalls: [], forgets: 0, firstParty: [], listeners: [] };
  const tracker = createMarketingTracker({
    pixelId,
    getConsent: () => world.consent,
    subscribeConsent: (fn) => {
      world.listeners.push(fn);
      return () => {};
    },
    pixel: {
      load: () => {
        world.loads += 1;
        return true;
      },
      setConsent: (granted) => world.consentCalls.push(granted),
      send: (name, params) => {
        world.sent.push({ name, params });
        return true;
      },
      forget: () => {
        world.forgets += 1;
      },
    },
    trackFirstParty: (type, payload) => world.firstParty.push({ type, payload }),
    currentPath: () => world.path,
  });
  world.setConsent = (choice) => {
    world.consent = choice;
    for (const fn of world.listeners) fn(choice);
  };
  world.go = (path) => {
    world.path = path;
    tracker.trackPageView(path);
  };
  return { tracker, world };
}

const names = (world) => world.sent.map((e) => e.name);

describe('consent gating', () => {
  it('sends nothing and loads nothing before consent', () => {
    for (const consent of ['unset', 'denied']) {
      const { tracker, world } = setup({ consent, path: '/trip/bali' });
      tracker.trackPageView('/trip/bali');
      tracker.trackViewContent('package', 'bali');
      tracker.trackSearchPerformed('q:bali');
      tracker.trackLead(LEAD_FORMS.trip);
      tracker.trackWhatsAppClick('footer');
      assert.equal(world.loads, 0, consent);
      assert.deepEqual(world.sent, [], consent);
    }
  });

  it('never loads without a Pixel ID, even with consent', () => {
    const { tracker, world } = setup({ consent: 'granted', pixelId: '' });
    tracker.trackPageView('/');
    tracker.trackLead(LEAD_FORMS.contact);
    assert.equal(world.loads, 0);
    assert.deepEqual(world.sent, []);
  });

  it('accepting on a loaded page tracks that page at once, including its content view', () => {
    const { tracker, world } = setup({ path: '/trip/bali-escape' });
    tracker.trackPageView('/trip/bali-escape');
    tracker.trackViewContent('package', 'bali-escape');
    assert.deepEqual(world.sent, []);

    world.setConsent('granted');
    assert.deepEqual(names(world), ['PageView', 'ViewContent']);
    assert.deepEqual(world.sent[1].params.content_ids, ['bali-escape']);
  });

  it('does not replay content from a page the visitor already left', () => {
    const { tracker, world } = setup({ path: '/trip/bali-escape' });
    tracker.trackViewContent('package', 'bali-escape');
    world.go('/packages');
    world.setConsent('granted');
    assert.deepEqual(names(world), ['PageView']);
  });

  it('withdrawal stops events, revokes the Pixel and removes its cookies', () => {
    const { tracker, world } = setup({ consent: 'granted', path: '/' });
    world.go('/');
    world.setConsent('denied');
    assert.deepEqual(world.consentCalls.at(-1), false);
    assert.equal(world.forgets, 1);

    const before = world.sent.length;
    world.go('/packages');
    tracker.trackLead(LEAD_FORMS.contact);
    tracker.trackWhatsAppClick('footer');
    assert.equal(world.sent.length, before, 'nothing may be sent after withdrawal');
  });

  it('re-granting counts the current page again', () => {
    const { world } = setup({ consent: 'granted' });
    world.go('/about');
    world.setConsent('denied');
    world.setConsent('granted');
    assert.deepEqual(names(world), ['PageView', 'PageView']);
  });
});

describe('PageView', () => {
  it('fires once per route: no duplicates from re-renders or StrictMode', () => {
    const { tracker, world } = setup({ consent: 'granted' });
    world.go('/packages');
    tracker.trackPageView('/packages');
    tracker.trackPageView('/packages');
    assert.deepEqual(names(world), ['PageView']);
    assert.equal(world.loads >= 1, true);
  });

  it('tracks client-side navigation and back/forward to a different path', () => {
    const { world } = setup({ consent: 'granted' });
    world.go('/');
    world.go('/packages');
    world.go('/trip/bali');
    world.go('/packages'); // browser back
    assert.deepEqual(names(world), ['PageView', 'PageView', 'PageView', 'PageView']);
  });

  it('never tracks or loads on admin routes, and pauses a Pixel loaded earlier', () => {
    const fresh = setup({ consent: 'granted', path: '/admin/insights' });
    fresh.world.go('/admin/insights');
    assert.equal(fresh.world.loads, 0);
    assert.deepEqual(fresh.world.sent, []);

    const { tracker, world } = setup({ consent: 'granted' });
    world.go('/');
    world.go('/admin/analytics');
    tracker.trackLead(LEAD_FORMS.contact);
    assert.deepEqual(names(world), ['PageView']);
    assert.equal(world.consentCalls.at(-1), false, 'the loaded Pixel is told to hold');

    world.go('/packages');
    assert.equal(world.consentCalls.at(-1), true);
    assert.deepEqual(names(world), ['PageView', 'PageView']);
  });

  it('recognises admin paths', () => {
    for (const path of ['/admin', '/admin/', '/admin/insights', '/dashboard', '/ADMIN/analytics']) {
      assert.equal(isAdminPath(path), true, path);
    }
    for (const path of ['/', '/administrative-tours', '/trip/admin', '/packages']) {
      assert.equal(isAdminPath(path), false, path);
    }
  });
});

describe('conversion events', () => {
  let tracker;
  let world;
  beforeEach(() => {
    ({ tracker, world } = setup({ consent: 'granted', path: '/plan-my-trip' }));
  });

  it('Lead is sent only for the three known forms, with the form label only', () => {
    tracker.trackLead(LEAD_FORMS.plan);
    tracker.trackLead(LEAD_FORMS.trip);
    tracker.trackLead(LEAD_FORMS.contact);
    tracker.trackLead('checkout');
    tracker.trackLead(undefined);
    assert.deepEqual(world.sent, [
      { name: 'Lead', params: { content_category: 'plan_my_trip' } },
      { name: 'Lead', params: { content_category: 'trip_enquiry' } },
      { name: 'Lead', params: { content_category: 'contact' } },
    ]);
  });

  it('a WhatsApp click is Contact, never Lead, and keeps first-party tracking', () => {
    tracker.trackWhatsAppClick('trip_sidebar', {
      context: 'package', entityType: 'package', entityId: 7, entitySlug: 'bali-escape',
    });
    assert.deepEqual(world.sent, [
      { name: 'Contact', params: { content_category: 'trip_sidebar', content_ids: ['bali-escape'] } },
    ]);
    assert.deepEqual(world.firstParty, [
      {
        type: 'whatsapp_click',
        payload: {
          entityType: 'package', entityId: 7, entitySlug: 'bali-escape',
          meta: { context: 'package', placement: 'trip_sidebar' },
        },
      },
    ]);
  });

  it('records the first-party WhatsApp event even without marketing consent', () => {
    const declined = setup({ consent: 'denied' });
    declined.tracker.trackWhatsAppClick('footer');
    assert.equal(declined.world.firstParty.length, 1);
    assert.deepEqual(declined.world.sent, []);
  });

  it('Search sends no search text and drops consecutive repeats', () => {
    tracker.trackSearchPerformed('q:my phone is 98765 43210');
    tracker.trackSearchPerformed('q:my phone is 98765 43210');
    tracker.trackSearchPerformed('filters:destination=bali');
    assert.deepEqual(world.sent, [
      { name: 'Search', params: { content_category: 'packages' } },
      { name: 'Search', params: { content_category: 'packages' } },
    ]);
  });

  it('ViewContent fires once per page for packages and destinations only', () => {
    world.path = '/trip/bali-escape';
    tracker.trackViewContent('package', 'bali-escape');
    tracker.trackViewContent('package', 'bali-escape');
    world.path = '/destination/bali';
    tracker.trackViewContent('destination', 'bali');
    tracker.trackViewContent('blog', 'post');
    assert.deepEqual(names(world), ['ViewContent', 'ViewContent']);
  });

  it('ViewContent counts again when the visitor comes back to the page', () => {
    world.go('/trip/bali-escape');
    tracker.trackViewContent('package', 'bali-escape');
    world.go('/packages');
    world.go('/trip/bali-escape'); // browser back
    tracker.trackViewContent('package', 'bali-escape');
    tracker.trackViewContent('package', 'bali-escape'); // re-render on the same visit
    assert.deepEqual(names(world).filter((n) => n === 'ViewContent'), ['ViewContent', 'ViewContent']);
  });

  it('only ever sends catalogue identifiers and fixed labels', () => {
    world.go('/trip/x');
    tracker.trackViewContent('package', 'x');
    tracker.trackSearchPerformed('q:anything');
    tracker.trackLead(LEAD_FORMS.trip);
    tracker.trackWhatsAppClick('footer');
    for (const { params } of world.sent) {
      for (const key of Object.keys(params ?? {})) assert.ok(ALLOWED_PARAMS.has(key), `unexpected parameter ${key}`);
    }
  });
});

describe('Meta Pixel loader', () => {
  function fakeBrowser() {
    const appended = [];
    const cookies = [];
    const doc = {
      head: { appendChild: (el) => appended.push(el) },
      createElement: (tag) => ({ tag }),
      getElementById: (id) => appended.find((el) => el.id === id) ?? null,
      set cookie(value) {
        cookies.push(value);
      },
    };
    return { win: {}, doc, appended, cookies };
  }

  beforeEach(() => resetMetaPixelForTests());

  it('sends nothing before it is loaded', () => {
    const { win } = fakeBrowser();
    assert.equal(sendMetaPixelEvent('PageView', undefined, { win }), false);
  });

  it('installs the base code once: autoConfig off, no advanced matching, no history auto-tracking', () => {
    const { win, doc, appended } = fakeBrowser();
    assert.equal(loadMetaPixel(PIXEL_ID, { win, doc }), true);
    assert.equal(loadMetaPixel(PIXEL_ID, { win, doc }), true);

    assert.equal(appended.length, 1, 'one script element');
    assert.equal(appended[0].src, META_PIXEL_SCRIPT_SRC);
    assert.equal(appended[0].id, META_PIXEL_SCRIPT_ID);
    assert.equal(appended[0].async, true);
    assert.equal(win.fbq.disablePushState, true);
    // Without it fbevents.js drops every SPA PageView after the first (seen with the real library).
    assert.equal(win.fbq.allowDuplicatePageViews, true);
    assert.deepEqual(win.fbq.queue, [
      ['set', 'autoConfig', false, PIXEL_ID],
      ['init', PIXEL_ID],
    ], 'init exactly once, with the ID alone');
  });

  it('survives a re-evaluated module without a second init', () => {
    const { win, doc } = fakeBrowser();
    loadMetaPixel(PIXEL_ID, { win, doc });
    resetMetaPixelForTests();
    loadMetaPixel(PIXEL_ID, { win, doc });
    assert.equal(win.fbq.queue.filter((call) => call[0] === 'init').length, 1);
  });

  it('queues events and consent changes through fbq', () => {
    const { win, doc } = fakeBrowser();
    loadMetaPixel(PIXEL_ID, { win, doc });
    sendMetaPixelEvent('PageView', undefined, { win });
    sendMetaPixelEvent('Lead', { content_category: 'contact' }, { win });
    setMetaPixelConsent(false, { win });
    assert.deepEqual(win.fbq.queue.slice(2), [
      ['track', 'PageView'],
      ['track', 'Lead', { content_category: 'contact' }],
      ['consent', 'revoke'],
    ]);
  });

  it('does nothing for an empty Pixel ID', () => {
    const { win, doc, appended } = fakeBrowser();
    assert.equal(loadMetaPixel('', { win, doc }), false);
    assert.equal(appended.length, 0);
    assert.equal(win.fbq, undefined);
  });

  it('expires _fbp and _fbc on the host and every parent domain', () => {
    const { doc, cookies } = fakeBrowser();
    clearMetaCookies({ doc, hostname: 'www.zurii.example' });
    for (const name of ['_fbp', '_fbc']) {
      for (const domain of ['', '; domain=.www.zurii.example', '; domain=.zurii.example']) {
        assert.ok(cookies.includes(`${name}=; Max-Age=0; path=/${domain}`), `${name}${domain}`);
      }
    }
  });
});

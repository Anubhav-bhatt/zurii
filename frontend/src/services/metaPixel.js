/**
 * Meta Pixel loader: the approved base code, run only after marketing consent
 * (services/marketing.js decides when).
 *
 * Deliberate differences from the pasted snippet:
 *   - Inserted into <head> on demand; never present in index.html.
 *   - fbq.disablePushState = true. fbevents.js otherwise sends its own
 *     PageView on every history.pushState, double-counting the React Router
 *     listener.
 *   - fbq.allowDuplicatePageViews = true. With pushState tracking off, the
 *     React Router listener sends each navigation's PageView itself, and
 *     fbevents.js silently drops every PageView after the first one of a page
 *     load unless this is set — so SPA navigations never reached Meta (found
 *     with the real library in the final audit; a recording stub cannot show
 *     it). marketingCore still sends one PageView per pathname, so this does
 *     not create duplicates.
 *   - autoConfig off: no automatic button-click or page-metadata collection,
 *     so form fields are never picked up automatically.
 *   - init() is called with the ID alone: no advanced matching, no user data.
 *   - No <noscript> image. The site needs JavaScript anyway, and that image
 *     would fire without consent.
 */
export const META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
export const META_PIXEL_SCRIPT_ID = 'zurii-meta-pixel';

let initializedId = null;

/** Install the base-code queue stub, init the Pixel and add fbevents.js — once. */
export function loadMetaPixel(pixelId, { win = window, doc = document } = {}) {
  if (!pixelId) return false;
  if (initializedId) return true;
  // Survives a re-evaluated module (dev hot reload): init runs once per page.
  if (win.__zuriiMetaPixelId === pixelId) {
    initializedId = pixelId;
    return true;
  }

  if (!win.fbq) {
    // The base code's stub: calls queue up until fbevents.js replaces it.
    const fbq = function (...args) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(args);
    };
    win.fbq = fbq;
    if (!win._fbq) win._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
  }

  win.fbq.disablePushState = true;
  win.fbq.allowDuplicatePageViews = true;
  win.fbq('set', 'autoConfig', false, pixelId);
  win.fbq('init', pixelId);

  if (!doc.getElementById(META_PIXEL_SCRIPT_ID)) {
    const script = doc.createElement('script');
    script.id = META_PIXEL_SCRIPT_ID;
    script.async = true;
    script.src = META_PIXEL_SCRIPT_SRC;
    doc.head.appendChild(script);
  }
  initializedId = pixelId;
  win.__zuriiMetaPixelId = pixelId;
  return true;
}

/**
 * Remove the Pixel's first-party cookies (_fbp, _fbc) after consent is
 * withdrawn. They are set on the site's registrable domain, which is not known
 * here, so every parent domain of the current host is tried.
 */
export function clearMetaCookies({ doc = document, hostname = window.location.hostname } = {}) {
  const labels = String(hostname).split('.');
  const domains = [''];
  for (let i = 0; i < labels.length - 1; i += 1) domains.push(`.${labels.slice(i).join('.')}`);
  for (const name of ['_fbp', '_fbc']) {
    for (const domain of domains) {
      doc.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ''}`;
    }
  }
}

export function isMetaPixelLoaded() {
  return initializedId !== null;
}

/** Meta's own consent switch, so a loaded Pixel also stops on withdrawal. */
export function setMetaPixelConsent(granted, { win = window } = {}) {
  if (initializedId && typeof win.fbq === 'function') win.fbq('consent', granted ? 'grant' : 'revoke');
}

export function sendMetaPixelEvent(name, params, { win = window } = {}) {
  if (!initializedId || typeof win.fbq !== 'function') return false;
  if (params) win.fbq('track', name, params);
  else win.fbq('track', name);
  return true;
}

/** Tests only: forget the loaded state between cases. */
export function resetMetaPixelForTests() {
  initializedId = null;
}

/**
 * Meta Pixel adapter: asks the base code in index.html <head> to start the
 * Pixel, only after marketing consent (services/marketing.js decides when),
 * then sends the approved events through its fbq.
 *
 * index.html defines window.zuriiInitMetaPixel(id), the ONLY initialization
 * path: the official base code wrapped in a function, so nothing is defined,
 * loaded or sent until consent. On its first call it:
 *   - installs the fbq queue stub and adds fbevents.js (id zurii-meta-pixel);
 *   - sets fbq.disablePushState = true. fbevents.js otherwise sends its own
 *     PageView on every history.pushState, double-counting the React Router
 *     listener;
 *   - sets fbq.allowDuplicatePageViews = true. With pushState tracking off, the
 *     React Router listener sends each navigation's PageView itself, and
 *     fbevents.js silently drops every PageView after the first one of a page
 *     load unless this is set (found with the real library in an audit).
 *     marketingCore still sends one PageView per pathname, so this does not
 *     create duplicates;
 *   - turns autoConfig off (no automatic button-click or page-metadata
 *     collection, so form fields are never picked up automatically);
 *   - inits with the Pixel ID alone (no advanced matching, no user data).
 * It sends no PageView itself and there is no noscript image: both would
 * track without consent.
 *
 * The previous loader here installed that same base code itself. It is
 * removed, so the Pixel can only be initialized from index.html.
 */
/** What the index.html base code loads; kept here for tests and reference. */
export const META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
export const META_PIXEL_SCRIPT_ID = 'zurii-meta-pixel';
export const META_PIXEL_INIT_FUNCTION = 'zuriiInitMetaPixel';

let initializedId = null;

/**
 * Start the Pixel through the index.html initializer — once per page. Returns
 * false (nothing loaded, nothing sent) when there is no ID or the page has no
 * initializer.
 */
export function loadMetaPixel(pixelId, { win = window } = {}) {
  if (!pixelId) return false;
  if (initializedId) return true;
  const init = win[META_PIXEL_INIT_FUNCTION];
  if (typeof init !== 'function') return false;
  // The initializer itself refuses to init twice, so a re-evaluated module
  // (dev hot reload) just picks up the Pixel that is already running.
  if (!init(pixelId)) return false;
  initializedId = pixelId;
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

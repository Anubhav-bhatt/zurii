/**
 * The tracking adapter: the only place conversion events are sent to Meta.
 * Built by a factory so it can be tested without a browser or Vite;
 * services/marketing.js wires the real dependencies.
 *
 *   Public page viewed                  PageView     trackPageView (route listener)
 *   Package or destination page loaded  ViewContent  trackViewContent
 *   Search committed on /packages       Search       trackSearchPerformed
 *   Enquiry saved by the API            Lead         trackLead
 *   WhatsApp button clicked             Contact      trackWhatsAppClick
 *
 * Nothing is sent unless a Pixel ID is configured, the visitor has granted
 * marketing consent and the page is not an admin page. Parameters are public
 * catalogue identifiers and fixed labels only: no names, phone numbers,
 * emails, messages or search text.
 */

export const LEAD_FORMS = Object.freeze({
  trip: 'trip_enquiry',
  plan: 'plan_my_trip',
  contact: 'contact',
});

const LEAD_FORM_VALUES = new Set(Object.values(LEAD_FORMS));

export const isAdminPath = (pathname = '') => /^\/(admin|dashboard)(\/|$)/i.test(pathname);

/**
 * @param {object} deps
 * @param {string} deps.pixelId
 * @param {() => string} deps.getConsent        'granted' | 'denied' | 'unset'
 * @param {(fn: (choice: string) => void) => () => void} deps.subscribeConsent
 * @param {{ load(id: string): boolean, setConsent(granted: boolean): void,
 *           send(name: string, params?: object): boolean, forget(): void }} deps.pixel
 * @param {(type: string, payload: object) => void} deps.trackFirstParty
 * @param {() => string} deps.currentPath
 */
export function createMarketingTracker({ pixelId, getConsent, subscribeConsent, pixel, trackFirstParty, currentPath }) {
  let lastPageViewPath = null;
  let lastRoutePath = null;
  let lastViewContentKey = null;
  let lastSearchKey = null;
  let pausedForAdmin = false;
  // The content shown on the current page, so a consent given after the page
  // loaded can still count the view the visitor is looking at.
  let currentContent = null;

  function ready(pathname = currentPath()) {
    if (!pixelId || getConsent() !== 'granted' || isAdminPath(pathname)) return false;
    return pixel.load(pixelId);
  }

  function trackPageView(pathname = currentPath()) {
    if (isAdminPath(pathname)) {
      // An already-loaded Pixel is told to hold everything while an admin
      // page is open; nothing from these pages is ever tracked.
      if (!pausedForAdmin) pixel.setConsent(false);
      pausedForAdmin = true;
      lastPageViewPath = null;
      return false;
    }
    if (pausedForAdmin) {
      pausedForAdmin = false;
      if (getConsent() === 'granted') pixel.setConsent(true);
    }
    // A new route is a new view of whatever content it shows: coming back to
    // a trip page counts again, while repeats on the same visit do not.
    if (pathname !== lastRoutePath) {
      lastRoutePath = pathname;
      lastViewContentKey = null;
    }
    // One PageView per route: re-renders, StrictMode's double effects and
    // query-string updates (filters, sorting) on the same page are not new
    // page views. Back/forward to a different path is.
    if (pathname === lastPageViewPath || !ready(pathname)) return false;
    lastPageViewPath = pathname;
    return pixel.send('PageView');
  }

  function trackViewContent(kind, slug) {
    if (!slug || (kind !== 'package' && kind !== 'destination')) return false;
    const path = currentPath();
    currentContent = { path, kind, slug };
    const key = `${path}|${kind}:${slug}`;
    if (key === lastViewContentKey || !ready(path)) return false;
    lastViewContentKey = key;
    return pixel.send('ViewContent', {
      content_type: kind === 'package' ? 'product' : 'product_group',
      content_ids: [String(slug)],
      content_category: kind,
    });
  }

  /** `searchKey` only de-duplicates repeats of the same search; it is never sent. */
  function trackSearchPerformed(searchKey) {
    if (!searchKey || searchKey === lastSearchKey || !ready()) return false;
    lastSearchKey = searchKey;
    return pixel.send('Search', { content_category: 'packages' });
  }

  /** Call only after the API has confirmed the enquiry was saved. */
  function trackLead(form) {
    if (!LEAD_FORM_VALUES.has(form) || !ready()) return false;
    return pixel.send('Lead', { content_category: form });
  }

  /**
   * A WhatsApp click is a contact attempt, not a lead. Also records the
   * first-party `whatsapp_click` event (anonymous, not consent-gated, as
   * before), keeping the package fields the trip page always sent with it.
   *
   * @param {string} placement  fixed label of the button, e.g. 'footer'
   * @param {{ context?: string, entityType?: string, entityId?: number, entitySlug?: string }} [details]
   */
  function trackWhatsAppClick(placement, { context = 'general', entityType, entityId, entitySlug } = {}) {
    trackFirstParty('whatsapp_click', {
      ...(entityType ? { entityType, entityId, entitySlug } : {}),
      meta: { context, placement },
    });
    if (!ready()) return false;
    return pixel.send('Contact', {
      content_category: placement,
      ...(entityType === 'package' && entitySlug ? { content_ids: [String(entitySlug)] } : {}),
    });
  }

  subscribeConsent((choice) => {
    if (choice === 'granted') {
      // Accepting takes effect on the current page straight away: its
      // PageView, and its ViewContent when it is a package or destination.
      const path = currentPath();
      pixel.setConsent(true);
      trackPageView(path);
      if (currentContent?.path === path) trackViewContent(currentContent.kind, currentContent.slug);
    } else {
      // Withdrawal stops the loaded Pixel, removes its cookies, and forgets
      // what was sent, so a later yes counts the page it is given on.
      pixel.setConsent(false);
      pixel.forget();
      lastPageViewPath = null;
      lastViewContentKey = null;
      lastSearchKey = null;
    }
  });

  return { trackPageView, trackViewContent, trackSearchPerformed, trackLead, trackWhatsAppClick };
}

/**
 * The site's tracking adapter, wired to the real consent store, Meta Pixel
 * loader and first-party analytics. See services/marketingCore.js for the
 * event mapping and the rules every event follows.
 */
import { META_PIXEL_ID } from '../config/marketing';
import { track } from './analytics';
import { getMarketingConsent, subscribeConsent } from './consent';
import { clearMetaCookies, loadMetaPixel, sendMetaPixelEvent, setMetaPixelConsent } from './metaPixel';
import { createMarketingTracker } from './marketingCore';

export { LEAD_FORMS, isAdminPath } from './marketingCore';

const tracker = createMarketingTracker({
  pixelId: META_PIXEL_ID,
  getConsent: getMarketingConsent,
  subscribeConsent,
  pixel: {
    load: (id) => loadMetaPixel(id),
    setConsent: (granted) => setMetaPixelConsent(granted),
    send: (name, params) => sendMetaPixelEvent(name, params),
    forget: () => clearMetaCookies(),
  },
  trackFirstParty: track,
  currentPath: () => window.location.pathname,
});

export const { trackPageView, trackViewContent, trackSearchPerformed, trackLead, trackWhatsAppClick } = tracker;

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { isAdminPath, trackPageView } from '../../services/marketing';
import { isMetaPixelLoaded } from '../../services/metaPixel';

/**
 * The single Meta PageView listener. Runs on the first page and on every
 * pathname change, including back/forward. Query-string changes (filters,
 * sorting) are not page views, and services/marketingCore.js drops repeats,
 * so StrictMode's double effects cannot double-count.
 *
 * Rendered before the routes so its effect runs ahead of a page's own
 * ViewContent effect in the same commit.
 */
export default function MarketingRouteTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Meta's code must never run on admin pages. If it was loaded on a public
    // page earlier in this visit, a full reload gives the admin area a clean
    // page; it is never loaded there afterwards (marketingCore refuses).
    if (isAdminPath(pathname) && isMetaPixelLoaded()) {
      window.location.reload();
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  return null;
}

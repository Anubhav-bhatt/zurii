import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

import { createScrollMemory, jumpTo, restoreScroll } from '../utils/scrollMemory';

const memory = createScrollMemory();

/**
 * Scroll behaviour for every route change (ZT-24):
 *
 *   new page (link, PUSH/REPLACE)  → top of the page, or the #anchor
 *   Back / Forward (POP)           → where the visitor was on that entry,
 *                                    retried while the page's data loads
 *   same page, new query string    → stays put (filters, sorting, search)
 *
 * The browser's own restoration is switched off: in a single-page app it fires
 * before the content exists, so it lands at the top of a half-rendered list.
 */
export default function ScrollToTop() {
  const { key, pathname, hash } = useLocation();
  const navType = useNavigationType();
  const lastPath = useRef(null);
  const currentKey = useRef(key);

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  // Remember the current entry's position as the visitor scrolls. The entry is
  // read from a ref that the commit below updates, not captured per key: a
  // listener tied to the old key stays attached until React runs passive
  // effects — after paint for a route change — so the jump to the top of the
  // new page used to be filed under the list the visitor had just left, and
  // Back then returned to 0.
  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => memory.set(currentKey.current, window.scrollY));
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => {
      window.removeEventListener('scroll', save);
      cancelAnimationFrame(frame);
    };
  }, []);

  useLayoutEffect(() => {
    currentKey.current = key;
    const samePage = lastPath.current === pathname;
    lastPath.current = pathname;
    if (navType === 'POP') return restoreScroll(memory.get(key) ?? 0);
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return undefined;
      }
    }
    if (!samePage) jumpTo(0);
    return undefined;
  }, [key, pathname, hash, navType]);

  return null;
}

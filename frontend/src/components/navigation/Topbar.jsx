import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import DesktopNavigation from './DesktopNavigation';
import MobileNavigation from './MobileNavigation';
import NavigationActions from './NavigationActions';
import SearchOverlay from './SearchOverlay';
import Container from '../ui/Container';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getDestinationsCached } from '../../services/destinationsApi';

/**
 * Header shell.
 *
 * This file used to be 1,153 lines containing the desktop row, four mega-menus,
 * the mobile menu and a client-side search over a 3,700-line data object. It now
 * owns only three things — scroll state, which overlay is open, and the shared
 * destinations fetch — and composes DesktopNavigation, MobileNavigation,
 * NavigationActions and SearchOverlay.
 *
 * On the homepage the header starts transparent over the hero and fades to solid
 * once scrolled; everywhere else it is solid immediately, so text always has a
 * readable background.
 */

const SCROLL_THRESHOLD = 24;

export default function Topbar() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const menuTriggerRef = useRef(null);

  /**
   * Which overlay is open, and the route it was opened on. Deriving `open` from
   * a route comparison means navigating closes both overlays automatically —
   * no effect that resets state after the route changes.
   */
  const routeKey = `${location.pathname}${location.search}`;
  const [overlay, setOverlay] = useState({ kind: null, route: null });

  const menuOpen = overlay.kind === 'menu' && overlay.route === routeKey;
  const searchOpen = overlay.kind === 'search' && overlay.route === routeKey;

  const openOverlay = (kind) => setOverlay({ kind, route: routeKey });
  const closeOverlay = () => setOverlay({ kind: null, route: null });

  // Only the homepage has a hero for the header to sit over.
  const overHero = location.pathname === '/';
  const transparent = overHero && !scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ⌘K (macOS), Ctrl+K (Windows/Linux) or '/' opens global search.
  useEffect(() => {
    const onKeyDown = (event) => {
      const activeEl = document.activeElement;
      const isTyping =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeEl?.tagName) ||
        activeEl?.isContentEditable;

      const isCmdK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !isTyping;

      if (isCmdK || isSlash) {
        event.preventDefault();
        setOverlay({ kind: 'search', route: `${window.location.pathname}${window.location.search}` });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data: destinations, loading } = useAsyncData(() => getDestinationsCached(), ['nav-destinations']);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-[60] transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
          transparent
            ? 'bg-transparent'
            : 'bg-white/90 dark:bg-zinc-900/90 dark:border-b dark:border-zinc-800/80 shadow-sm backdrop-blur-md'
        }`}
      >
        <Container className="flex h-16 items-center justify-between gap-4 sm:h-[68px]">
          <Link
            to="/"
            className="shrink-0 rounded-lg"
            aria-label="Zurii — home"
          >
            <img
              src="/zurii-logo.png"
              alt="Zurii"
              width="112"
              height="36"
              /* No invert: this asset is a coloured mark on an opaque white
                 background, so inverting it produced a featureless white box
                 and the brand disappeared over the hero. */
              className="h-8 w-auto rounded-md sm:h-9"
            />
          </Link>

          <DesktopNavigation
            destinations={destinations ?? []}
            loadingDestinations={loading}
            onDark={transparent}
          />

          {/* The ref goes to the hamburger button itself: MobileNavigation
              restores focus to it on close, and a `display: contents` wrapper
              has no box, so focus() on it would silently do nothing. */}
          <NavigationActions
            onOpenSearch={() => openOverlay('search')}
            onOpenMenu={() => openOverlay('menu')}
            menuOpen={menuOpen}
            onDark={transparent}
            menuButtonRef={menuTriggerRef}
          />
        </Container>
      </header>

      <MobileNavigation
        open={menuOpen}
        onClose={closeOverlay}
        destinations={destinations ?? []}
        triggerRef={menuTriggerRef}
      />

      <SearchOverlay open={searchOpen} onClose={closeOverlay} />
    </>
  );
}

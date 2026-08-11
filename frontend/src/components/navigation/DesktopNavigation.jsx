import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';

import DestinationMenu from './DestinationMenu';

/**
 * Desktop navigation row.
 *
 * Only one item has a dropdown (Destinations); the rest are plain links, so
 * there is no mega-menu machinery to maintain. The dropdown closes on outside
 * click, on Escape, and when focus leaves the group — which is what makes it
 * usable by keyboard as well as mouse.
 *
 * Every target is a route that exists: /packages with a tag filter for the
 * India / International entries, and real pages for About and Contact.
 */

const LINKS = [
  { label: 'International', to: '/packages?tag=international' },
  { label: 'India', to: '/packages?tag=domestic' },
  { label: 'Packages', to: '/packages' },
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact-us' },
];

export default function DesktopNavigation({ destinations, loadingDestinations, onDark }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const groupRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event) => {
      if (!groupRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const linkBase =
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2';
  const linkTone = onDark
    ? 'text-white/85 hover:bg-white/10 hover:text-white focus-visible:ring-white'
    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-white focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100';
  const activeTone = onDark ? 'bg-white/15 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white';

  return (
    <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
      <div
        ref={groupRef}
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
        }}
      >
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-haspopup="true"
          className={`${linkBase} ${linkTone} inline-flex items-center gap-1.5`}
        >
          Destinations
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-3.5 w-3.5 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`}
          >
            <path d="M5.5 7.5L10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute left-0 top-full z-50 mt-2 w-[min(46rem,calc(100vw-4rem))] overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl animate-fade-slide-up">
            <DestinationMenu
              destinations={destinations}
              loading={loadingDestinations}
              onNavigate={() => setMenuOpen(false)}
            />
          </div>
        )}
      </div>

      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `${linkBase} ${linkTone} ${isActive ? activeTone : ''}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

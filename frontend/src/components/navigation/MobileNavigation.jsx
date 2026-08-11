import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import Button from '../ui/Button';
import ThemeToggle from '../ui/ThemeToggle';
import { SITE } from '../../config/site';

const PRIMARY_LINKS = [
  { label: 'All Packages', to: '/packages' },
  { label: 'International Trips', to: '/packages?tag=international' },
  { label: 'India Trips', to: '/packages?tag=domestic' },
  { label: 'Saved Trips', to: '/wishlist' },
  { label: 'About Zurii', to: '/about' },
  { label: 'Contact', to: '/contact-us' },
];

const SECONDARY_LINKS = [
  { label: 'Weekend Trips', to: '/weekend-trips' },
  { label: 'Corporate Tours', to: '/corporate-tours' },
  { label: 'Blogs', to: '/blogs' },
];

export default function MobileNavigation({ open, onClose, destinations = [], triggerRef }) {
  const panelRef = useRef(null);
  const [expanded, setExpanded] = useState(null);

  const domestic = destinations.filter((d) => d.kind === 'domestic');
  const international = destinations.filter((d) => d.kind === 'international');

  const groups = [
    { key: 'india', label: 'Destinations in India', items: domestic },
    { key: 'international', label: 'International Destinations', items: international },
  ];

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef?.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      // aria-modal promises the page behind is unreachable; make Tab honour it.
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll(
          'a[href], button, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const focusTimer = setTimeout(() => {
      panelRef.current?.querySelector('button, a')?.focus();
    }, 30);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      trigger?.focus?.();
    };
  }, [open, onClose, triggerRef]);

  if (!open) return null;

  const row =
    'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-zinc-800 dark:text-zinc-200 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100';

  return (
    <div className="fixed inset-0 z-[65] lg:hidden" role="dialog" aria-modal="true" aria-label="Site menu">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/50 backdrop-blur-sm animate-backdrop-in"
      />

      <div
        ref={panelRef}
        className="absolute right-0 top-0 flex h-[100dvh] w-[min(22rem,88vw)] flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
          <Link to="/" onClick={onClose} className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100">
            <img src="/zurii-logo.png" alt="Zurii" className="h-8 w-auto dark:brightness-110" />
          </Link>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrolling content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          <ul className="space-y-0.5">
            {PRIMARY_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} onClick={onClose} className={row}>
                  {link.label}
                  <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="my-3 border-t border-zinc-100 dark:border-zinc-800" />

          {groups.map((group) => {
            const isOpen = expanded === group.key;
            return (
              <div key={group.key} className="mb-1">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : group.key)}
                  aria-expanded={isOpen}
                  className={row}
                >
                  <span>
                    {group.label}
                    {group.items.length > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-zinc-400 dark:text-zinc-500">({group.items.length})</span>
                    )}
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
                  </svg>
                </button>

                {isOpen && (
                  <ul className="mb-2 mt-0.5 space-y-0.5 border-l border-zinc-100 dark:border-zinc-800 pl-3">
                    {group.items.length === 0 && (
                      <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">Loading destinations…</li>
                    )}
                    {group.items.map((destination) => (
                      <li key={destination.slug}>
                        <Link
                          to={`/destination/${destination.slug}`}
                          onClick={onClose}
                          className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg px-3 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-zinc-100"
                        >
                          <span className="truncate">{destination.name}</span>
                          {destination.packageCount > 0 && (
                            <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{destination.packageCount}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          <div className="my-3 border-t border-zinc-100 dark:border-zinc-800" />

          <ul className="space-y-0.5">
            {SECONDARY_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to} onClick={onClose} className={`${row} text-[14px] text-zinc-600 dark:text-zinc-400`}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Sticky footer CTA */}
        <div className="shrink-0 border-t border-zinc-100 dark:border-zinc-800 p-3 pb-safe">
          <Button to="/plan-my-trip" variant="accent" size="lg" className="w-full" onClick={onClose}>
            Plan My Trip
          </Button>
          <p className="mt-2.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
            or call{' '}
            <a href={SITE.phones[0].href} className="font-semibold text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white">
              {SITE.phones[0].label}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

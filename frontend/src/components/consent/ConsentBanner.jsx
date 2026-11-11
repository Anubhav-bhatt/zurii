import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { META_PIXEL_ID } from '../../config/marketing';
import {
  getMarketingConsent,
  onOpenConsentPreferences,
  setMarketingConsent,
  subscribeConsent,
} from '../../services/consent';
import { isAdminPath } from '../../services/marketing';

const getServerSnapshot = () => 'unset';

const BUTTON =
  'inline-flex flex-1 items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-100 dark:focus-visible:ring-offset-zinc-900';
// Both choices carry the same visual weight: declining must be as easy as accepting.
const CHOICE = `${BUTTON} border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`;
const CHOSEN = `${BUTTON} border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900`;

/**
 * Marketing-cookie choice (opt-in). Shown until the visitor decides, and again
 * whenever "Cookie preferences" is opened from the footer or privacy policy.
 * A small card, not a modal: nothing behind it is blocked, and it keeps clear
 * of the WhatsApp button (bottom right) and the trip page's bottom bar.
 * Hidden on admin pages, and when no Pixel is configured.
 */
export default function ConsentBanner() {
  const { pathname } = useLocation();
  const choice = useSyncExternalStore(subscribeConsent, getMarketingConsent, getServerSnapshot);
  const [reviewing, setReviewing] = useState(false);
  const headingRef = useRef(null);

  useEffect(() => onOpenConsentPreferences(() => setReviewing(true)), []);

  // Opened on request: move focus into the panel so keyboard users land on it.
  useEffect(() => {
    if (reviewing) headingRef.current?.focus();
  }, [reviewing]);

  useEffect(() => {
    if (!reviewing) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setReviewing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reviewing]);

  if (!META_PIXEL_ID || isAdminPath(pathname)) return null;
  if (choice !== 'unset' && !reviewing) return null;

  const choose = (value) => {
    setMarketingConsent(value);
    setReviewing(false);
  };

  const offset = pathname.startsWith('/trip/') ? 'bottom-[5.75rem] lg:bottom-8' : 'bottom-4 sm:bottom-6 lg:bottom-8';

  return (
    <section
      aria-labelledby="zurii-consent-title"
      className={`fixed left-4 right-20 z-50 sm:left-6 sm:right-auto sm:w-[22rem] lg:left-8 ${offset}`}
    >
      <div className="rounded-2xl border border-zinc-200 bg-white/95 p-4 text-left shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="flex items-start justify-between gap-3">
          <h2
            id="zurii-consent-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-zinc-900 focus:outline-none dark:text-zinc-50"
          >
            Cookies for ads measurement
          </h2>
          {reviewing && (
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="-m-1 rounded p-1 text-zinc-500 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-100"
              aria-label="Close cookie preferences"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          With your permission we use Meta Pixel cookies to measure our Facebook and Instagram ads. Browsing,
          enquiries and WhatsApp work the same either way.{' '}
          <Link to="/privacy-policy" className="font-medium underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
        {reviewing && choice !== 'unset' && (
          <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-200" aria-live="polite">
            Current choice: {choice === 'granted' ? 'allowed' : 'declined'}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => choose('denied')}
            aria-pressed={reviewing ? choice === 'denied' : undefined}
            className={reviewing && choice === 'denied' ? CHOSEN : CHOICE}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose('granted')}
            aria-pressed={reviewing ? choice === 'granted' : undefined}
            className={reviewing && choice === 'granted' ? CHOSEN : CHOICE}
          >
            Allow
          </button>
        </div>
      </div>
    </section>
  );
}

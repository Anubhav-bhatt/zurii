import { useLocation } from 'react-router-dom';

import { whatsappLink } from '../../config/site';
import { titleCase } from '../../utils/format';
import { track } from '../../services/analytics';

/**
 * The persistent WhatsApp shortcut — one global instance, mounted once in
 * App.jsx. A plain deep link: no chat window, no bot, no unread badges, no
 * listeners, no requests. Clicking it opens wa.me with a message that already
 * says what the visitor was looking at.
 *
 * CONTEXT comes from the URL alone, so this costs nothing to render:
 *   /trip/:slug         → package message ("…interested in the X package…")
 *   /destination/:slug  → destination message ("…planning a trip to X…")
 *   anything else       → the general planning message
 * The readable name is derived from the slug (kashmir-family → Kashmir
 * Family) rather than from the document title, which this app never sets per
 * page — it is "Zurii" everywhere, so it carries no context. Slugs were
 * generated from the titles, so the slug reads naturally without fetching.
 * Every message still goes through whatsappLink(), so encoding stays in one
 * place and the number is never written here.
 *
 * LAYERING is deliberate, not a magic number. Page chrome (the trip page's
 * sticky bar, BackToTop) sits at z-40; every overlay opens at 65 or above with
 * a full-screen backdrop (drawer 65, search and enquiry sheet 70, lightbox
 * 110). At z-50 this button therefore floats above page content but is covered
 * by every overlay automatically — no open/closed bookkeeping to get wrong.
 *
 * POSITIONING: bottom-right, the corner users look for it in. On /trip/ routes
 * below lg the sticky price bar owns the bottom edge (py-3 around a 44px
 * control, ≈4.25rem, plus the safe area), so the button lifts to 5.75rem and
 * clears it. From lg up that bar is hidden and the offset resets. The safe-area
 * inset comes from the project's own `pb-safe` utility applied to the wrapper,
 * so the button rides above the iOS home indicator the same way the sticky bar
 * does. Not rendered under /admin — this is a customer-facing CTA.
 *
 * The green stays WhatsApp's own (#25D366) in both themes: recognition is the
 * point. Only the shadow and the tooltip are theme-aware.
 */

const WhatsAppGlyph = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-white">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/** decodeURIComponent throws URIError on a malformed escape (e.g. /trip/%zz),
 * and an exception here during render would blank the whole app. A slug that
 * cannot be decoded is used as-is — worst case the message reads oddly. */
const safeDecode = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** Route → the wa.me href for it. Null when the button should not exist. */
function hrefFor(pathname) {
  if (pathname.startsWith('/admin')) return null;

  const trip = pathname.match(/^\/trip\/([^/]+)/);
  if (trip) return whatsappLink(titleCase(safeDecode(trip[1])), 'package');

  const destination = pathname.match(/^\/destination\/([^/]+)/);
  if (destination) {
    return whatsappLink(titleCase(safeDecode(destination[1])), 'destination');
  }

  return whatsappLink();
}

/** Where the visitor was when they clicked — a coarse label, never the slug's title. */
function contextFor(pathname) {
  if (pathname.startsWith('/trip/')) return 'package';
  if (pathname.startsWith('/destination/')) return 'destination';
  return 'general';
}

export default function FloatingWhatsApp() {
  const { pathname } = useLocation();
  const href = hrefFor(pathname);
  if (!href) return null;

  // The trip page's mobile sticky bar owns the bottom edge below lg.
  const offset = pathname.startsWith('/trip/')
    ? 'bottom-[5.75rem] lg:bottom-8'
    : 'bottom-4 sm:bottom-6 lg:bottom-8';

  return (
    <div
      className={`group pointer-events-none fixed right-4 z-50 pb-safe sm:right-6 lg:right-8 ${offset}`}
    >
      {/* Desktop-only hint: never permanently visible, and hidden from screen
          readers because the link already carries the same wording. */}
      <span
        aria-hidden="true"
        className="absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-zinc-100 dark:text-zinc-900 sm:block"
      >
        Chat with us
      </span>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with Zurii on WhatsApp"
        onClick={() =>
          // Fire-and-forget; track() sends with keepalive so the event
          // survives the WhatsApp tab opening. Never blocks the navigation.
          track('whatsapp_click', { meta: { context: contextFor(pathname) } })
        }
        className="pointer-events-auto flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#25D366] shadow-[0_6px_20px_-4px_rgba(37,211,102,0.5)] transition-[translate,scale,box-shadow,background-color] duration-200 animate-fade-slide-up hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-[#1fbf5b] active:scale-[0.98] motion-reduce:animate-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20 dark:shadow-[0_6px_22px_-4px_rgba(37,211,102,0.35)] sm:h-14 sm:w-14"
      >
        <WhatsAppGlyph />
      </a>
    </div>
  );
}

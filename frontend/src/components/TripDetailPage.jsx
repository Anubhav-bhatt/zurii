import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

import Container from './ui/Container';
import Breadcrumbs from './ui/Breadcrumbs';
import Button from './ui/Button';
import SmartImage from './ui/SmartImage';
import { Skeleton } from './ui/Skeleton';
import { ErrorState } from './ui/States';
import EnquiryModal from './travel/EnquiryModal';
import ItineraryAccordion from './travel/ItineraryAccordion';
import RecentlyViewed from './travel/RecentlyViewed';
import SimilarPackages from './travel/SimilarPackages';
import WishlistButton from './travel/WishlistButton';
import { useAsyncData } from '../hooks/useAsyncData';
import { recordPackageView } from '../hooks/useRecentlyViewed';
import { getPackageBySlug } from '../services/packagesApi';
import { track } from '../services/analytics';
import { titleCase } from '../utils/format';
import { whatsappLink } from '../config/site';

/**
 * Package detail page, read from `GET /api/packages/:slug`.
 *
 * The route is still `/trip/:id` and the parameter is still the package slug,
 * so every existing link and bookmark resolves exactly as before — the slugs
 * were preserved verbatim through the migration.
 *
 * Sections render only when the migrated data actually contains them: 68 of 68
 * packages have an itinerary and inclusions, none have `highlights`, so the
 * highlights block is simply absent rather than showing an empty heading. The
 * two strips at the foot — similar trips and recently viewed — apply the same
 * rule and disappear entirely when they resolve nothing.
 *
 * Order: gallery, title and price with the CTAs, overview, highlights,
 * itinerary, inclusions/exclusions, departures, similar trips, recently viewed.
 * There is deliberately no "hotels" or "important information" block: the
 * database holds no such field for any package.
 */

const statusStyle = {
  available:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50',
  // Amber has no entry in the shared vocabulary; it follows the same
  // 950/30 fill, 300 text, 900/50 border shape as the emerald/rose pairings.
  filling:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50',
  soldout:
    'bg-zinc-100 text-zinc-400 border-zinc-200 line-through dark:bg-zinc-800 dark:text-zinc-500 dark:border-zinc-800',
};

const WhatsAppIcon = ({ className = 'h-4 w-4' }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} shrink-0 fill-current`}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

/** Desktop: one large image with a stacked pair beside it. Mobile: a swipeable strip. */
function Gallery({ pkg, onOpen }) {
  const images = [pkg.heroImage, ...(pkg.gallery || [])].filter(Boolean);
  const unique = [...new Set(images)];

  if (unique.length === 0) {
    return <div className="aspect-[16/9] w-full rounded-2xl bg-zinc-100 dark:bg-zinc-800" />;
  }

  const [lead, ...rest] = unique;

  return (
    <>
      {/* Mobile */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:hidden">
        {unique.map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => onOpen(index)}
            className="w-[85vw] shrink-0 snap-center rounded-2xl"
          >
            <SmartImage
              src={image}
              alt={`${pkg.title} — photo ${index + 1}`}
              ratio="aspect-[4/3]"
              className="rounded-2xl"
              priority={index === 0}
            />
          </button>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden gap-2.5 sm:grid sm:grid-cols-[2fr_1fr] sm:grid-rows-2">
        <button
          type="button"
          onClick={() => onOpen(0)}
          className="row-span-2 rounded-2xl"
        >
          <SmartImage
            src={lead}
            alt={`${pkg.title} — main photo`}
            ratio="aspect-[4/3] h-full"
            className="h-full rounded-2xl"
            priority
            imgClassName="transition-transform duration-500 hover:scale-[1.02]"
          />
        </button>

        {rest.slice(0, 2).map((image, index) => (
          <button
            key={image}
            type="button"
            onClick={() => onOpen(index + 1)}
            className="rounded-2xl"
          >
            <SmartImage
              src={image}
              alt={`${pkg.title} — photo ${index + 2}`}
              ratio="aspect-[4/3] h-full"
              className="h-full rounded-2xl"
              imgClassName="transition-transform duration-500 hover:scale-[1.03]"
            >
              {index === 1 && rest.length > 2 && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white">
                  +{rest.length - 2} more
                </span>
              )}
            </SmartImage>
          </button>
        ))}
      </div>
    </>
  );
}

function Lightbox({ images, index, onClose, onStep }) {
  const open = index !== null;
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  /**
   * A dialog that claims `aria-modal` has to behave like one. This previously
   * declared the role and nothing else, so a keyboard user who opened a photo
   * had focus left on the thumbnail behind the overlay, no way to close without
   * a mouse, and the page scrolling underneath.
   *
   * Arrow keys step through the photos, which is what anyone would try first.
   */
  useEffect(() => {
    if (!open) return;

    restoreRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onStep(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onStep(1);
        return;
      }
      // Keep Tab inside the overlay: only the close and step buttons are in it.
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll('button');
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
    const focusTimer = setTimeout(() => panelRef.current?.querySelector('button')?.focus(), 20);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose, onStep]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 animate-backdrop-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${images.length}`}
      onClick={onClose}
    >
      <p className="absolute left-6 top-6 text-sm font-medium text-white/60">
        {index + 1} / {images.length}
      </p>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo viewer"
        className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        ✕
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStep(-1);
            }}
            aria-label="Previous photo"
            className="absolute left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:left-8"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStep(1);
            }}
            aria-label="Next photo"
            className="absolute right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:right-8"
          >
            ›
          </button>
        </>
      )}

      <img
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[82vh] max-w-[90vw] rounded-2xl object-contain animate-fade-slide-up"
      />
    </div>
  );
}

const Section = ({ title, children, className = '' }) => (
  <section className={`pt-2 ${className}`}>
    <h2 className="mb-4 text-xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-2xl">{title}</h2>
    {children}
  </section>
);

function DetailSkeleton() {
  return (
    <Container className="py-8">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-4 aspect-[16/9] w-full rounded-2xl" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="hidden h-64 rounded-2xl lg:block" />
      </div>
      <span className="sr-only">Loading trip…</span>
    </Container>
  );
}

export default function TripDetailPage() {
  const { id: slug } = useParams();
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  const { data: pkg, loading, error, reload } = useAsyncData(
    ({ signal }) => getPackageBySlug(slug, { signal }),
    ['package', slug]
  );

  // Recorded once per trip that actually loaded — `pkg` is null while the
  // request is in flight and stays null on a 404, so a mistyped URL never
  // enters the visitor's history. Keyed on the loaded slug rather than the route
  // param for the same reason. `recordPackageView` and `track` are not
  // setState, so this is not a react-hooks/set-state-in-effect violation.
  // The same effect is the package_view dedup: one event per successful load.
  const loadedSlug = pkg?.slug;
  const loadedId = pkg?.dbId;
  useEffect(() => {
    if (loadedSlug) {
      recordPackageView(loadedSlug);
      track('package_view', { entityType: 'package', entityId: loadedId, entitySlug: loadedSlug });
    }
  }, [loadedSlug, loadedId]);

  // Stable so the dialog's focus-trap effect is not torn down and rebuilt every
  // time this page re-renders while the enquiry form is open.
  const closeEnquiry = useCallback(() => setEnquiryOpen(false), []);

  if (loading) {
    return (
      <div className="pt-16 sm:pt-[68px]">
        <DetailSkeleton />
      </div>
    );
  }

  if (error) {
    const notFound = error.status === 404;
    return (
      <div className="pt-16 sm:pt-[68px]">
        <Container className="py-16">
          {notFound ? (
            <div className="mx-auto max-w-md text-center">
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">This trip is no longer available</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                It may have been renamed or retired. Browse our current collection instead.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button to="/packages" variant="accent" size="md">
                  Browse all trips
                </Button>
                <Button to="/" variant="secondary" size="md">
                  Back to home
                </Button>
              </div>
            </div>
          ) : (
            <ErrorState onRetry={reload} description={error.message} />
          )}
        </Container>
      </div>
    );
  }

  const galleryImages = [...new Set([pkg.heroImage, ...(pkg.gallery || [])].filter(Boolean))];
  const facts = [
    pkg.duration && { label: 'Duration', value: pkg.duration },
    pkg.groupSize && { label: 'Group size', value: pkg.groupSize },
    pkg.difficulty && { label: 'Pace', value: pkg.difficulty },
    pkg.rating && { label: 'Rating', value: `${pkg.rating}${pkg.reviews ? ` (${pkg.reviews})` : ''}` },
  ].filter(Boolean);

  const priceBlock = (
    <>
      <span className="block text-[10px] font-bold uppercase tracking-widest text-violet-700 dark:text-violet-400">Starting price</span>
      {pkg.originalPrice && (
        <span className="block text-sm text-zinc-400 line-through dark:text-zinc-500">{pkg.originalPrice}</span>
      )}
      <span className="block text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">{pkg.price ?? 'On request'}</span>
      <span className="mt-0.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">per person</span>
    </>
  );

  return (
    <div className="pb-28 pt-16 sm:pt-[68px] lg:pb-16">
      <Container className="py-6 sm:py-8">
        <Breadcrumbs
          items={[
            { label: 'Home', to: '/' },
            { label: 'Packages', to: '/packages' },
            ...(pkg.destination
              ? [{ label: pkg.destination.name, to: `/destination/${pkg.destination.slug}` }]
              : []),
            { label: pkg.title },
          ]}
          className="mb-4"
        />

        <Gallery pkg={pkg} onOpen={setLightboxIndex} />

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
          {/* Main column */}
          <div>
            <header>
              {pkg.subtitle && (
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-400">
                  {pkg.subtitle}
                </p>
              )}

              <div className="flex items-start justify-between gap-4">
                <h1 className="text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">{pkg.title}</h1>

                {/* The save control lives beside the desktop enquiry card; on a
                    phone that card is hidden and the sticky bottom bar has no
                    room for a third control, so it sits by the title instead.
                    Only one of the two is ever in the accessibility tree. */}
                <WishlistButton slug={pkg.slug} title={pkg.title} variant="plain" className="mt-1 lg:hidden" />
              </div>

              {pkg.tagline && (
                <p className="mt-2.5 text-fluid-subtitle text-zinc-600 dark:text-zinc-300">{pkg.tagline}</p>
              )}

              {pkg.destination && (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
                  <Link
                    to={`/destination/${pkg.destination.slug}`}
                    className="font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300"
                  >
                    {pkg.destination.name}
                  </Link>
                  {pkg.destination.region && (
                    <span className="text-zinc-400 dark:text-zinc-500"> · {pkg.destination.region}</span>
                  )}
                </p>
              )}

              {facts.length > 0 && (
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 py-5 dark:border-zinc-800 sm:grid-cols-4">
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        {fact.label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {pkg.tags?.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {pkg.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        to={`/packages?tag=${tag}`}
                        className="inline-block rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-violet-800 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
                      >
                        {titleCase(tag)}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </header>

            <div className="mt-10 space-y-12 sm:space-y-14">
              {pkg.overview && (
                <Section title="Overview" className="pt-0">
                  <p className="text-fluid-body leading-relaxed text-zinc-700 dark:text-zinc-300">{pkg.overview}</p>
                </Section>
              )}

              {pkg.highlights?.length > 0 && (
                <Section title="Highlights">
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {pkg.highlights.map((item, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                        <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {pkg.itinerary?.length > 0 && (
                <Section title="Day-by-day itinerary">
                  {/* Keyed on the slug so moving between trips resets which days
                      are expanded — day 1 open, as on a first visit. */}
                  <ItineraryAccordion key={pkg.slug} itinerary={pkg.itinerary} />
                </Section>
              )}

              {(pkg.inclusions?.length > 0 || pkg.exclusions?.length > 0) && (
                <Section title="What's included">
                  <div className="grid gap-5 sm:grid-cols-2">
                    {pkg.inclusions?.length > 0 && (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                        <h3 className="mb-3 text-sm font-bold text-emerald-800 dark:text-emerald-300">Included</h3>
                        <ul className="space-y-2">
                          {pkg.inclusions.map((item, i) => (
                            <li
                              key={i}
                              className="flex gap-2.5 text-sm leading-relaxed text-emerald-800/90 dark:text-emerald-300/90"
                            >
                              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {pkg.exclusions?.length > 0 && (
                      <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 dark:border-rose-900/50 dark:bg-rose-950/30">
                        <h3 className="mb-3 text-sm font-bold text-rose-800 dark:text-rose-300">Not included</h3>
                        <ul className="space-y-2">
                          {pkg.exclusions.map((item, i) => (
                            <li
                              key={i}
                              className="flex gap-2.5 text-sm leading-relaxed text-rose-800/90 dark:text-rose-300/90"
                            >
                              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {pkg.batches?.length > 0 && (
                <Section title="Upcoming departures">
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {pkg.batches.map((batch, index) => (
                      <li
                        key={batch.id ?? `${batch.date}-${index}`}
                        className={`rounded-xl border p-3.5 text-center ${
                          batch.status === 'soldout'
                            ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/60'
                            : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                        }`}
                      >
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-50">{batch.date}</p>
                        {batch.price && (
                          <p className="mt-1 text-base font-bold text-violet-700 dark:text-violet-400">{batch.price}</p>
                        )}
                        {batch.slots !== undefined && (
                          <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{batch.slots} slots left</p>
                        )}
                        <span
                          className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            statusStyle[batch.status] ??
                            'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400'
                          }`}
                        >
                          {batch.status === 'soldout' ? 'Sold out' : batch.status === 'filling' ? 'Filling fast' : 'Available'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </div>

          {/* Sticky enquiry card (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-zinc-200/80 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
              {priceBlock}

              <div className="mt-6 flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Button
                    variant="primary"
                    size="md"
                    className="flex-1"
                    onClick={() => {
                      // Fire-and-forget, never awaited: opening the modal is
                      // never delayed by analytics.
                      track('plan_trip_click', { entityType: 'package', entityId: pkg.dbId, entitySlug: pkg.slug });
                      setEnquiryOpen(true);
                    }}
                  >
                    Send Enquiry
                  </Button>
                  <WishlistButton slug={pkg.slug} title={pkg.title} variant="plain" />
                </div>
                <Button
                  href={whatsappLink(pkg.title)}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="whatsapp"
                  size="md"
                  className="w-full"
                  onClick={() =>
                    // keepalive inside track() lets this survive the tab opening.
                    track('whatsapp_click', {
                      entityType: 'package',
                      entityId: pkg.dbId,
                      entitySlug: pkg.slug,
                      meta: { context: 'package' },
                    })
                  }
                >
                  <WhatsAppIcon />
                  Chat with Travel Expert
                </Button>
              </div>

              <p className="mt-4 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                No payment now — we'll confirm details with you first.
              </p>
            </div>
          </aside>
        </div>
      </Container>

      {/* Supplementary strips, full width under both columns. Each renders
          nothing when it has nothing to show, and `space-y` only spaces the
          nodes that actually exist. */}
      <Container className="space-y-14 pb-6 sm:pb-10">
        <SimilarPackages pkg={pkg} className="pt-4" />
        <RecentlyViewed excludeSlug={pkg.slug} className="pt-4" />
      </Container>

      {/* Sticky action bar (mobile) */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-zinc-200/80 bg-white/95 px-4 py-3 pb-safe backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 lg:hidden">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Per person
          </span>
          <span className="text-lg font-bold tracking-tight text-zinc-950 dark:text-zinc-50">
            {pkg.price ?? 'On request'}
          </span>
          {pkg.originalPrice && (
            <span className="ml-1.5 text-[11px] text-zinc-400 line-through dark:text-zinc-500">
              {pkg.originalPrice}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href={whatsappLink(pkg.title)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat with a travel expert on WhatsApp"
            onClick={() =>
              track('whatsapp_click', {
                entityType: 'package',
                entityId: pkg.dbId,
                entitySlug: pkg.slug,
                meta: { context: 'package' },
              })
            }
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#25D366] text-white shadow-sm transition-colors hover:bg-[#1fbf5b]"
          >
            <WhatsAppIcon className="h-5 w-5" />
          </a>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              track('plan_trip_click', { entityType: 'package', entityId: pkg.dbId, entitySlug: pkg.slug });
              setEnquiryOpen(true);
            }}
          >
            Send Enquiry
          </Button>
        </div>
      </div>

      <Lightbox
        images={galleryImages}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onStep={(step) =>
          setLightboxIndex((prev) => (prev + step + galleryImages.length) % galleryImages.length)
        }
      />

      {/* The trip is attached to the enquiry automatically, so the visitor never
          retypes what they are looking at and the lead arrives with its slug. */}
      <EnquiryModal
        isOpen={enquiryOpen}
        onClose={closeEnquiry}
        packageSlug={pkg.slug}
        packageTitle={pkg.title}
      />
    </div>
  );
}

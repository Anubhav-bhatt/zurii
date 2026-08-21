import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import Container from './ui/Container';
import Breadcrumbs from './ui/Breadcrumbs';
import Button from './ui/Button';
import SectionHeader from './ui/SectionHeader';
import PackageCard from './travel/PackageCard';
import { Skeleton, PackageCardSkeleton, SkeletonGrid } from './ui/Skeleton';
import { ErrorState, EmptyState } from './ui/States';
import { useAsyncData } from '../hooks/useAsyncData';
import { getDestinationBySlug } from '../services/destinationsApi';
import { track } from '../services/analytics';
import { whatsappLink } from '../config/site';

/**
 * Destination page, read from `GET /api/destinations/:slug` — which returns the
 * destination together with its published packages, so the page needs one
 * request rather than two.
 *
 * The route `/destination/:name` is unchanged; the parameter is the destination
 * slug, which the migration generated from the same names the old static pages
 * matched on (`Kerala` → `kerala`), so existing links keep working.
 */

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

export default function DestinationPage() {
  const { name: slug } = useParams();

  const { data: destination, loading, error, reload } = useAsyncData(
    ({ signal }) => getDestinationBySlug(slug, { signal }),
    ['destination', slug]
  );

  // Recorded once per destination that actually loaded — same pattern as the
  // trip page: `destination` stays null on a 404, so mistyped URLs are never
  // counted, and keying on the loaded slug makes the effect the dedup.
  // `track` is fire-and-forget, not setState.
  const loadedSlug = destination?.slug;
  const loadedId = destination?.dbId;
  useEffect(() => {
    if (loadedSlug) {
      track('destination_view', { entityType: 'destination', entityId: loadedId, entitySlug: loadedSlug });
    }
  }, [loadedSlug, loadedId]);

  if (loading) {
    return (
      <div className="pt-16 sm:pt-[68px]">
        <Skeleton className="h-[42vh] w-full rounded-none sm:h-[50vh]" />
        <Container className="py-10">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="mt-4 h-24 w-full" />
          <SkeletonGrid count={3} className={`${GRID} mt-10`} Item={PackageCardSkeleton} />
          <span className="sr-only">Loading destination…</span>
        </Container>
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
              <h1 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50">
                We don't cover that destination yet
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                Have a look at where we do travel — or tell us where you'd like to go.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button to="/packages" variant="accent" size="md">
                  Browse all trips
                </Button>
                <Button to="/contact-us" variant="secondary" size="md">
                  Request a destination
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

  // A resolved request is not the same as a usable destination.
  //
  // `useAsyncData` reports error only when the promise rejected, and `apiGet`
  // only rejects when the envelope says `success: false` — so a 200 carrying
  // `{success:true}` with no `data`, or `{success:true, data:null}`, resolves
  // cleanly. `adaptDestination` maps both of those to null (it guards its own
  // input), which meant this line then read `.packages` off null and threw
  // during render. There is no error boundary in the tree, so that did not
  // degrade this page — it unmounted the whole app to a blank white screen.
  //
  // `name` is the field checked because it is NOT NULL in the destinations
  // table and every branch below interpolates it: a row that reached here
  // without one would render "Trips to undefined" and build a WhatsApp message
  // to match. So this rejects exactly the shapes that cannot be displayed, and
  // no valid destination.
  //
  // Presented as a retryable error rather than "not found": a missing
  // destination already arrives as a 404 and is handled above, so reaching
  // here means the response itself was wrong, and that is worth retrying.
  if (!destination || typeof destination !== 'object' || !destination.name) {
    return (
      <div className="pt-16 sm:pt-[68px]">
        <Container className="py-16">
          <ErrorState
            onRetry={reload}
            description="We couldn't read that destination just now. Please try again in a moment."
          />
        </Container>
      </div>
    );
  }

  const packages = Array.isArray(destination.packages) ? destination.packages : [];
  const context = [destination.kind === 'domestic' ? 'India' : destination.region, destination.country]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(' · ');

  return (
    <div>
      {/* Hero */}
      <header className="relative isolate flex min-h-[42vh] items-end overflow-hidden bg-zinc-900 pb-8 pt-28 sm:min-h-[50vh] sm:pb-12">
        {destination.thumbnail && (
          <img
            src={destination.thumbnail}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/30" />

        <Container>
          <Breadcrumbs
            items={[
              { label: 'Home', to: '/' },
              { label: 'Packages', to: '/packages' },
              { label: destination.name },
            ]}
            className="mb-3 [&_*]:text-white/70 [&_a:hover]:text-white [&_span[aria-current]]:text-white"
          />

          {context && (
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">{context}</p>
          )}

          <h1 className="text-fluid-hero font-bold text-white">{destination.name}</h1>

          {destination.highlight && (
            <p className="mt-2.5 max-w-2xl text-fluid-subtitle text-white/85">{destination.highlight}</p>
          )}

          <p className="mt-4 text-sm font-medium text-white/70">
            {packages.length} {packages.length === 1 ? 'trip' : 'trips'} available
          </p>
        </Container>
      </header>

      {/* Introduction */}
      {destination.about && (
        <Container className="section-gap-sm">
          <div className="max-w-3xl">
            <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-2xl">
              About {destination.name}
            </h2>
            <p className="mt-3 text-fluid-body leading-relaxed text-zinc-700 dark:text-zinc-300">
              {destination.about}
            </p>

            {/* `cities` comes from the destinations.metadata JSONB blob, so its type
                is whatever was written there — `?.length > 0` is also true for a
                string, and .map() below is not. */}
            {Array.isArray(destination.cities) && destination.cities.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Places you'll visit
                </p>
                <ul className="flex flex-wrap gap-2">
                  {destination.cities.map((city) => (
                    <li
                      key={city}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    >
                      {city}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Container>
      )}

      {/* Packages */}
      <Container as="section" aria-labelledby="destination-packages" className="section-gap">
        <SectionHeader
          id="destination-packages"
          eyebrow="Available now"
          title={`Trips to ${destination.name}`}
          description={packages.length > 0 ? 'Every itinerary is planned and priced by our team.' : undefined}
        />

        {packages.length === 0 ? (
          <EmptyState
            title={`No ${destination.name} trips are listed right now.`}
            description="Tell us what you have in mind and we'll put an itinerary together."
            action={{ label: 'Plan a custom trip', to: '/plan-my-trip' }}
          />
        ) : (
          <ul className={GRID}>
            {packages.map((pkg, index) => (
              <li key={pkg.slug} className="h-full">
                <PackageCard pkg={pkg} priority={index < 3} className="h-full" />
              </li>
            ))}
          </ul>
        )}
      </Container>

      {/* CTA */}
      <Container className="pb-16 sm:pb-20">
        <div className="rounded-3xl border border-zinc-200/80 bg-zinc-50/80 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/60 sm:px-12">
          <h2 className="text-xl font-bold text-zinc-950 dark:text-zinc-50 sm:text-2xl">
            Want {destination.name} planned differently?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-600 dark:text-zinc-300">
            Different dates, a longer stay, or a specific pace — we'll build the itinerary around you.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button to="/plan-my-trip" variant="accent" size="md" className="w-full sm:w-auto">
              Plan My Trip
            </Button>
            <Button
              href={whatsappLink(`${destination.name} trip`)}
              target="_blank"
              rel="noopener noreferrer"
              variant="whatsapp"
              size="md"
              className="w-full sm:w-auto"
            >
              Chat with Travel Expert
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}

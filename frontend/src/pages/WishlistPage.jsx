import { useEffect, useMemo } from 'react';

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import PackageCard from '../components/travel/PackageCard';
import { DataBoundary } from '../components/ui/States';
import { PackageCardSkeleton, SkeletonGrid } from '../components/ui/Skeleton';
import { useAsyncData } from '../hooks/useAsyncData';
import { useWishlist } from '../hooks/useWishlist';
import { getPackageBySlug } from '../services/packagesApi';

/**
 * Saved trips.
 *
 * localStorage holds slugs and nothing else, so every price, image and title on
 * this page is the current one from the API rather than a snapshot taken on the
 * day the heart was clicked.
 *
 * Two decisions worth knowing about:
 *
 * 1. The fetch is *not* keyed on the wishlist. Removing a trip would otherwise
 *    change the key, blank the grid into skeletons and re-request every trip
 *    that is still saved. Instead the key only tracks whether anything is saved
 *    at all — useAsyncData reads the fetcher through a ref, so the request that
 *    key does trigger still closes over the current slugs — and what renders is
 *    the live wishlist intersected with what came back. A heart click therefore
 *    updates the page instantly and costs nothing.
 * 2. Trips are fetched one slug at a time, as RecentlyViewed does: the API has
 *    no "give me these slugs" filter, and a per-slug request tells us exactly
 *    which trips are gone (404) rather than making us infer it from a catalogue
 *    listing that may have been truncated by its limit.
 */

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/** Enough skeletons to hint at the saved list without filling the viewport. */
const MAX_SKELETONS = 6;

export default function WishlistPage() {
  const { slugs, remove } = useWishlist();
  const hasSaved = slugs.length > 0;

  const { data, loading, error, reload } = useAsyncData(
    async ({ signal }) => {
      if (slugs.length === 0) return { packages: [], missing: [] };

      const results = await Promise.allSettled(slugs.map((slug) => getPackageBySlug(slug, { signal })));

      const packages = [];
      const missing = [];
      let unreachable = null;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value) packages.push(result.value);
          return;
        }
        // Only a 404 means the trip is gone. A timeout or a 500 means we could
        // not ask, which must never cost the visitor a saved trip.
        if (result.reason?.status === 404) missing.push(slugs[index]);
        else unreachable = result.reason;
      });

      // Nothing came back and the network was the reason: report it and offer a
      // retry rather than showing an empty wishlist that is not empty. A partial
      // failure keeps the trips that did load; the rest return on the next visit.
      if (packages.length === 0 && unreachable) throw unreachable;

      // Only prune when at least one trip resolved.
      //
      // A 404 is normally proof that one trip is gone — but if EVERY request
      // 404s, the far likelier explanation is that this endpoint is broken or
      // has moved, not that the visitor's entire wishlist was unpublished at
      // once. Pruning on that signal would silently and irreversibly empty
      // their saved trips. Requiring one success means the endpoint has proven
      // it can still find trips before we delete anything.
      if (packages.length === 0) return { packages, missing: [] };

      return { packages, missing };
    },
    ['wishlist', hasSaved]
  );

  const bySlug = useMemo(() => new Map((data?.packages ?? []).map((pkg) => [pkg.slug, pkg])), [data]);

  // Wishlist order (newest save first), minus anything the API did not return.
  const trips = useMemo(() => slugs.map((slug) => bySlug.get(slug)).filter(Boolean), [slugs, bySlug]);

  /**
   * Drop trips the API reported as gone, once, after the request resolved. This
   * writes to the wishlist store rather than to component state: it cannot loop,
   * because `missing` only changes when a new response arrives and pruning does
   * not trigger a new request.
   */
  const missing = data?.missing;
  useEffect(() => {
    if (!missing || missing.length === 0) return;
    for (const slug of missing) remove(slug);
  }, [missing, remove]);

  const count = trips.length;
  const summary =
    hasSaved && loading
      ? 'Loading your saved trips…'
      : error
        ? 'Your saved trips are unavailable right now.'
        : count === 0
          ? 'Nothing saved yet.'
          : `${count} ${count === 1 ? 'trip' : 'trips'} saved`;

  return (
    <div className="pt-16 sm:pt-[68px]">
      {/* Page header */}
      <div className="bg-zinc-50/70 dark:bg-zinc-900/60">
        <Container className="py-8 sm:py-10">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Saved Trips' }]} />

          <h1 className="mt-3 text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">Saved Trips</h1>

          {/* Announced so removing a trip is not a silent change. */}
          <p aria-live="polite" aria-atomic="true" className="mt-2 text-fluid-body text-zinc-600 dark:text-zinc-300">
            {summary}
          </p>
        </Container>
      </div>

      {/* Results */}
      <Container className="pt-6 pb-16 sm:pb-20">
        <DataBoundary
          // With nothing saved there is nothing to wait for, so the empty state
          // shows immediately rather than after a frame of skeletons.
          loading={hasSaved && loading}
          error={error}
          onRetry={reload}
          isEmpty={count === 0}
          empty={{
            title: 'Your wishlist is empty.',
            description: 'Tap the heart on any trip and it will wait here while you decide.',
            action: { label: 'Explore Packages', to: '/packages' },
          }}
          skeleton={
            <SkeletonGrid count={Math.min(slugs.length, MAX_SKELETONS)} className={GRID} Item={PackageCardSkeleton} />
          }
        >
          <ul className={GRID}>
            {trips.map((pkg, index) => (
              <li key={pkg.slug} className="h-full">
                <PackageCard pkg={pkg} priority={index < 3} className="h-full" />
              </li>
            ))}
          </ul>
        </DataBoundary>
      </Container>
    </div>
  );
}

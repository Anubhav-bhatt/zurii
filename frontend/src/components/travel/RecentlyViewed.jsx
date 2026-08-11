import { useId } from 'react';

import SectionHeader from '../ui/SectionHeader';
import { PackageCardSkeleton } from '../ui/Skeleton';
import CardRail from '../ui/CardRail';
import PackageCard from './PackageCard';
import { getPackageBySlug } from '../../services/packagesApi';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useRecentlyViewed } from '../../hooks/useRecentlyViewed';

/**
 * "Pick up where you left off" — the trips this browser opened, newest first.
 *
 * Fetched one slug at a time through `Promise.allSettled` rather than in a
 * single list request. The API has no "give me these slugs" filter, so the
 * alternatives were to pull the whole catalogue and match locally (68 rows to
 * render four cards) or to accept a handful of small requests. The per-slug
 * route also isolates failure: a trip that has since been unpublished simply
 * rejects with a 404 and is dropped, and the rest of the strip still renders.
 *
 * Renders nothing at all when there is nothing to show — no empty state, no
 * heading. A supplementary section should never announce its own absence, and
 * for the same reason a failed request is treated as "nothing to show" instead
 * of putting an error panel below the page's real content.
 *
 * No Container here: this sits inside a page that already owns its width.
 */

// Secondary personalization strip: compact rail on mobile, grid from sm up.
const GRID = 'sm:grid-cols-2 lg:grid-cols-4 sm:gap-5';

export default function RecentlyViewed({ excludeSlug, title = 'Recently Viewed', className = '', limit = 4 }) {
  const headingId = useId();
  const { slugs } = useRecentlyViewed();

  // Filtering happens before the fetch, so the trip you are already looking at
  // never costs a request and never decides whether the section appears.
  const wanted = slugs.filter((slug) => slug !== excludeSlug).slice(0, Math.max(0, limit));
  const key = wanted.join('|');

  const { data, loading } = useAsyncData(
    async ({ signal }) => {
      if (wanted.length === 0) return [];
      const results = await Promise.allSettled(wanted.map((slug) => getPackageBySlug(slug, { signal })));
      return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
    },
    ['recently-viewed', key]
  );

  if (wanted.length === 0) return null;

  if (loading) {
    return (
      <section className={className} aria-labelledby={headingId}>
        <SectionHeader id={headingId} title={title} />
        <CardRail grid={GRID} aria-hidden="true">
          {wanted.map((slug) => (
            <PackageCardSkeleton key={slug} />
          ))}
        </CardRail>
      </section>
    );
  }

  const packages = data ?? [];
  if (packages.length === 0) return null;

  return (
    <section className={className} aria-labelledby={headingId}>
      <SectionHeader id={headingId} title={title} />

      <CardRail grid={GRID}>
        {packages.map((pkg) => (
          <PackageCard key={pkg.slug} pkg={pkg} className="h-full" />
        ))}
      </CardRail>
    </section>
  );
}

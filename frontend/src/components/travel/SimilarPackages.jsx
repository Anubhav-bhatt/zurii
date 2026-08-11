import { useId } from 'react';

import SectionHeader from '../ui/SectionHeader';
import { PackageCardSkeleton } from '../ui/Skeleton';
import CardRail from '../ui/CardRail';
import PackageCard from './PackageCard';
import { getPackages, getPopularPackages } from '../../services/packagesApi';
import { useAsyncData } from '../../hooks/useAsyncData';
import { track } from '../../services/analytics';

/**
 * "Similar Trips" for the package detail page. Rule-based, not recommended:
 * same destination first, then a shared tag, then whatever is popular. Each
 * source only has to fill the gap the previous one left, so a Kerala trip with
 * four Kerala siblings costs exactly one request and never touches the tag or
 * popular lists.
 *
 * At most two requests, always. The sources are tried in order and the loop
 * stops as soon as four distinct trips are collected, which is why they run
 * sequentially rather than in parallel — a parallel fetch would pay for the
 * fallbacks it usually does not need.
 *
 * A source that fails contributes nothing instead of failing the section: a
 * dead popular-trips request must not remove the destination matches that
 * already resolved. If nothing resolves at all the section does not render —
 * like RecentlyViewed, a supplementary strip should never announce its own
 * absence or put an error panel under the page's real content.
 *
 * No Container: the detail page owns the width and the spacing.
 */

const TARGET = 4;

// Enough to survive de-duplication against the current trip and each other
// without pulling the whole catalogue.
const FETCH_LIMIT = 8;

/**
 * The tag worth matching on. `domestic` and `international` are true of 21 and
 * 41 of the 68 packages, so they describe nothing — PackageCard hides them for
 * the same reason. What is left (heritage, adventure, beach, family) is the
 * part a visitor would recognise as similar.
 */
function definingTag(tags) {
  return (tags || []).find((tag) => tag !== 'domestic' && tag !== 'international');
}

async function loadSimilar(pkg, signal) {
  const sources = [];

  if (pkg.destination?.slug) {
    sources.push(() => getPackages({ destination: pkg.destination.slug, limit: FETCH_LIMIT }, { signal }));
  }

  const tag = definingTag(pkg.tags);
  if (tag) {
    sources.push(() => getPackages({ tag, limit: FETCH_LIMIT }, { signal }));
  }

  sources.push(() => getPopularPackages(FETCH_LIMIT, { signal }));

  const seen = new Set([pkg.slug]);
  const picked = [];

  // No slice: the loop already returns as soon as TARGET is reached, so the
  // popular fallback only costs a request when the earlier sources came up
  // short — which is exactly when it is needed.
  for (const load of sources) {
    let candidates = [];
    try {
      candidates = (await load()).packages;
    } catch (error) {
      // An abort is the page moving on; stop rather than firing the fallback.
      if (error?.name === 'AbortError') throw error;
    }

    for (const candidate of candidates) {
      if (!candidate?.slug || seen.has(candidate.slug)) continue;
      seen.add(candidate.slug);
      picked.push(candidate);
      if (picked.length === TARGET) return picked;
    }
  }

  return picked;
}

export default function SimilarPackages({ pkg, className = '' }) {
  const headingId = useId();

  const { data, loading } = useAsyncData(
    ({ signal }) => (pkg?.slug ? loadSimilar(pkg, signal) : []),
    ['similar-packages', pkg?.slug]
  );

  if (!pkg?.slug) return null;

  if (loading) {
    return (
      <section className={className} aria-labelledby={headingId}>
        <SectionHeader id={headingId} title="Similar Trips" />
        <CardRail grid="sm:grid-cols-2 lg:grid-cols-4 sm:gap-5" aria-hidden="true">
          {Array.from({ length: TARGET }, (_, i) => (
            <PackageCardSkeleton key={i} />
          ))}
        </CardRail>
      </section>
    );
  }

  const packages = data ?? [];
  if (packages.length === 0) return null;

  return (
    <section className={className} aria-labelledby={headingId}>
      {/* No supporting line: the honest one would describe the matching rules,
          and anything about what other travellers viewed would be invented. */}
      <SectionHeader id={headingId} title="Similar Trips" />

      {/* Three cards fill a three-column row rather than leaving a hole. */}
      <CardRail grid={`sm:grid-cols-2 sm:gap-5 ${packages.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
        {packages.map((similar) => (
          /* A bubble-phase listener on the card container, not on the link:
             the click is observed after the card's own handlers, navigation is
             never blocked, and track() is fire-and-forget with keepalive. */
          <div
            key={similar.slug}
            className="h-full"
            onClick={() =>
              track('similar_package_click', {
                entityType: 'package',
                entitySlug: similar.slug,
                meta: { sourceSlug: pkg.slug, targetSlug: similar.slug },
              })
            }
          >
            <PackageCard pkg={similar} className="h-full" />
          </div>
        ))}
      </CardRail>
    </section>
  );
}

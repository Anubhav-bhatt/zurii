import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';
import { DataBoundary } from '../ui/States';
import { PackageCardSkeleton } from '../ui/Skeleton';
import CardRail from '../ui/CardRail';
import PackageCard from '../travel/PackageCard';

// Mobile: swipeable rail with the next card peeking. sm+: the original grid.
const GRID = 'sm:grid-cols-2 lg:grid-cols-3 sm:gap-5';

/** Handpicked trips — the `featured` flag straight from the database. */
export default function FeaturedPackages({ packages = [], loading, error, onRetry }) {
  const visible = packages.slice(0, 6);

  return (
    <Container as="section" aria-labelledby="featured-packages" className="section-gap">
      <SectionHeader
        id="featured-packages"
        eyebrow="Handpicked"
        title="Featured Trips"
        description="Journeys our travellers keep coming back to."
        action={{ label: 'View all packages', to: '/packages' }}
      />

      <DataBoundary
        loading={loading}
        error={error}
        onRetry={onRetry}
        isEmpty={visible.length === 0}
        empty={{
          title: 'No featured trips right now.',
          description: 'Browse the full collection instead — there is plenty to explore.',
          action: { label: 'Browse all trips', to: '/packages' },
        }}
        skeleton={
          <CardRail grid={GRID} aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <PackageCardSkeleton key={i} />
            ))}
          </CardRail>
        }
      >
        <CardRail grid={GRID}>
          {visible.map((pkg) => (
            <PackageCard key={pkg.slug} pkg={pkg} className="h-full" />
          ))}
        </CardRail>
      </DataBoundary>
    </Container>
  );
}

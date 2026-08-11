import Container from '../ui/Container';
import SectionHeader from '../ui/SectionHeader';
import { DataBoundary } from '../ui/States';
import { DestinationCardSkeleton } from '../ui/Skeleton';
import CardRail from '../ui/CardRail';
import DestinationCard from '../travel/DestinationCard';

/**
 * Destination browsing, image-first.
 *
 * The layout is a plain CSS grid where the first two cards span two columns and
 * two rows on desktop — that produces the large/small editorial mix without a
 * masonry library, and collapses to a single column on mobile.
 */
export default function PopularDestinations({ destinations = [], loading, error, onRetry }) {
  // The API orders destinations by package count, so the first entries are the
  // ones with the most to explore.
  const featured = destinations.slice(0, 8);

  return (
    <Container as="section" aria-labelledby="popular-destinations" className="section-gap">
      <SectionHeader
        id="popular-destinations"
        eyebrow="Where to next"
        title="Popular Destinations"
        description="Explore the places travellers ask us about most."
        action={{ label: 'All destinations', to: '/packages' }}
      />

      <DataBoundary
        loading={loading}
        error={error}
        onRetry={onRetry}
        isEmpty={featured.length === 0}
        empty={{
          title: 'No destinations to show yet.',
          description: 'Our team is adding new places. Please check back soon.',
        }}
        skeleton={
          <div className="rail-bleed scrollbar-hide flex gap-4 overflow-x-auto sm:m-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:p-0 lg:grid-cols-4" role="status" aria-label="Loading destinations">
            <DestinationCardSkeleton className="h-72 w-[80%] shrink-0 sm:col-span-2 sm:row-span-2 sm:h-full sm:w-auto sm:shrink lg:min-h-[26rem]" />
            <DestinationCardSkeleton className="h-52 w-[80%] shrink-0 sm:w-auto sm:shrink" />
            <DestinationCardSkeleton className="h-52 w-[80%] shrink-0 sm:w-auto sm:shrink" />
            <DestinationCardSkeleton className="h-52 w-[80%] shrink-0 sm:w-auto sm:shrink" />
            <DestinationCardSkeleton className="h-52 w-[80%] shrink-0 sm:w-auto sm:shrink" />
            <span className="sr-only">Loading destinations…</span>
          </div>
        }
      >
        <CardRail grid="sm:grid-cols-2 lg:grid-cols-4 sm:gap-4" item="w-[80%]">
          {featured.map((destination, index) => {
            const large = index === 0 || index === 3;
            return (
              <DestinationCard
                key={destination.slug}
                destination={destination}
                size={large ? 'lg' : 'md'}
                priority={index === 0}
                className="h-full"
                railItem={large ? 'sm:col-span-2 sm:row-span-2' : ''}
              />
            );
          })}
        </CardRail>
      </DataBoundary>
    </Container>
  );
}

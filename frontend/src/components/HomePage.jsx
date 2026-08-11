import HeroSection from './home/HeroSection';
import PopularDestinations from './home/PopularDestinations';
import FeaturedPackages from './home/FeaturedPackages';
import WhyZurii from './home/WhyZurii';
import TravelExperiences from './home/TravelExperiences';
import TrendingTrips from './home/TrendingTrips';
import TestimonialsSection from './home/TestimonialsSection';
import RecentlyViewed from './travel/RecentlyViewed';
import PlanTripCTA from './home/PlanTripCTA';

import { useAsyncData } from '../hooks/useAsyncData';
import { getDestinationsCached } from '../services/destinationsApi';
import { getFeaturedPackages, getPopularPackages } from '../services/packagesApi';
import { testimonials } from '../data';

/**
 * Homepage.
 *
 * All data is fetched here — three requests — and passed down, so the hero and
 * the destinations section share one destinations response and the hero shares
 * the featured packages with its own section. Sections stay presentational and
 * each renders its own loading / error / empty state.
 *
 * Testimonials remain static project content: they are customer quotes, not
 * travel inventory, and were never part of the database migration.
 */
export default function HomePage() {
  // Shares the navigation's response rather than refetching the same 36 rows.
  const destinations = useAsyncData(() => getDestinationsCached(), ['home-destinations']);

  const featured = useAsyncData(({ signal }) => getFeaturedPackages(6, { signal }), ['home-featured']);

  const popular = useAsyncData(({ signal }) => getPopularPackages(9, { signal }), ['home-popular']);

  const featuredPackages = featured.data?.packages ?? [];
  const popularPackages = popular.data?.packages ?? [];
  const destinationList = destinations.data ?? [];

  // The hero rotates through featured trips; if none are flagged it falls back
  // to the popular ones so it is never an empty grey panel.
  const heroSlides = featuredPackages.length > 0 ? featuredPackages : popularPackages;

  return (
    <>
      <HeroSection slides={heroSlides} />

      {/* Clears the search panel where it overhangs the hero — only from lg up.
          Below that the panel sits in flow, so no spacer is needed. */}
      <div className="h-0 lg:h-20" aria-hidden="true" />

      <PopularDestinations
        destinations={destinationList}
        loading={destinations.loading}
        error={destinations.error}
        onRetry={destinations.reload}
      />

      <FeaturedPackages
        packages={featuredPackages}
        loading={featured.loading}
        error={featured.error}
        onRetry={featured.reload}
      />

      <WhyZurii />

      <TravelExperiences packages={[...featuredPackages, ...popularPackages]} />

      <TrendingTrips
        packages={popularPackages}
        loading={popular.loading}
        error={popular.error}
        onRetry={popular.reload}
      />

      <TestimonialsSection testimonials={testimonials} />

      {/*
        Only appears for a returning visitor. Container's width and padding are
        passed in as classes instead of wrapping this in one, because a Container
        would still render its own vertical space on every first visit — when
        RecentlyViewed itself renders nothing at all.
      */}
      <RecentlyViewed className="mx-auto w-full max-w-7xl section-padding section-gap" />

      <PlanTripCTA />
    </>
  );
}

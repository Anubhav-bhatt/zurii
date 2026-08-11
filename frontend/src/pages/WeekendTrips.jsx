import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import PackageCard from '../components/travel/PackageCard';
import { DataBoundary } from '../components/ui/States';
import { PackageCardSkeleton, SkeletonGrid } from '../components/ui/Skeleton';
import { useAsyncData } from '../hooks/useAsyncData';
import { getPackages } from '../services/packagesApi';

/**
 * Weekend getaways: every published package that fits in a weekend.
 *
 * This page used to render a hardcoded array of three trips that existed
 * nowhere in the database — their View Details buttons had nothing real to
 * navigate to. It is now a filtered view over the same catalogue as
 * /packages: the '1-3' duration bucket the API already understands. Cards,
 * navigation, wishlist and the detail page are all the shared ones, so a
 * weekend trip behaves exactly like any other trip in the product.
 */

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

export default function WeekendTrips() {
  const { data, loading, error, reload } = useAsyncData(
    ({ signal }) => getPackages({ duration: '1-3', sort: 'price_asc' }, { signal }),
    ['weekend-trips']
  );

  const trips = data?.packages ?? [];

  return (
    <div className="pt-16 sm:pt-[68px]">
      {/* Page header */}
      <div className="bg-zinc-50/70 dark:bg-zinc-900/60">
        <Container className="py-8 sm:py-10">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Weekend Trips' }]} />

          <h1 className="mt-3 text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">Weekend Trips</h1>

          <p className="mt-2 max-w-2xl text-fluid-body text-zinc-600 dark:text-zinc-300">
            Short escapes of three days or less — easy to plan, quick to reach, and back before Monday.
          </p>
        </Container>
      </div>

      {/* Results */}
      <Container className="pt-6 pb-16 sm:pb-20">
        <DataBoundary
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={trips.length === 0}
          empty={{
            title: 'No weekend trips right now.',
            description: 'New short escapes are added regularly — the full collection has plenty to explore meanwhile.',
            action: { label: 'Browse all packages', to: '/packages' },
          }}
          skeleton={<SkeletonGrid count={6} className={GRID} Item={PackageCardSkeleton} />}
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

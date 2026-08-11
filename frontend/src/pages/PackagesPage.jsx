import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import Container from '../components/ui/Container';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import PackageCard from '../components/travel/PackageCard';
import PackageFilters from '../components/travel/PackageFilters';
import ActiveFilters from '../components/travel/ActiveFilters';
import SortSelect from '../components/travel/SortSelect';
import { DataBoundary } from '../components/ui/States';
import { PackageCardSkeleton, SkeletonGrid } from '../components/ui/Skeleton';
import { useAsyncData } from '../hooks/useAsyncData';
import { getPackages } from '../services/packagesApi';
import { getDestinationsCached } from '../services/destinationsApi';
import { track, trackSearch } from '../services/analytics';
import { formatCurrency, titleCase } from '../utils/format';

/**
 * Package listing.
 *
 * The URL is the only filter state. Every control writes query parameters and
 * the page reads them back, so /packages?tag=beach&sort=price_asc is shareable,
 * survives a refresh, and Back / Forward step through filter changes. Nothing is
 * mirrored into component state, so there is no synchronisation effect and no
 * render/navigation loop.
 *
 * Filtering happens in SQL: the parameters go straight to GET /api/packages
 * rather than the page pulling all 68 packages and narrowing them locally.
 */

const GRID = 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3';

/**
 * GET /api/packages defaults to 60 rows and caps at 100. The default sits below
 * the 68 published packages, so an unfiltered listing would quietly show 60 of
 * them under a heading claiming 68. Asking for the cap keeps the grid and the
 * count in agreement without pagination the catalogue does not need yet; the
 * count line below still reports a shortfall if one ever appears.
 */
const LISTING_LIMIT = 100;

/** Query parameters the API understands; anything else in the URL is ignored. */
const API_PARAMS = ['destination', 'tag', 'tripType', 'minPrice', 'maxPrice', 'duration', 'q', 'popular', 'featured', 'sort'];

/** Everything in API_PARAMS except `sort`, which orders results rather than narrowing them. */
const FILTER_PARAMS = API_PARAMS.filter((key) => key !== 'sort');

const DURATION_LABELS = { '1-3': '1–3 days', '4-6': '4–6 days', '7+': '7+ days' };

/** Two tags read better as places than as tags. */
const TAG_LABELS = { domestic: 'India', international: 'International' };

/** Sort values SortSelect offers; it owns their labels. `recommended` is the API default. */
const SORT_VALUES = ['recommended', 'price_asc', 'price_desc', 'duration_asc', 'rating'];
const DEFAULT_SORT = 'recommended';

function readFilters(searchParams) {
  const filters = {};
  for (const key of API_PARAMS) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }
  // Guard against hand-edited URLs: drop prices that are not numbers.
  for (const key of ['minPrice', 'maxPrice']) {
    if (filters[key] && !Number.isFinite(Number(filters[key]))) delete filters[key];
  }
  // ...values the API would ignore anyway, so they never reach a chip either.
  for (const key of ['popular', 'featured']) {
    if (filters[key] && filters[key] !== 'true' && filters[key] !== '1') delete filters[key];
  }
  if (filters.duration && !DURATION_LABELS[filters.duration]) delete filters.duration;
  if (filters.sort && !SORT_VALUES.includes(filters.sort)) delete filters.sort;
  return filters;
}

/** How many filters are narrowing the results; a price range counts once. */
function countFilters(filters) {
  const count = FILTER_PARAMS.filter((key) => key !== 'minPrice' && key !== 'maxPrice' && filters[key]).length;
  return count + (filters.minPrice || filters.maxPrice ? 1 : 0);
}

/** 'Under ₹25,000' / '₹25,000 – ₹50,000' / 'Above ₹2,00,000', whatever the URL carries. */
function budgetLabel({ minPrice, maxPrice }) {
  if (minPrice && maxPrice) return `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}`;
  if (maxPrice) return `Under ${formatCurrency(maxPrice)}`;
  if (minPrice) return `Above ${formatCurrency(minPrice)}`;
  return null;
}

/**
 * The chip list — also the heading and result-count summary, so all three
 * describe the same query.
 *
 * Each chip carries the parameter keys it owns, which is all ActiveFilters needs
 * to remove it. `destinationLabel` is null when the slug in the URL is not a
 * real destination: an unknown slug is left out of the summary rather than
 * presented as a filter that did something. It is still sent to the API, which
 * honestly returns nothing, and "Clear all" remains available.
 *
 * `headline` marks the chips that read as a noun before "Trips" — "Goa Trips",
 * "Beach Trips". A duration or a budget does not ("4–6 days Trips"), so those
 * describe the query in the count line only. ActiveFilters ignores the flag.
 */
function buildChips(filters, destinationLabel) {
  const chips = [];
  if (filters.destination && destinationLabel) {
    chips.push({ id: 'destination', label: destinationLabel, keys: ['destination'], headline: true });
  }
  if (filters.tag) {
    chips.push({
      id: 'tag',
      label: TAG_LABELS[filters.tag] ?? titleCase(filters.tag),
      keys: ['tag'],
      headline: true,
    });
  }
  if (filters.tripType) {
    chips.push({ id: 'tripType', label: titleCase(filters.tripType), keys: ['tripType'], headline: true });
  }
  if (filters.duration) {
    chips.push({ id: 'duration', label: DURATION_LABELS[filters.duration], keys: ['duration'] });
  }
  const budget = budgetLabel(filters);
  if (budget) {
    chips.push({ id: 'budget', label: budget, keys: ['minPrice', 'maxPrice'] });
  }
  if (filters.popular) chips.push({ id: 'popular', label: 'Trending', keys: ['popular'], headline: true });
  if (filters.featured) chips.push({ id: 'featured', label: 'Featured', keys: ['featured'], headline: true });
  if (filters.q) chips.push({ id: 'q', label: `“${filters.q}”`, keys: ['q'] });
  return chips;
}

export default function PackagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readFilters(searchParams);
  const activeCount = countFilters(filters);

  // `filters` is rebuilt from API_PARAMS in a fixed order, so this key changes
  // exactly when a filter or the sort changes — which is what makes
  // useAsyncData abort the request it supersedes.
  const { data, loading, error, reload } = useAsyncData(
    ({ signal }) => getPackages({ ...filters, limit: LISTING_LIMIT }, { signal }),
    ['packages', filters]
  );

  // Shared with the navigation and homepage, so this is normally already resolved.
  const {
    data: destinationData,
    loading: destinationsLoading,
    error: destinationsError,
  } = useAsyncData(() => getDestinationsCached(), ['destinations']);

  const destinations = destinationData ?? [];
  const packages = data?.packages ?? [];
  const total = data?.total ?? 0;

  const selectedDestination = filters.destination
    ? destinations.find((destination) => destination.slug === filters.destination)
    : null;

  // Until the list resolves a typo is indistinguishable from a real slug, so the
  // slug itself is shown; after that an unknown one drops out of the summary.
  const destinationLabel =
    selectedDestination?.name ??
    (filters.destination && (destinationsLoading || destinationsError)
      ? titleCase(filters.destination.replace(/-/g, ' '))
      : null);

  // A `?q=` search counts when it resolves, with the real result count — zero
  // included, which feeds the zero-results report. trackSearch suppresses
  // consecutive duplicates, so a query the search overlay already reported in
  // this session is not counted a second time here.
  const resolvedQuery = filters.q && data ? filters.q : null;
  const resolvedTotal = data ? total : null;
  useEffect(() => {
    if (resolvedQuery) trackSearch(resolvedQuery, resolvedTotal);
  }, [resolvedQuery, resolvedTotal]);

  const chips = buildChips(filters, destinationLabel);
  const summary = chips.map((chip) => chip.label);

  const headline = chips.find((chip) => chip.headline)?.label;
  const heading = filters.q ? `Results for “${filters.q}”` : headline ? `${headline} Trips` : 'All Trips';

  /**
   * How the current result set reads, decided once so the page header and the
   * mobile filter sheet can never disagree about it.
   *
   * A failed request is not "0 trips" — that is a real result — so it gets its
   * own line and leaves the detail to the retry panel. A shortfall is impossible
   * at 68 packages and LISTING_LIMIT 100, but "68 trips" over a grid of 60 is
   * exactly the bug that limit exists to prevent, so the count reports what is
   * actually on screen whenever the two diverge.
   */
  const resultLabel = loading
    ? 'Finding trips…'
    : error
      ? 'Trips are unavailable right now.'
      : packages.length < total
        ? `Showing ${packages.length} of ${total} trips`
        : `${total} ${total === 1 ? 'trip' : 'trips'}`;

  // The filters that produced it, appended for the page header only.
  const headerLine =
    loading || error || summary.length === 0 ? resultLabel : `${resultLabel} · ${summary.join(' · ')}`;

  /**
   * Merge parameters into the URL; `null` (or '') removes one. Pushing rather
   * than replacing is deliberate — Back should undo the last filter change.
   *
   * Also the filter_applied choke point: every call is one user action (the
   * controls are onChange handlers, which is the dedup), so one event fires
   * per call with the single changed key/value. The two price keys always
   * move together and are reported as one `budget` change; `sort` is reported
   * by updateSort as its own event type instead.
   */
  const setParams = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    setSearchParams(next);

    const keys = Object.keys(patch).filter((key) => key !== 'sort');
    if (keys.length === 0) return;
    if (keys.includes('minPrice') || keys.includes('maxPrice')) {
      const min = patch.minPrice ?? '';
      const max = patch.maxPrice ?? '';
      track('filter_applied', { meta: { key: 'budget', value: min || max ? `${min}-${max}` : null } });
    } else {
      track('filter_applied', { meta: { key: keys[0], value: patch[keys[0]] ?? null } });
    }
  };

  const updateSort = (event) => {
    const value = event.target.value === DEFAULT_SORT ? null : event.target.value;
    track('sort_changed', { meta: { key: 'sort', value: event.target.value } });
    // The API's default ordering, so it stays out of the URL.
    setParams({ sort: value });
  };

  const removeChip = (chip) => setParams(Object.fromEntries(chip.keys.map((key) => [key, null])));

  // Clearing removes the filters and only the filters. The sort survives because
  // it is a display preference, and so do TravelSearch's `month` / `travellers`,
  // which are planning context for the enquiry form rather than anything the user
  // asked to filter by — see the note at the top of TravelSearch.jsx.
  const clearedParams = new URLSearchParams(searchParams);
  for (const key of FILTER_PARAMS) clearedParams.delete(key);
  const clearedPath = `/packages${clearedParams.toString() ? `?${clearedParams}` : ''}`;
  const clearAll = () => setSearchParams(clearedParams);

  return (
    <div className="pt-16 sm:pt-[68px]">
      {/* Page header */}
      <div className="bg-zinc-50/70 dark:bg-zinc-900/60">
        <Container className="py-8 sm:py-10">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Packages' }]} />

          <h1 className="mt-3 text-fluid-display font-bold text-zinc-950 dark:text-zinc-50">{heading}</h1>

          <p aria-live="polite" aria-atomic="true" className="mt-2 text-fluid-body text-zinc-600 dark:text-zinc-300">{headerLine}</p>
        </Container>
      </div>

      {/* Toolbar */}
      <Container className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PackageFilters
            filters={filters}
            destinations={destinations}
            destinationsLoading={destinationsLoading}
            destinationsError={destinationsError}
            activeCount={activeCount}
            resultLabel={resultLabel}
            onChange={setParams}
            onClear={clearAll}
          />

          <SortSelect value={filters.sort ?? DEFAULT_SORT} onChange={updateSort} />
        </div>

        <ActiveFilters
          chips={chips}
          onRemove={removeChip}
          onClear={clearAll}
          canClear={activeCount > 0}
          className="mt-3"
        />
      </Container>

      {/* Results */}
      <Container className="pb-16 sm:pb-20">
        <DataBoundary
          loading={loading}
          error={error}
          onRetry={reload}
          isEmpty={packages.length === 0}
          empty={{
            title: activeCount > 0 ? 'No trips match those filters.' : 'No trips to show yet.',
            description:
              activeCount > 0
                ? 'Try removing one — a wider budget or a longer duration usually brings results back.'
                : 'Please check back shortly, or talk to us about a custom itinerary.',
            action: activeCount > 0 ? { label: 'Clear all filters', to: clearedPath } : undefined,
          }}
          skeleton={<SkeletonGrid count={6} className={GRID} Item={PackageCardSkeleton} />}
        >
          <ul className={GRID}>
            {packages.map((pkg, index) => (
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

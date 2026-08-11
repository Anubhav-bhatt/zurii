import { apiGet, buildQuery } from './apiClient';
import { adaptDestination, adaptDestinations } from './adapters';

/**
 * Destination data access.
 *
 * Filters accepted by the API: kind ('domestic' | 'international'), country,
 * region, featured. The list endpoint includes a `packageCount` per
 * destination, so cards can show it without a second request.
 */

export async function getDestinations(filters = {}, options = {}) {
  const { data } = await apiGet(`/api/destinations${buildQuery(filters)}`, options);
  return adaptDestinations(data);
}

/**
 * The unfiltered destination list, fetched at most once per page load.
 *
 * Both the navigation menu and the homepage need the same 36 rows; without
 * this they would each request them. The in-flight promise is cached and a
 * failure clears it so a retry can succeed. Deliberately not a general cache
 * layer — this is the one response with several independent consumers.
 */
let allDestinationsPromise = null;

export function getDestinationsCached() {
  if (!allDestinationsPromise) {
    allDestinationsPromise = getDestinations().catch((err) => {
      allDestinationsPromise = null;
      throw err;
    });
  }
  return allDestinationsPromise;
}

/** Returns the destination with its published packages already attached. */
export async function getDestinationBySlug(slug, options = {}) {
  const { data } = await apiGet(`/api/destinations/${encodeURIComponent(slug)}`, options);
  return adaptDestination(data);
}

export function getDomesticDestinations(options = {}) {
  return getDestinations({ kind: 'domestic' }, options);
}

export function getInternationalDestinations(options = {}) {
  return getDestinations({ kind: 'international' }, options);
}

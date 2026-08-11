import { apiGet, buildQuery } from './apiClient';
import { adaptPackage, adaptPackages } from './adapters';

/**
 * Package data access. Components call these — never `fetch` directly.
 *
 * Filters map 1:1 onto the query parameters accepted by
 * backend/routes/travel.js:
 *   destination, featured, popular, tripType, tag,
 *   minPrice, maxPrice, duration ('1-3' | '4-6' | '7+'),
 *   q, sort, limit, offset
 */

export async function getPackages(filters = {}, options = {}) {
  const { data, meta } = await apiGet(`/api/packages${buildQuery(filters)}`, options);
  return { packages: adaptPackages(data), total: meta?.total ?? data?.length ?? 0 };
}

export async function getPackageBySlug(slug, options = {}) {
  const { data } = await apiGet(`/api/packages/${encodeURIComponent(slug)}`, options);
  return adaptPackage(data);
}

export function getFeaturedPackages(limit = 6, options = {}) {
  return getPackages({ featured: true, limit }, options);
}

export function getPopularPackages(limit = 9, options = {}) {
  return getPackages({ popular: true, limit }, options);
}

export function getPackagesByDestination(destinationSlug, options = {}) {
  return getPackages({ destination: destinationSlug }, options);
}

export function searchPackages(query, limit = 8, options = {}) {
  return getPackages({ q: query, limit }, options);
}

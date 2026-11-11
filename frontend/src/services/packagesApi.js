import { apiGet, buildQuery } from './apiClient';
import { adaptPackage, adaptPackages } from './adapters';

/**
 * Package data access. Components call these — never `fetch` directly.
 *
 * Filters map 1:1 onto the query parameters accepted by
 * backend/routes/travel.js:
 *   destination, featured, popular, tripType, tag,
 *   minPrice, maxPrice, duration ('1-3' | '4-6' | '7+'),
 *   q, sort, limit, offset, slugs
 */

export async function getPackages(filters = {}, options = {}) {
  const { data, meta } = await apiGet(`/api/packages${buildQuery(filters)}`, options);
  return { packages: adaptPackages(data), total: meta?.total ?? data?.length ?? 0 };
}

export async function getPackageBySlug(slug, options = {}) {
  const { data } = await apiGet(`/api/packages/${encodeURIComponent(slug)}`, options);
  return adaptPackage(data);
}

/**
 * Cards for a known list of slugs (wishlist, recently viewed) in ONE request,
 * in the order given. `missing` lists the slugs that are no longer published.
 * Replaces one full-detail request per slug (ZT-39).
 */
export async function getPackagesBySlugs(slugs, options = {}) {
  const wanted = [...new Set((slugs ?? []).filter(Boolean))].slice(0, 50);
  if (wanted.length === 0) return { packages: [], missing: [] };
  const { data } = await apiGet(`/api/packages${buildQuery({ slugs: wanted.join(',') })}`, options);
  const packages = adaptPackages(data);
  const found = new Set(packages.map((pkg) => pkg.slug));
  return { packages, missing: wanted.filter((slug) => !found.has(slug)) };
}

export function getFeaturedPackages(limit = 6, options = {}) {
  return getPackages({ featured: true, limit }, options);
}

export function getPopularPackages(limit = 9, options = {}) {
  return getPackages({ popular: true, limit }, options);
}

/**
 * Search suggestions, remembered for a minute: retyping a query, or deleting a
 * letter and typing it again, does not ask the server twice. Keys ignore case
 * and spacing. A failed request is forgotten so the next attempt retries.
 */
const SEARCH_CACHE_MS = 60_000;
const SEARCH_CACHE_SIZE = 30;
const searchCache = new Map();

export function searchPackages(query, limit = 8, options = {}) {
  const key = `${String(query).trim().toLowerCase().replace(/\s+/g, ' ')}|${limit}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_MS) return hit.promise;

  // Not tied to the caller's abort signal: an aborted keystroke must not
  // poison the cache entry another keystroke may be waiting on.
  const promise = getPackages({ q: query, limit }).catch((err) => {
    searchCache.delete(key);
    throw err;
  });
  searchCache.set(key, { at: Date.now(), promise });
  while (searchCache.size > SEARCH_CACHE_SIZE) searchCache.delete(searchCache.keys().next().value);
  if (options.signal) {
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
      if (options.signal.aborted) return onAbort();
      options.signal.addEventListener('abort', onAbort, { once: true });
      promise.then(resolve, reject).finally(() => options.signal.removeEventListener('abort', onAbort));
      return undefined;
    });
  }
  return promise;
}

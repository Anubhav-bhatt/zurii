/**
 * Where the public site lives and whether this build may be indexed (ZT-17).
 * Read once at build time by vite.config.js (for the app bundle) and by
 * scripts/prerender.mjs (for the static HTML), so the two always agree.
 *
 *   VITE_SITE_URL   the canonical origin, e.g. https://www.example.com — no path.
 *                   Unset: pages carry no canonical/og:url and no sitemap is
 *                   written (both need absolute URLs). Never guessed.
 *   VERCEL_ENV      set by Vercel. 'preview' or 'development' builds are never
 *                   indexable, whatever else is set.
 *   SITE_NOINDEX    'true' for any other non-production build (a Docker staging
 *                   server): every page noindex, robots.txt disallows all.
 */
export function resolveSiteEnv(env = process.env) {
  const raw = String(env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');
  const origin = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(raw) ? raw.toLowerCase() : '';
  const preview = Boolean(env.VERCEL_ENV) && env.VERCEL_ENV !== 'production';
  const forced = String(env.SITE_NOINDEX ?? '').toLowerCase() === 'true';
  return {
    origin,
    indexable: !preview && !forced,
    reason: preview ? `Vercel ${env.VERCEL_ENV} build` : forced ? 'SITE_NOINDEX=true' : null,
    invalidOrigin: raw && !origin ? raw : null,
  };
}

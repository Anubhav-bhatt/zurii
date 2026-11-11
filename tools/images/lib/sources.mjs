/**
 * Image inventory and licence classification.
 *
 * Collects every image reference the site uses — the catalogue artifact (what
 * the database is seeded from), the static frontend data (blogs, testimonial
 * avatars) and the Corporate Tours page — and groups them by source image so
 * each photo is downloaded once however many places use it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
export const CATALOGUE_V1 = path.join(ROOT, 'backend/db/catalogue/catalogue.v1.json');
export const FRONTEND_DATA = path.join(ROOT, 'frontend/src/data/index.js');
export const CORPORATE_PAGE = path.join(ROOT, 'frontend/src/pages/CorporateTours.jsx');
export const LOCAL_PREFIX = '/assets/travel/';

/**
 * Licence decisions are made per SOURCE, from the URL alone, and are
 * deliberately conservative: anything not positively recognised is excluded.
 * Evidence was read on 2026-11-10; re-check before adding a new source.
 */
export const LICENCES = {
  'unsplash-license': {
    permitted: true,
    name: 'Unsplash License',
    evidence: 'https://unsplash.com/license — free to download, copy, modify, distribute and use, commercially, without permission; no resale of unmodified copies, no competing image service.',
  },
  'unsplash-plus': {
    permitted: false,
    name: 'Unsplash+ License (subscription)',
    evidence: 'https://unsplash.com/license links a separate Unsplash+ License; redistribution rights depend on a subscription that has not been evidenced.',
  },
  'dicebear-avataaars': {
    permitted: true,
    name: 'Avataaars by Pablo Stanley — free for personal and commercial use',
    evidence: 'https://www.dicebear.com/licenses/ — "Free for personal and commercial use". The designer\'s own page (avataaars.com) could not be read on the check date (expired TLS certificate).',
  },
  unknown: { permitted: false, name: 'Unrecognised source', evidence: 'No licence established.' },
};

/** → { identifier, licence, kind } for a remote URL, or null if it is not one. */
export function classify(reference) {
  let url;
  try { url = new URL(reference); } catch { return null; }
  if (url.protocol !== 'https:') return { identifier: reference, licence: 'unknown', kind: 'photo' };
  const { hostname, pathname } = url;
  if (hostname === 'images.unsplash.com' && /^\/photo-[A-Za-z0-9-]+$/.test(pathname)) {
    return { identifier: `${hostname}${pathname}`, licence: 'unsplash-license', kind: 'photo' };
  }
  if (hostname === 'plus.unsplash.com' || /^\/premium_photo-/.test(pathname)) {
    return { identifier: `${hostname}${pathname}`, licence: 'unsplash-plus', kind: 'photo' };
  }
  if (hostname === 'api.dicebear.com' && pathname === '/7.x/avataaars/svg' && /^[A-Za-z0-9]+$/.test(url.searchParams.get('seed') || '')) {
    return { identifier: `${hostname}${pathname}?seed=${url.searchParams.get('seed')}`, licence: 'dicebear-avataaars', kind: 'avatar' };
  }
  return { identifier: `${hostname}${pathname}`, licence: 'unknown', kind: 'photo' };
}

const slugify = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Every reference, in a stable order. `context` names the asset; `hero` asks for the largest rendition. */
export async function collectReferences() {
  const refs = [];
  const add = (origin, entity, slug, field, position, original, context, hero) => {
    if (typeof original === 'string' && original.trim()) refs.push({ origin, entity, slug, field, position, original, context, hero });
  };

  const catalogue = JSON.parse(fs.readFileSync(CATALOGUE_V1, 'utf8'));
  for (const d of catalogue.destinations) {
    add('catalogue', 'destination', d.slug, 'image', 0, d.image, `dest-${d.slug}`, true);
    (d.gallery || []).forEach((g, i) => add('catalogue', 'destination', d.slug, 'gallery', i, g, `dest-${d.slug}-g${i + 1}`, false));
  }
  for (const p of catalogue.packages) {
    add('catalogue', 'package', p.slug, 'cover_image', 0, p.cover_image, `trip-${p.slug}`, true);
    (p.gallery || []).forEach((g, i) => add('catalogue', 'package', p.slug, 'gallery', i, g, `trip-${p.slug}-g${i + 1}`, false));
  }

  const data = await import(pathToFileURL(FRONTEND_DATA).href);
  for (const g of data.guides) add('frontend', 'blog', g.slug, 'image', 0, g.image, `blog-${g.slug}`, false);
  for (const t of data.testimonials) add('frontend', 'testimonial', slugify(t.name), 'image', 0, t.image, `avatar-${slugify(t.name)}`, false);

  const corporate = fs.readFileSync(CORPORATE_PAGE, 'utf8');
  const tours = [...corporate.matchAll(/title:\s*"([^"]+)"[\s\S]*?image:\s*"([^"]+)"/g)];
  tours.forEach((m, i) => add('frontend', 'corporate-tour', slugify(m[1]), 'image', i, m[2], `corporate-${slugify(m[1])}`, false));

  return refs;
}

/**
 * Groups references by source image. References that already point at a local
 * asset (a re-run after migration) are resolved back through the previous
 * manifest so the mapping to the original identifier is never lost.
 */
export function groupBySource(refs, previousManifest) {
  const byLocalPath = new Map();
  for (const asset of previousManifest?.assets || []) for (const f of asset.files) byLocalPath.set(f.path, asset);

  const groups = new Map();
  const orphans = [];
  for (const ref of refs) {
    let info = classify(ref.original);
    let original = ref.original;
    if (!info && ref.original.startsWith(LOCAL_PREFIX)) {
      const asset = byLocalPath.get(ref.original);
      const prior = asset?.references.find((r) => r.origin === ref.origin && r.entity === ref.entity && r.slug === ref.slug && r.field === ref.field && r.position === ref.position);
      if (asset && prior) { original = prior.original; info = classify(original); }
    }
    if (!info) { orphans.push(ref); continue; }
    if (!groups.has(info.identifier)) groups.set(info.identifier, { ...info, hero: false, references: [] });
    const group = groups.get(info.identifier);
    group.hero = group.hero || ref.hero;
    group.references.push({ ...ref, original });
  }
  return { groups: [...groups.values()], orphans };
}

import { useEffect, useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { SITE } from '../config/site';
import { SITE_INDEXABLE, SITE_ORIGIN } from './env';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_IMAGE,
  NOINDEX_PREFIXES,
  SITE_NAME,
  canonicalPath,
  headTags,
  notFoundMeta,
  privateMeta,
  staticPageMeta,
  structuredData,
  tagKey,
} from './meta';

const LD_ID = 'zurii-structured-data';

/**
 * Write a page's metadata into the live document. The tags are the ones
 * scripts/prerender.mjs prints into the static HTML (same builder, marked
 * data-seo), so navigation updates them in place and removes the ones the
 * new page does not have — a noindex page loses its canonical, for example.
 */
export function applySeo(meta, doc = globalThis.document) {
  if (!meta || !doc?.head) return;
  doc.title = meta.title;
  const keep = new Set();
  for (const tag of headTags(meta, { origin: SITE_ORIGIN, indexable: SITE_INDEXABLE })) {
    const [name, attrs] = tag;
    const selector = tagKey(tag);
    let el = doc.head.querySelector(selector);
    if (!el) {
      el = doc.createElement(name);
      doc.head.appendChild(el);
    }
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    el.setAttribute('data-seo', '');
    keep.add(el);
  }
  for (const el of doc.head.querySelectorAll('[data-seo]')) if (!keep.has(el)) el.remove();

  const ld = structuredData(meta, { origin: SITE_ORIGIN, site: SITE });
  let script = doc.getElementById(LD_ID);
  if (ld) {
    if (!script) {
      script = doc.createElement('script');
      script.type = 'application/ld+json';
      script.id = LD_ID;
      doc.head.appendChild(script);
    }
    script.textContent = JSON.stringify(ld);
  } else {
    script?.remove();
  }
}

/** Metadata for a pathname before any page data has loaded. */
export function routeMeta(pathname) {
  const path = canonicalPath(pathname);
  if (NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return privateMeta(path);
  const page = staticPageMeta(path);
  if (page) return page;
  // A detail page sets its own metadata once its data arrives; until then a
  // neutral title, never "not found" — a slow API must not look like a 404.
  if (/^\/(trip|destination|blog)\/[^/]+$/.test(path)) {
    return { path, type: 'website', title: SITE_NAME, description: DEFAULT_DESCRIPTION, image: DEFAULT_IMAGE };
  }
  return notFoundMeta(path);
}

/**
 * Route defaults on every navigation. A layout effect, so it runs before the
 * new page's own useSeo (a passive effect) in the same commit — the page wins.
 */
export function SeoManager() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    applySeo(routeMeta(pathname));
  }, [pathname]);
  return null;
}

/** A page's own metadata, applied whenever it changes. `null` keeps the route default. */
export function useSeo(meta) {
  const key = meta ? JSON.stringify(meta) : '';
  useEffect(() => {
    if (key) applySeo(JSON.parse(key));
  }, [key]);
}

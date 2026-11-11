/* global __SITE_ORIGIN__, __SITE_INDEXABLE__ */
/**
 * Build-time site settings (vite.config.js → scripts/siteEnv.mjs). Outside a
 * Vite build (node --test) they fall back to "no origin, indexable".
 */
export const SITE_ORIGIN = typeof __SITE_ORIGIN__ === 'string' ? __SITE_ORIGIN__ : '';
export const SITE_INDEXABLE = typeof __SITE_INDEXABLE__ === 'boolean' ? __SITE_INDEXABLE__ : true;

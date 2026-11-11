#!/usr/bin/env node
/**
 * Build-time prerendering of public pages (ZT-17). Runs after `vite build`.
 *
 * The site is a React SPA: without this, every URL returns the same HTML with
 * the title "Zurii", so link-preview bots (WhatsApp, Facebook, X, Slack) and
 * any crawler that does not run JavaScript see nothing page-specific. This
 * writes, from the approved catalogue artifact and the site's own data:
 *
 *   dist/index.html, dist/<route>/index.html   every public page: its title,
 *        description, canonical, Open Graph/Twitter tags, JSON-LD, and a
 *        <noscript> copy of its main content for non-JavaScript crawlers. The
 *        app still mounts and renders exactly as before — the noscript block
 *        is invisible whenever JavaScript runs.
 *   dist/spa-fallback.html   the app shell with neutral metadata, served for a
 *        trip/destination/blog URL that has no prerendered page (content added
 *        to the database after this build); the app then sets the metadata.
 *   dist/404.html            noindex shell for unknown URLs (served with 404)
 *   dist/sitemap.xml         published content only — when VITE_SITE_URL is set
 *   dist/robots.txt          disallow-all for preview/staging builds
 *
 * Inputs: dist/index.html (the Vite build), backend/db/catalogue/catalogue.v2.json
 * (published packages, active destinations), src/data (travel guides),
 * src/config/site.js. Settings: scripts/siteEnv.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveSiteEnv } from './siteEnv.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(FRONTEND, 'dist');
const ARTIFACT = path.resolve(FRONTEND, '../backend/db/catalogue/catalogue.v2.json');
const importSrc = (rel) => import(pathToFileURL(path.join(FRONTEND, 'src', rel)).href);

const meta = await importSrc('seo/meta.js');
const { SITE } = await importSrc('config/site.js');
const { guides } = await importSrc('data/index.js');

const site = resolveSiteEnv(process.env);
const { origin, indexable } = site;

// ── template ──────────────────────────────────────────────────────────
const START = '<!--seo:start-->';
const END = '<!--seo:end-->';
const templateFile = path.join(DIST, 'index.html');
if (!fs.existsSync(templateFile)) throw new Error('dist/index.html not found — run `vite build` first.');
// Idempotent: a template that already carries a previous run's blocks is cleaned first.
const template = fs.readFileSync(templateFile, 'utf8')
  .replace(new RegExp(`${START}[\\s\\S]*?${END}`, 'g'), '')
  .replace(/<noscript data-seo-body>[\s\S]*?<\/noscript>/g, '');
if (!/<title>[^<]*<\/title>/.test(template) || !template.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html does not have the expected <title> and <div id="root"></div>.');
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${esc(v)}"`).join(' ');

function render(pageMeta, body) {
  const tags = meta.headTags(pageMeta, { origin, indexable })
    .map(([tag, a]) => (tag === 'link' ? `<link ${attrs(a)} data-seo>` : `<meta ${attrs(a)} data-seo>`));
  const ld = meta.structuredData(pageMeta, { origin, site: SITE });
  // JSON in a script element: only "<" needs neutralising (no "</script>" can appear).
  if (ld) tags.push(`<script type="application/ld+json" id="zurii-structured-data">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(pageMeta.title)}</title>`)
    .replace('</head>', `  ${START}\n  ${tags.join('\n  ')}\n  ${END}\n</head>`)
    .replace('<div id="root"></div>', `<div id="root"></div>\n  <noscript data-seo-body>${body}</noscript>`);
}

const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const list = (items) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');
const section = (h1, ...parts) => `<main><h1>${esc(h1)}</h1>${parts.filter(Boolean).join('')}</main>`;
const para = (text) => (text ? `<p>${esc(text)}</p>` : '');

// ── content ───────────────────────────────────────────────────────────
const artifact = JSON.parse(fs.readFileSync(ARTIFACT, 'utf8'));
const destinations = artifact.destinations.filter((d) => d.active !== false);
const destinationBySlug = new Map(destinations.map((d) => [d.slug, d]));
const packages = artifact.packages.filter((p) => p.status === 'PUBLISHED');
const tripLink = (p) => link(`/trip/${p.slug}`, [p.title, p.duration_text].filter(Boolean).join(' — '));

const pages = [];
const add = (route, pageMeta, body, { sitemap = !pageMeta.noindex, lastmod = null } = {}) => pages.push({ route, pageMeta, body, sitemap, lastmod });

const nav = list([link('/packages', 'All trips'), link('/plan-my-trip', 'Plan my trip'), link('/blogs', 'Travel guides'), link('/contact-us', 'Contact us')]);

add('/', meta.staticPageMeta('/'), section('Explore the world with Zurii',
  para('Curated holidays and unforgettable experiences, designed around the way you want to travel.'),
  '<h2>Destinations</h2>', list(destinations.map((d) => link(`/destination/${d.slug}`, d.name))), nav));

add('/packages', meta.staticPageMeta('/packages'), section('All Trips', para(meta.STATIC_PAGES['/packages'].description), list(packages.map(tripLink))));

add('/blogs', meta.staticPageMeta('/blogs'), section('Travel Guides & Stories', para(meta.STATIC_PAGES['/blogs'].description),
  list(guides.map((g) => link(`/blog/${g.slug}`, g.title)))));

const HEADINGS = {
  '/about': 'Trips planned by people, not algorithms', '/contact-us': "Let's plan your trip", '/corporate-tours': 'Corporate Tours',
  '/weekend-trips': 'Weekend Trips', '/plan-my-trip': 'Tell us the trip you have in mind', '/wishlist': 'Saved Trips',
  '/no-cost-emi': 'No-Cost EMI', '/payment-policy': 'Payment Details', '/cancellation-policy': 'Cancellation Policy',
  '/privacy-policy': 'Privacy Policy', '/terms-conditions': 'Terms & Conditions',
};
for (const [route, h1] of Object.entries(HEADINGS)) {
  const pageMeta = meta.staticPageMeta(route);
  const extra = route === '/weekend-trips'
    ? list(packages.filter((p) => p.duration_days && p.duration_days <= 3).map(tripLink))
    : route === '/contact-us' ? list([...SITE.phones.map((p) => link(p.href, p.label)), link(SITE.email.href, SITE.email.label)]) : '';
  add(route, pageMeta, section(h1, para(pageMeta.description), extra, nav));
}

for (const d of destinations) {
  const mine = packages.filter((p) => p.destination_slug === d.slug);
  add(`/destination/${d.slug}`,
    meta.destinationMeta({ slug: d.slug, name: d.name, country: d.country, summary: d.short_description, description: d.description, image: d.image }),
    section(d.name, para(d.short_description), para(d.description), mine.length ? `<h2>Trips to ${esc(d.name)}</h2>${list(mine.map(tripLink))}` : '',
      list([link(`/plan-my-trip?destination=${encodeURIComponent(d.slug)}`, `Plan a trip to ${d.name}`)])));
}

for (const p of packages) {
  const dest = destinationBySlug.get(p.destination_slug);
  const days = (p.itinerary ?? []).filter((day) => day?.title).map((day) => `Day ${esc(day.day)}: ${esc(day.title)}`);
  add(`/trip/${p.slug}`,
    meta.packageMeta({ slug: p.slug, title: p.title, summary: p.short_description || p.subtitle, description: p.description, image: p.cover_image, durationText: p.duration_text, destinationName: dest?.name }),
    section(p.title, para(p.subtitle), para(p.duration_text), para(p.description),
      days.length ? `<h2>Itinerary</h2><ol>${days.map((d) => `<li>${d}</li>`).join('')}</ol>` : '',
      list([dest ? link(`/destination/${dest.slug}`, `More trips to ${dest.name}`) : '', link('/plan-my-trip', 'Plan my trip')].filter(Boolean))));
}

for (const g of guides) {
  const paragraphs = String(g.content ?? '').split(/\n{2,}/).map((block) => {
    const text = block.replace(/\*\*/g, '').trim();
    if (!text) return '';
    const heading = /^#{2,3}\s+(.*)$/.exec(text);
    return heading ? `<h2>${esc(heading[1])}</h2>` : `<p>${esc(text.replace(/^[-*]\s+/gm, '• '))}</p>`;
  }).join('');
  const guideMeta = meta.guideMeta(g);
  add(`/blog/${g.slug}`, guideMeta, section(g.title, para(g.subtitle), para([g.date, g.author].filter(Boolean).join(' · ')), paragraphs),
    { lastmod: guideMeta.published });
}

// ── write ─────────────────────────────────────────────────────────────
const fileFor = (route) => (route === '/' ? path.join(DIST, 'index.html') : path.join(DIST, route.slice(1), 'index.html'));
const seen = new Set();
for (const page of pages) {
  if (seen.has(page.route)) throw new Error(`duplicate route ${page.route}`);
  seen.add(page.route);
  const file = fileFor(page.route);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, render(page.pageMeta, page.body));
}

const neutral = { path: '/', type: 'website', title: meta.SITE_NAME, description: meta.DEFAULT_DESCRIPTION, image: meta.DEFAULT_IMAGE, canonical: false };
fs.writeFileSync(path.join(DIST, 'spa-fallback.html'), render(neutral, section(meta.SITE_NAME, para(meta.DEFAULT_DESCRIPTION), nav)));
fs.writeFileSync(path.join(DIST, '404.html'), render(meta.notFoundMeta('/404'), section('This page could not be found', para('The link may be old or mistyped.'), nav)));

const inSitemap = pages.filter((p) => p.sitemap);
if (origin && indexable) {
  const urls = inSitemap.map((p) => `  <url><loc>${esc(meta.absoluteUrl(origin, p.route))}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`);
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
} else {
  fs.rmSync(path.join(DIST, 'sitemap.xml'), { force: true });
}

const robots = indexable
  ? ['User-agent: *', 'Disallow: /admin', 'Disallow: /dashboard', 'Disallow: /api/', 'Disallow: /packages?q=', 'Disallow: /spa-fallback.html',
    ...(origin ? ['', `Sitemap: ${origin}/sitemap.xml`] : [])]
  : ['# Not a production build: nothing here may be indexed.', 'User-agent: *', 'Disallow: /'];
fs.writeFileSync(path.join(DIST, 'robots.txt'), `${robots.join('\n')}\n`);

console.log(`prerender: ${pages.length} pages (${destinations.length} destinations, ${packages.length} trips, ${guides.length} guides) · `
  + `sitemap ${origin && indexable ? `${inSitemap.length} URLs` : 'not written'} · origin ${origin || '(unset)'} · `
  + `${indexable ? 'indexable' : `noindex (${site.reason})`}${site.invalidOrigin ? ` · ignored invalid VITE_SITE_URL "${site.invalidOrigin}"` : ''}`);

#!/usr/bin/env node
/**
 * Checks the prerendered build in dist/ the way a crawler would read it (ZT-17).
 * Used by CI after `npm run build` with a placeholder VITE_SITE_URL; needs no server.
 *
 *   npm run check:seo -- https://example.org     (the origin the build used)
 *
 * Fails when: a sitemap URL has no page, a page lacks its own title,
 * description, single canonical (= its sitemap URL), robots, Open Graph tags or
 * a single h1, JSON-LD does not parse, titles repeat, the sitemap lists
 * private/search/query URLs, or the 404 page / app shell could be indexed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const origin = (process.argv[2] || '').replace(/\/+$/, '');
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (rel) => (fs.existsSync(path.join(DIST, rel)) ? fs.readFileSync(path.join(DIST, rel), 'utf8') : null);
const one = (html, re) => (re.exec(html) || [])[1] ?? null;
const many = (html, re) => [...html.matchAll(re)].map((m) => m[1]);

if (!origin) {
  console.error('usage: node scripts/check-seo.mjs <origin the build used, e.g. https://example.org>');
  process.exit(2);
}

const robots = read('robots.txt') ?? '';
if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) fail('robots.txt does not name the sitemap');
for (const rule of ['Disallow: /admin', 'Disallow: /api/', 'Disallow: /packages?q=']) if (!robots.includes(rule)) fail(`robots.txt lacks "${rule}"`);
if (/^Disallow: \/$/m.test(robots)) fail('robots.txt disallows the whole site');

const sitemap = read('sitemap.xml');
const locs = sitemap ? many(sitemap, /<loc>([^<]+)<\/loc>/g) : [];
if (!locs.length) fail('sitemap.xml is missing or empty');
if (new Set(locs).size !== locs.length) fail('sitemap.xml lists a URL twice');

const titles = new Map();
for (const loc of locs) {
  if (!loc.startsWith(`${origin}/`)) { fail(`${loc}: not on ${origin}`); continue; }
  const route = loc.slice(origin.length);
  if (/\?|#|\/(admin|dashboard|api|wishlist)\b/.test(route)) fail(`${route}: must not be in the sitemap`);
  const html = read(route === '/' ? 'index.html' : path.join(route.slice(1), 'index.html'));
  if (!html) { fail(`${route}: no prerendered page`); continue; }
  const head = html.slice(0, html.indexOf('</head>'));
  const body = one(html, /<noscript data-seo-body>([\s\S]*?)<\/noscript>/) ?? '';
  const title = one(head, /<title>([^<]*)<\/title>/);
  const description = one(head, /<meta name="description" content="([^"]*)"/);
  const canonicals = many(head, /<link rel="canonical" href="([^"]*)"/g);
  const names = many(head, /<meta (?:name|property)="([^"]+)"/g);
  const where = `${route}:`;
  if (!title || title === 'Zurii Travels') fail(`${where} generic or missing title`);
  if (titles.has(title)) fail(`${where} title repeats ${titles.get(title)}`);
  titles.set(title, route);
  if (!description || description.length < 40 || description.length > 170) fail(`${where} description length ${description?.length}`);
  if (canonicals.length !== 1 || canonicals[0] !== loc) fail(`${where} canonical ${canonicals.join(', ') || 'missing'}`);
  if (one(head, /<meta property="og:url" content="([^"]*)"/) !== loc) fail(`${where} og:url`);
  if (one(head, /<meta name="robots" content="([^"]*)"/) !== 'index, follow') fail(`${where} robots`);
  for (const tag of ['og:title', 'og:description', 'og:image', 'twitter:card']) if (!names.includes(tag)) fail(`${where} missing ${tag}`);
  if (new Set(names).size !== names.length) fail(`${where} duplicate meta tags`);
  const ld = one(head, /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
  if (ld) { try { JSON.parse(ld); } catch { fail(`${where} JSON-LD does not parse`); } }
  if ((body.match(/<h1>/g) || []).length !== 1) fail(`${where} needs exactly one h1`);
}

const notFound = read('404.html') ?? '';
if (!/<meta name="robots" content="noindex, nofollow"/.test(notFound)) fail('404.html is not noindex');
const shell = read('spa-fallback.html') ?? '';
if (!shell || /rel="canonical"/.test(shell)) fail('spa-fallback.html missing or carries a canonical');

if (problems.length) {
  console.error(`✗ SEO output: ${problems.length} problem(s)\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
console.log(`✓ SEO output: ${locs.length} sitemap URLs, each with its own title, description, canonical and previews; robots.txt, 404 and shell correct`);

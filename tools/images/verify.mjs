#!/usr/bin/env node
/**
 * Image integrity check:  node verify.mjs
 *
 * Read-only. Proves that every file the manifests promise exists with the
 * recorded bytes, hash, format and dimensions; that nothing references a path
 * that is not on disk (the static host answers a missing asset with the SPA's
 * index.html, so a broken path is otherwise silent); and lists what is still
 * loaded from a remote host. Exits non-zero on any failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { ROOT } from './lib/sources.mjs';
import { sha256 } from './lib/fetch.mjs';

const PUBLIC_DIR = path.join(ROOT, 'frontend/public');
const DIST_DIR = path.join(ROOT, 'frontend/dist');
const read = (file) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'manifest', file), 'utf8'));
const manifest = read('image-manifest.v1.json');
const brand = read('brand-manifest.v1.json');
const failures = [];
const fail = (message) => failures.push(message);
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

// 1. Every manifest file: present, exact bytes, exact hash, decodes to what was recorded.
const promised = [...manifest.assets.flatMap((a) => a.files), ...brand.files];
for (const f of promised) {
  const file = path.join(PUBLIC_DIR, f.path);
  if (!fs.existsSync(file)) { fail(`missing file ${f.path}`); continue; }
  const buffer = fs.readFileSync(file);
  if (buffer.length !== f.bytes || sha256(buffer) !== f.sha256) { fail(`content differs from manifest: ${f.path}`); continue; }
  const meta = await sharp(buffer).metadata();
  const format = meta.format === 'heif' ? 'avif' : meta.format;
  if (format !== f.format || meta.width !== f.width || meta.height !== f.height) fail(`decodes as ${format} ${meta.width}x${meta.height}, manifest says ${f.format} ${f.width}x${f.height}: ${f.path}`);
}

// 2. Nothing on disk that the manifests do not account for.
const known = new Set(promised.map((f) => f.path));
const onDisk = [...walk(path.join(PUBLIC_DIR, 'assets/travel')), ...walk(path.join(PUBLIC_DIR, 'assets/brand'))].map((f) => `/${path.relative(PUBLIC_DIR, f).split(path.sep).join('/')}`);
for (const file of onDisk) if (!known.has(file)) fail(`file not in any manifest: ${file}`);

// 3. Manifests are portable and internally consistent.
for (const [name, value] of [['image-manifest', manifest], ['brand-manifest', brand]]) {
  if (/(?:\/Users\/|\/home\/|\/private\/|file:\/\/|[A-Za-z]:\\\\)/.test(JSON.stringify(value))) fail(`${name} contains a machine path`);
}
const ids = new Set();
for (const a of manifest.assets) {
  if (ids.has(a.id)) fail(`duplicate asset id ${a.id}`);
  ids.add(a.id);
  if (!a.files.some((f) => f.path === a.src)) fail(`asset ${a.id}: src ${a.src} is not one of its files`);
  if (!manifest.licences[a.source.licence]?.permitted) fail(`asset ${a.id} was migrated under a non-permitted licence`);
  if (a.references.length === 0) fail(`asset ${a.id} has no references`);
  for (const w of a.widths) for (const ext of ['avif', 'webp']) if (!known.has(`${manifest.publicBase}/${a.id}/${w}.${ext}`)) fail(`asset ${a.id}: no ${w}.${ext}`);
}
const t = manifest.totals;
if (t.referencesMigrated + t.referencesUnresolved !== t.references) fail('reference totals do not add up');
if (t.migrated + manifest.unresolved.length !== t.uniqueSources) fail('source totals do not add up');

// 4. The generated runtime module is exactly the manifest.
const runtime = await import(pathToFileURL(path.join(ROOT, 'frontend/src/data/travelImages.generated.js')).href);
const expected = Object.fromEntries(manifest.assets.filter((a) => a.kind === 'photo').map((a) => [a.id, [a.width, a.height, ...a.widths]]));
if (runtime.TRAVEL_IMAGE_BASE !== manifest.publicBase || JSON.stringify(runtime.TRAVEL_IMAGES) !== JSON.stringify(expected)) fail('frontend/src/data/travelImages.generated.js is out of date — re-run build.mjs');

// 5. Broken-path scan: every local asset path mentioned anywhere must be a real file — in public/, and in dist/ when built.
const scanned = [
  'backend/db/catalogue/catalogue.v2.json',
  ...walk(path.join(ROOT, 'frontend/src')).filter((f) => /\.(jsx?|css)$/.test(f)).map((f) => path.relative(ROOT, f)),
  'frontend/index.html',
];
const LOCAL = /\/assets\/(?:travel|brand)\/[A-Za-z0-9._\-/]+\.(?:avif|webp|jpe?g|png|svg)/g;
const REMOTE = /https?:\/\/[^\s"'`)\\]+/g;
const NOT_IMAGES = /^https?:\/\/(www\.w3\.org|wa\.me|localhost|maps\.google\.com|www\.instagram\.com|sales\.zuriitravels\.com|vite\.dev|react\.dev|schema\.org|fonts\.(googleapis|gstatic)\.com|connect\.facebook\.net|www\.facebook\.com)/; // Meta Pixel script + endpoint, not images
const DEAD_DATA = /frontend\/src\/data\/(categoryData|testimonialData|tripsCarouselData|domesticData)\.js$/;
const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));
let localRefs = 0;
const remote = new Map();
for (const rel of scanned) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  for (const ref of text.match(LOCAL) || []) {
    localRefs += 1;
    if (!fs.existsSync(path.join(PUBLIC_DIR, ref))) fail(`${rel}: ${ref} does not exist in frontend/public`);
    else if (hasDist && !fs.existsSync(path.join(DIST_DIR, ref))) fail(`${rel}: ${ref} is missing from frontend/dist`);
  }
  const bucket = rel.endsWith('catalogue.v2.json') ? 'catalogue (database)' : DEAD_DATA.test(rel) ? 'unused source files (not bundled)' : rel.endsWith('src/data/index.js') ? 'catalogue seed input (not bundled)' : 'frontend runtime';
  for (const url of text.match(REMOTE) || []) {
    if (NOT_IMAGES.test(url) || !URL.canParse(url)) continue; // unparseable = prose in a comment, not a reference
    if (!remote.has(bucket)) remote.set(bucket, new Map());
    const key = url.split('?')[0];
    remote.get(bucket).set(key, (remote.get(bucket).get(key) || 0) + 1);
  }
}
if (hasDist) for (const f of promised) if (!fs.existsSync(path.join(DIST_DIR, f.path))) fail(`not in frontend/dist: ${f.path}`);

// 6. The built bundle itself must not carry a remote image URL — only catalogue rows served by the API may.
const bundled = hasDist ? [...walk(path.join(DIST_DIR, 'assets')).filter((f) => /\.(js|css)$/.test(f)), path.join(DIST_DIR, 'index.html')] : [];
const REMOTE_IMAGE = /https?:\/\/[A-Za-z0-9.-]*(?:unsplash\.com|dicebear\.com)[^\s"'`)\\]*/g;
const bundledRemote = new Set(bundled.flatMap((f) => fs.readFileSync(f, 'utf8').match(REMOTE_IMAGE) || []));
for (const url of bundledRemote) fail(`built bundle references a remote image: ${url}`);

console.log(`manifest files   ${promised.length} checked (bytes, sha256, decode, dimensions)`);
console.log(`files on disk    ${onDisk.length} under public/assets/{travel,brand}, all accounted for: ${onDisk.every((f) => known.has(f))}`);
console.log(`local references ${localRefs} scanned in ${scanned.length} files; dist checked: ${hasDist}`);
console.log(`assets           ${manifest.assets.length} migrated · unresolved ${manifest.unresolved.length}`);
console.log(`built bundle     ${hasDist ? `${bundled.length} JS/CSS/HTML files, remote image URLs: ${bundledRemote.size}` : 'not built — run the frontend build to include it'}`);
for (const [bucket, urls] of remote) {
  const hosts = {};
  for (const url of urls.keys()) { const h = new URL(url).hostname; hosts[h] = (hosts[h] || 0) + 1; }
  console.log(`remote image URLs — ${bucket}: ${urls.size} unique ${JSON.stringify(hosts)}`);
}
if (failures.length) {
  console.error(`\n✗ ${failures.length} problem(s):\n  - ${failures.slice(0, 40).join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✓ image integrity verified');

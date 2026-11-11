#!/usr/bin/env node
/**
 * Catalogue v2 = catalogue v1 with image references pointed at locally hosted
 * assets, using the versioned image manifest as the only mapping.
 *
 *   node scripts/catalogue-localize.mjs           # (re)write db/catalogue/catalogue.v2.json
 *   node scripts/catalogue-localize.mjs --check   # fail if v2 is stale
 *
 * Nothing but image references changes: every other field of every record is
 * copied from v1 untouched. A reference the manifest could not migrate (see
 * its "unresolved" list — e.g. Unsplash+ photos) keeps its original remote
 * URL, so it goes on working. Dev-time only; reads no database.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { validateArtifact } = require('../db/catalogueSeed.js');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const V1 = 'backend/db/catalogue/catalogue.v1.json';
const V2 = 'backend/db/catalogue/catalogue.v2.json';
const MANIFEST = 'tools/images/manifest/image-manifest.v1.json';
const read = (file) => fs.readFileSync(path.join(REPO, file));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const v1 = JSON.parse(read(V1));
const manifest = JSON.parse(read(MANIFEST));

const key = (entity, slug, field, position) => `${entity}|${slug}|${field}|${position}`;
const local = new Map();
for (const asset of manifest.assets) {
  for (const ref of asset.references) {
    if (ref.origin === 'catalogue') local.set(key(ref.entity, ref.slug, ref.field, ref.position), { src: asset.src, original: ref.original });
  }
}
const retained = new Map();
for (const item of manifest.unresolved) {
  for (const ref of item.references) {
    if (ref.origin === 'catalogue') retained.set(key(ref.entity, ref.slug, ref.field, ref.position), item.reason);
  }
}

const stats = { rewritten: 0, retained: 0 };
function localize(entity, slug, field, position, value) {
  if (value === null || value === undefined) return value;
  const k = key(entity, slug, field, position);
  const hit = local.get(k);
  if (hit) {
    if (hit.original !== value) throw new Error(`${k}: manifest was built from "${hit.original}" but v1 holds "${value}" — re-run the image pipeline.`);
    stats.rewritten += 1;
    return hit.src;
  }
  if (!retained.has(k)) throw new Error(`${k}: "${value}" is in neither the manifest's assets nor its unresolved list — re-run the image pipeline.`);
  stats.retained += 1;
  return value;
}

const v2 = {
  ...v1,
  version: 2,
  source: {
    ...v1.source,
    derivedFrom: { file: V1, sha256: sha256(read(V1)) },
    imageManifest: { file: MANIFEST, version: manifest.version, sha256: sha256(read(MANIFEST)) },
    localizer: 'backend/scripts/catalogue-localize.mjs',
  },
  destinations: v1.destinations.map((d) => ({
    ...d,
    image: localize('destination', d.slug, 'image', 0, d.image),
    gallery: (d.gallery || []).map((g, i) => localize('destination', d.slug, 'gallery', i, g)),
  })),
  packages: v1.packages.map((p) => ({
    ...p,
    cover_image: localize('package', p.slug, 'cover_image', 0, p.cover_image),
    gallery: (p.gallery || []).map((g, i) => localize('package', p.slug, 'gallery', i, g)),
  })),
};

const problems = validateArtifact(v2);
if (problems.length > 0) throw new Error(`Generated artifact is invalid:\n  - ${problems.join('\n  - ')}`);

const text = `${JSON.stringify(v2, null, 2)}\n`;
const out = path.join(REPO, V2);
if (process.argv.includes('--check')) {
  if ((fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '') !== text) {
    console.error('✗ db/catalogue/catalogue.v2.json is stale — run `npm run catalogue:localize` and review the diff.');
    process.exitCode = 1;
  } else {
    console.log('✓ catalogue v2 is up to date with catalogue v1 and the image manifest');
  }
} else {
  fs.writeFileSync(out, text);
  console.log(`✓ wrote db/catalogue/catalogue.v2.json — ${stats.rewritten} image reference(s) now local, ${stats.retained} kept remote (unresolved in the manifest)`);
}

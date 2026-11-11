#!/usr/bin/env node
/**
 * Travel image pipeline:  node build.mjs [--no-baseline]
 *
 *   inventory → licence check → guarded download → renditions → manifest
 *
 * Idempotent: masters are cached, unchanged assets are not re-encoded, asset
 * ids are reused from the existing manifest. Writes only inside this
 * directory, frontend/public/assets/travel and the generated frontend module.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, LICENCES, collectReferences, groupBySource } from './lib/sources.mjs';
import { fetchMaster, masterUrl, measureReferenced, mapLimit, sha256 } from './lib/fetch.mjs';
import { PUBLIC_BASE, RECIPE, renderAsset, widthsFor, isCurrent } from './lib/render.mjs';

const HERE = import.meta.dirname;
const CACHE_DIR = path.join(HERE, '.cache');
const PUBLIC_DIR = path.join(ROOT, 'frontend/public');
const MANIFEST_FILE = path.join(HERE, 'manifest/image-manifest.v1.json');
const BASELINE_FILE = path.join(HERE, 'manifest/remote-baseline.v1.json');
const RUNTIME_FILE = path.join(ROOT, 'frontend/src/data/travelImages.generated.js');
const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const ORDER = { destination: 0, package: 1, blog: 2, 'corporate-tour': 3, testimonial: 4 };
const byPriority = (a, b) => (Number(b.hero) - Number(a.hero)) || (ORDER[a.entity] - ORDER[b.entity])
  || (a.position - b.position) || a.slug.localeCompare(b.slug) || a.field.localeCompare(b.field);
const publicRef = ({ origin, entity, slug, field, position, original }) => ({ origin, entity, slug, field, position, original });

const previous = readJson(MANIFEST_FILE, null);
const recipe = { ...RECIPE, tool: `sharp ${sharp.versions.sharp} / libvips ${sharp.versions.vips}` };
const recipeHash = sha256(JSON.stringify(recipe)).slice(0, 16);
const previousById = new Map((previous?.recipeHash === recipeHash ? previous.assets : []).map((a) => [a.id, a]));
const previousIdBySource = new Map((previous?.assets || []).map((a) => [`${a.source.identifier}|${a.source.masterSha256}`, a.id]));

const refs = await collectReferences();
const { groups, orphans } = groupBySource(refs, previous);
const permitted = groups.filter((g) => LICENCES[g.licence].permitted);
const unresolved = groups.filter((g) => !LICENCES[g.licence].permitted).map((g) => ({
  identifier: g.identifier, reason: 'licence', licence: g.licence, detail: LICENCES[g.licence].evidence,
  action: 'Replace the photo, or record written evidence of a licence that covers self-hosting.',
  fallback: 'Original remote URL retained unchanged; not downloaded.',
  references: g.references.sort(byPriority).map(publicRef),
}));
for (const ref of orphans) unresolved.push({ identifier: ref.original, reason: 'unmapped', detail: 'Local path with no manifest entry.', references: [publicRef(ref)] });

console.log(`references ${refs.length} · unique sources ${groups.length} · permitted ${permitted.length} · excluded ${groups.length - permitted.length}`);

const fetched = await mapLimit(permitted, 6, async (group) => {
  try { return { group, master: await fetchMaster(group, CACHE_DIR) }; } catch (error) { return { group, error: error.message }; }
});
for (const { group, error } of fetched.filter((f) => f.error)) {
  unresolved.push({ identifier: group.identifier, reason: 'download', licence: group.licence, detail: error,
    fallback: 'Original remote URL retained unchanged.', references: group.references.sort(byPriority).map(publicRef) });
}
const ready = fetched.filter((f) => f.master);
console.log(`downloaded ${ready.filter((f) => !f.master.cached).length} · from cache ${ready.filter((f) => f.master.cached).length} · failed ${fetched.length - ready.length}`);

let encoded = 0;
const assets = await mapLimit(ready, 3, async ({ group, master }) => {
  const references = group.references.sort(byPriority);
  const id = previousIdBySource.get(`${group.identifier}|${master.sha256}`) || `${references[0].context}-${master.sha256.slice(0, 8)}`;
  const prior = previousById.get(id);
  const widths = group.kind === 'avatar' ? [] : widthsFor(group, master);
  const rendered = isCurrent(prior, master, widths, PUBLIC_DIR)
    ? { src: prior.src, width: prior.width, height: prior.height, widths: prior.widths, files: prior.files }
    : (encoded += 1, await renderAsset({ id, group, master, publicDir: PUBLIC_DIR }));
  return {
    id, kind: group.kind, role: group.kind === 'avatar' ? 'avatar' : group.hero ? 'hero' : 'standard',
    source: { identifier: group.identifier, licence: group.licence, masterUrl: masterUrl(group), masterSha256: master.sha256,
      masterBytes: master.bytes, masterWidth: master.width, masterHeight: master.height },
    ...rendered, references: references.map(publicRef),
  };
});
assets.sort((a, b) => a.id.localeCompare(b.id));
unresolved.sort((a, b) => a.identifier.localeCompare(b.identifier));
const duplicateIds = assets.map((a) => a.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicateIds.length) throw new Error(`duplicate asset ids: ${duplicateIds.join(', ')}`);

const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
const allFiles = assets.flatMap((a) => a.files);
const byFormat = {};
for (const f of allFiles) { byFormat[f.format] ??= { files: 0, bytes: 0 }; byFormat[f.format].files += 1; byFormat[f.format].bytes += f.bytes; }
const usedLicences = Object.fromEntries([...new Set(groups.map((g) => g.licence))].sort().map((key) => [key, LICENCES[key]]));

writeJson(MANIFEST_FILE, {
  name: 'zurii-travel-images', version: 1, publicBase: PUBLIC_BASE, publicDir: 'frontend/public', recipe, recipeHash,
  licences: usedLicences,
  totals: {
    references: refs.length, uniqueSources: groups.length, migrated: assets.length,
    excludedForLicence: unresolved.filter((u) => u.reason === 'licence').length,
    failedDownloads: unresolved.filter((u) => u.reason === 'download').length,
    referencesMigrated: sum(assets, (a) => a.references.length), referencesUnresolved: sum(unresolved, (u) => u.references.length),
    files: allFiles.length, bytes: sum(allFiles, (f) => f.bytes), masterBytes: sum(assets, (a) => a.source.masterBytes), byFormat,
  },
  assets, unresolved,
});

const runtime = assets.filter((a) => a.kind === 'photo').map((a) => `  '${a.id}': [${[a.width, a.height, ...a.widths].join(', ')}],`);
fs.writeFileSync(RUNTIME_FILE, [
  '// GENERATED by tools/images/build.mjs from tools/images/manifest/image-manifest.v1.json.',
  '// Do not edit by hand — re-run the pipeline. See docs/IMAGE_ASSETS.md.',
  `export const TRAVEL_IMAGE_BASE = '${PUBLIC_BASE}';`,
  '',
  '// asset id → [intrinsic width, intrinsic height, ...rendition widths]',
  'export const TRAVEL_IMAGES = {', ...runtime, '};', '',
].join('\n'));

if (!process.argv.includes('--no-baseline')) {
  const baseline = readJson(BASELINE_FILE, { note: 'Bytes a browser was sent for each ORIGINAL remote URL (Chrome Accept header), recorded once before migration.', measured: {} });
  const originals = [...new Set(groups.flatMap((g) => g.references.map((r) => r.original)))].filter((u) => !baseline.measured[u] && /^https:\/\/(images\.unsplash|api\.dicebear)\./.test(u));
  const measured = await mapLimit(originals, 6, measureReferenced);
  originals.forEach((url, i) => { baseline.measured[url] = measured[i]; });
  baseline.measured = Object.fromEntries(Object.entries(baseline.measured).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(BASELINE_FILE, baseline);
  console.log(`baseline measured ${originals.length} new URL(s)`);
}

console.log(`assets ${assets.length} (encoded ${encoded}, reused ${assets.length - encoded}) · files ${allFiles.length} · ${(sum(allFiles, (f) => f.bytes) / 1048576).toFixed(1)} MB`);
console.log(`unresolved ${unresolved.length}: ${unresolved.map((u) => `${u.reason}:${u.identifier}`).join(', ') || 'none'}`);

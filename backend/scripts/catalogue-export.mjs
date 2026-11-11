/**
 * Produce the versioned catalogue artifact from the legacy static data.
 *
 *   node scripts/catalogue-export.mjs          # (re)write db/catalogue/catalogue.v1.json
 *   node scripts/catalogue-export.mjs --check  # exit 1 if the committed artifact is stale
 *
 * A deliberate, by-hand development step — never part of runtime, migrations
 * or seeding. It is the ONLY backend code that still reads frontend/src/data,
 * and it uses the existing, tested extractor (scripts/extractStaticData.mjs),
 * so the artifact holds exactly the records the old `migrate:data` imported:
 * same slugs, prices, itineraries, images and destination links.
 *
 * The output is deterministic (no timestamps; records in extraction order, so
 * a fresh database gets the same ids the original import produced) and the
 * source file's SHA-256 is recorded for provenance.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { extractStaticData } from './extractStaticData.mjs';
import seedModule from '../db/catalogueSeed.js';

const { validateArtifact, ARTIFACT_NAME } = seedModule;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILE = path.resolve(HERE, '../../frontend/src/data/index.js');
const OUT_FILE = path.resolve(HERE, '../db/catalogue/catalogue.v1.json');

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const orNull = (value) => (value === undefined ? null : value);

async function buildArtifact() {
  const { destinations, packages, report } = await extractStaticData();
  if (report.invalid.length > 0) {
    throw new Error(`The extractor rejected ${report.invalid.length} record(s); fix the source data first.`);
  }

  const slugByName = new Map();
  for (const d of destinations) {
    if (slugByName.has(d.name)) throw new Error(`Two destinations share the name "${d.name}"`);
    slugByName.set(d.name, d.slug);
  }

  const artifact = {
    artifact: ARTIFACT_NAME,
    version: 1,
    source: {
      file: 'frontend/src/data/index.js',
      sha256: sha256(fs.readFileSync(SOURCE_FILE)),
      extractor: 'backend/scripts/extractStaticData.mjs',
      exporter: 'backend/scripts/catalogue-export.mjs',
    },
    counts: { destinations: destinations.length, packages: packages.length },
    destinations: destinations.map((d) => ({
      slug: d.slug,
      legacy_id: orNull(d.legacyId),
      name: d.name,
      country: orNull(d.country),
      region: orNull(d.region),
      kind: d.kind,
      short_description: orNull(d.shortDescription),
      description: orNull(d.description),
      image: orNull(d.image),
      gallery: d.gallery ?? [],
      featured: d.featured,
      active: d.active,
      metadata: d.metadata ?? {},
    })),
    packages: packages.map((p) => {
      const destinationSlug = p.destinationName ? slugByName.get(p.destinationName) : null;
      if (p.destinationName && !destinationSlug) {
        throw new Error(`Package ${p.slug} names destination "${p.destinationName}", which was not extracted`);
      }
      return {
        slug: p.slug,
        legacy_id: orNull(p.legacyId),
        title: p.title,
        destination_slug: destinationSlug ?? null,
        subtitle: orNull(p.subtitle),
        short_description: orNull(p.shortDescription),
        description: orNull(p.description),
        duration_days: orNull(p.durationDays),
        duration_nights: orNull(p.durationNights),
        duration_text: orNull(p.durationText),
        price: orNull(p.price),
        original_price: orNull(p.originalPrice),
        currency: p.currency,
        cover_image: orNull(p.coverImage),
        gallery: p.gallery ?? [],
        highlights: p.highlights ?? [],
        itinerary: p.itinerary ?? [],
        inclusions: p.inclusions ?? [],
        exclusions: p.exclusions ?? [],
        batches: p.batches ?? [],
        tags: p.tags ?? [],
        trip_type: orNull(p.tripType),
        rating: orNull(p.rating),
        reviews_count: orNull(p.reviewsCount),
        group_size: orNull(p.groupSize),
        difficulty: orNull(p.difficulty),
        featured: p.featured,
        popular: p.popular,
        status: p.status,
        metadata: p.metadata ?? {},
      };
    }),
  };

  const problems = validateArtifact(artifact);
  if (problems.length > 0) throw new Error(`Generated artifact is invalid:\n  - ${problems.join('\n  - ')}`);
  return { artifact, report };
}

const { artifact, report } = await buildArtifact();
const text = `${JSON.stringify(artifact, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
  if (current !== text) {
    console.error('✗ db/catalogue/catalogue.v1.json is stale — run `npm run catalogue:export` and review the diff.');
    process.exitCode = 1;
  } else {
    console.log('✓ catalogue artifact is up to date with frontend/src/data/index.js');
  }
} else {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, text);
  console.log(`✓ wrote db/catalogue/catalogue.v1.json — ${artifact.counts.destinations} destinations, ${artifact.counts.packages} packages`);
  console.log(`  extractor: ${report.conflicts.length} field conflict(s) resolved by precedence, ` +
    `${report.unresolvedDestinations.length} package(s) without a destination, sha256 ${sha256(Buffer.from(text)).slice(0, 12)}…`);
}

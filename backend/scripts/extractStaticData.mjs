/**
 * Extract + transform the legacy static travel data into database-shaped
 * records. No database access here — this module is pure, so its output can be
 * inspected (`--json`) before anything is written.
 *
 * The frontend data modules are ES modules and contain no JSX or browser APIs,
 * so they are imported directly rather than regex-scraped. Image values are
 * plain URL strings assigned through top-level consts, so importing resolves
 * them to real URLs instead of JS identifiers.
 *
 * Live source (imported by 15 components):
 *   frontend/src/data/index.js
 *
 * Stale duplicates (imported by nothing — inventoried, not migrated):
 *   domesticData.js, tripsData.js, tripsCarouselData.js,
 *   testimonialData.js, categoryData.js
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  slugify,
  uniqueSlug,
  parsePrice,
  parseDuration,
  normalizeName,
  nameKeys,
  containsName,
  isUsableImage,
  deriveTags,
} from './normalize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, '../../frontend/src/data');
const dataModule = (file) => import(path.join(DATA_DIR, file));

const SOURCE_FILE = 'frontend/src/data/index.js';

/** Destination display names that are already country-qualified in the source. */
const DOMESTIC_COUNTRY = 'India';

/**
 * Build the destination records.
 *
 * 9 domestic states + 27 international countries = 36. `topbarCategories` is
 * deliberately excluded: it is navigation menu configuration listing ~90
 * countries and cities with no descriptions, images or packages. Migrating it
 * would manufacture dozens of empty destinations.
 */
async function buildDestinations() {
  const index = await dataModule('index.js');
  const destinations = [];
  const conflicts = [];
  const takenSlugs = new Set();

  // Region lookup for international countries, from the region → countries tree.
  const regionByCountry = new Map();
  const fallbackThumbnailByCountry = new Map();
  for (const region of index.internationalFallback) {
    for (const country of region.countries) {
      regionByCountry.set(normalizeName(country.country), region.region);
      if (country.thumbnail) fallbackThumbnailByCountry.set(normalizeName(country.country), country.thumbnail);
    }
  }

  // ── Domestic states ──
  for (const source of index.domesticDestinations) {
    const name = String(source.state).trim();
    const record = {
      legacyId: name,
      name,
      slug: uniqueSlug(slugify(name), takenSlugs),
      country: DOMESTIC_COUNTRY,
      region: null, // no region field exists for domestic states in the source
      kind: 'domestic',
      shortDescription: source.highlight ?? null,
      description: source.about ?? null,
      image: source.thumbnail ?? null,
      gallery: [],
      featured: false, // the source has no featured/popular flag for destinations
      active: true,
      metadata: {
        sourceFile: SOURCE_FILE,
        sourceExport: 'domesticDestinations',
        legacyKey: name,
        tourRefs: (source.tours || []).map((t) => t.id).filter(Boolean),
        ...(source.code ? { code: source.code } : {}),
        ...(source.weather ? { weather: source.weather } : {}),
      },
    };
    destinations.push(record);
  }

  // ── International countries ──
  for (const source of index.internationalDestinations) {
    const name = String(source.country).trim();
    const key = normalizeName(name);
    const fallbackThumbnail = fallbackThumbnailByCountry.get(key);

    if (fallbackThumbnail && source.thumbnail && fallbackThumbnail !== source.thumbnail) {
      conflicts.push({
        entity: 'destination',
        name,
        field: 'image',
        kept: source.thumbnail,
        keptFrom: 'internationalDestinations (more complete record)',
        alternative: fallbackThumbnail,
        alternativeFrom: 'internationalFallback',
      });
    }

    destinations.push({
      legacyId: name,
      name,
      slug: uniqueSlug(slugify(name), takenSlugs),
      country: name, // the source models international destinations at country level
      region: regionByCountry.get(key) ?? null,
      kind: 'international',
      shortDescription: null, // no equivalent of the domestic `highlight` field
      description: source.about ?? null,
      image: source.thumbnail ?? null,
      gallery: [],
      featured: false,
      active: true,
      metadata: {
        sourceFile: SOURCE_FILE,
        sourceExport: 'internationalDestinations',
        legacyKey: name,
        cities: source.cities || [],
        tourRefs: (source.tours || []).map((t) => t.id).filter(Boolean),
        ...(fallbackThumbnail && fallbackThumbnail !== source.thumbnail
          ? { alternateThumbnail: fallbackThumbnail }
          : {}),
      },
    });
  }

  return { destinations, conflicts };
}

/**
 * Map every package slug to its owning destination.
 *
 * Resolution is deterministic and tried in this order, so re-running the
 * migration always produces the same mapping:
 *
 *   1. an explicit `tours[].id` reference on a destination (first wins)
 *   2. the `location` label on a best-seller entry
 *   3. the destination name appearing in title / subtitle / tagline
 *   4. one of an international destination's `cities` appearing in the title
 *
 * A package that matches nothing keeps destination_id NULL and is reported.
 */
function buildDestinationResolver(destinations, bestSellers) {
  const byTourRef = new Map(); // slug → { name, extras: [] }
  for (const dest of destinations) {
    for (const ref of dest.metadata.tourRefs || []) {
      const existing = byTourRef.get(ref);
      if (existing) existing.extras.push(dest.name);
      else byTourRef.set(ref, { name: dest.name, extras: [] });
    }
  }

  const locationBySlug = new Map();
  for (const trip of bestSellers) {
    if (trip.location) locationBySlug.set(trip.id, trip.location);
  }

  // Longest names first so 'Himachal Pradesh' is preferred over a shorter hit.
  const byLength = [...destinations].sort((a, b) => b.name.length - a.name.length);

  return function resolve(slug, trip) {
    const explicit = byTourRef.get(slug);
    if (explicit) {
      return { name: explicit.name, via: 'tours[] reference', alsoListedUnder: explicit.extras };
    }

    const location = locationBySlug.get(slug);
    if (location) {
      for (const key of nameKeys(location)) {
        const hit = byLength.find((d) => normalizeName(d.name) === key);
        if (hit) return { name: hit.name, via: `bestSellerTrips.location "${location}"`, alsoListedUnder: [] };
      }
    }

    const blob = [trip.title, trip.subtitle, trip.tagline].filter(Boolean).join(' ');
    const nameHit = byLength.find((d) => containsName(blob, d.name));
    if (nameHit) return { name: nameHit.name, via: 'destination name in title/subtitle/tagline', alsoListedUnder: [] };

    const cityHit = byLength.find((d) =>
      (d.metadata.cities || []).some((city) => containsName(blob, city))
    );
    if (cityHit) return { name: cityHit.name, via: 'destination city in title/subtitle', alsoListedUnder: [] };

    return null;
  };
}

/** Record a field whose value differs between two source exports. */
function noteConflict(conflicts, slug, field, kept, alternative, alternativeFrom) {
  if (alternative === undefined || alternative === null) return;
  if (String(kept) === String(alternative)) return;
  conflicts.push({
    entity: 'package',
    slug,
    field,
    kept,
    keptFrom: 'tripDetails (most complete record)',
    alternative,
    alternativeFrom,
  });
}

async function buildPackages(destinations) {
  const index = await dataModule('index.js');
  const packages = [];
  const conflicts = [];
  const unresolved = [];
  const takenSlugs = new Set();

  const carouselBySlug = new Map(index.carouselTrips.map((t) => [t.id, t]));
  const bestSellerBySlug = new Map(index.bestSellerTrips.map((t) => [t.id, t]));
  const resolve = buildDestinationResolver(destinations, index.bestSellerTrips);
  const destinationByName = new Map(destinations.map((d) => [d.name, d]));

  for (const [legacyKey, trip] of Object.entries(index.tripDetails)) {
    const carousel = carouselBySlug.get(legacyKey);
    const bestSeller = bestSellerBySlug.get(legacyKey);

    // tripDetails is the authoritative record; the card exports are summaries.
    noteConflict(conflicts, legacyKey, 'title', trip.title, carousel?.title, 'carouselTrips');
    noteConflict(conflicts, legacyKey, 'title', trip.title, bestSeller?.title, 'bestSellerTrips');
    noteConflict(conflicts, legacyKey, 'price', trip.price, carousel?.price, 'carouselTrips');
    noteConflict(conflicts, legacyKey, 'price', trip.price, bestSeller?.price, 'bestSellerTrips');
    noteConflict(conflicts, legacyKey, 'duration', trip.duration, carousel?.duration, 'carouselTrips');
    noteConflict(conflicts, legacyKey, 'duration', trip.duration, bestSeller?.duration, 'bestSellerTrips');
    noteConflict(conflicts, legacyKey, 'cover_image', trip.heroImage, carousel?.image, 'carouselTrips');
    noteConflict(conflicts, legacyKey, 'cover_image', trip.heroImage, bestSeller?.image, 'bestSellerTrips');

    const resolution = resolve(legacyKey, trip);
    if (!resolution) unresolved.push({ slug: legacyKey, title: trip.title });

    const destination = resolution ? destinationByName.get(resolution.name) : null;
    const duration = parseDuration(trip.duration);
    const price = parsePrice(trip.price);
    const originalPrice = parsePrice(trip.originalPrice);

    // The source slug is preserved verbatim: /trip/:id links depend on it.
    const slug = uniqueSlug(legacyKey, takenSlugs);

    packages.push({
      legacyId: legacyKey,
      title: String(trip.title || '').trim(),
      slug,
      destinationName: destination ? destination.name : null,
      subtitle: trip.subtitle ?? null,
      shortDescription: trip.tagline ?? null,
      description: trip.overview ?? null,
      durationDays: duration.days,
      durationNights: duration.nights,
      durationText: trip.duration ?? null,
      price,
      originalPrice,
      currency: 'INR',
      coverImage: trip.heroImage ?? null,
      gallery: Array.isArray(trip.gallery) ? trip.gallery : [],
      highlights: [], // no highlights field exists in the source; not invented
      itinerary: Array.isArray(trip.itinerary) ? trip.itinerary : [],
      inclusions: Array.isArray(trip.inclusions) ? trip.inclusions : [],
      exclusions: Array.isArray(trip.exclusions) ? trip.exclusions : [],
      batches: Array.isArray(trip.batches) ? trip.batches : [],
      tags: deriveTags({
        slug: legacyKey,
        title: trip.title,
        subtitle: trip.subtitle,
        tagline: trip.tagline,
        overview: trip.overview,
        tripType: trip.packageType,
        kind: destination?.kind,
      }),
      tripType: trip.packageType ?? null,
      rating: trip.rating === undefined ? null : Number(trip.rating),
      reviewsCount: trip.reviews === undefined ? null : Number(trip.reviews),
      groupSize: trip.groupSize ?? null,
      difficulty: trip.difficulty ?? null,
      featured: Boolean(carousel), // homepage carousel === featured
      popular: Boolean(bestSeller), // best-seller strip === popular
      status: 'PUBLISHED',
      metadata: {
        sourceFile: SOURCE_FILE,
        sourceExport: 'tripDetails',
        legacyKey,
        priceText: trip.price ?? null,
        originalPriceText: trip.originalPrice ?? null,
        tagSource: 'derived from ExplorePage.jsx keyword rules',
        ...(resolution ? { destinationResolvedVia: resolution.via } : { destinationUnresolved: true }),
        ...(resolution?.alsoListedUnder?.length ? { alsoListedUnder: resolution.alsoListedUnder } : {}),
        ...(bestSeller?.badge ? { badge: bestSeller.badge } : {}),
        ...(bestSeller?.save ? { savings: bestSeller.save } : {}),
        ...(bestSeller?.location ? { locationLabel: bestSeller.location } : {}),
        ...(carousel?.tag ? { carouselTag: carousel.tag } : {}),
        ...(carousel?.tagColor ? { carouselTagColor: carousel.tagColor } : {}),
      },
    });
  }

  return { packages, conflicts, unresolved };
}

/** Reject only records the database would refuse or the UI could not render. */
function validate({ destinations, packages }) {
  const invalid = [];

  const validDestinations = destinations.filter((d) => {
    const problems = [];
    if (!d.name) problems.push('missing name');
    if (!d.slug) problems.push('missing slug');
    if (d.image && !isUsableImage(d.image)) problems.push(`unusable image "${d.image}"`);
    if (problems.length) invalid.push({ entity: 'destination', id: d.legacyId, problems });
    return problems.length === 0;
  });

  const validPackages = packages.filter((p) => {
    const problems = [];
    if (!p.title) problems.push('missing title');
    if (!p.slug) problems.push('missing slug');
    if (p.price !== null && !(Number.isFinite(p.price) && p.price >= 0)) problems.push(`invalid price ${p.price}`);
    if (p.coverImage && !isUsableImage(p.coverImage)) problems.push(`unusable cover image "${p.coverImage}"`);
    for (const image of p.gallery) {
      if (!isUsableImage(image)) problems.push(`unusable gallery image "${image}"`);
    }
    for (const field of ['gallery', 'itinerary', 'inclusions', 'exclusions', 'batches', 'tags', 'metadata']) {
      try {
        JSON.stringify(p[field]);
      } catch {
        problems.push(`${field} is not JSON-serializable`);
      }
    }
    if (problems.length) invalid.push({ entity: 'package', id: p.legacyId, problems });
    return problems.length === 0;
  });

  return { validDestinations, validPackages, invalid };
}

/** Inventory the stale duplicate modules so the report can account for them. */
async function inventoryStaleSources() {
  const files = ['domesticData.js', 'tripsData.js', 'tripsCarouselData.js', 'testimonialData.js', 'categoryData.js'];
  const inventory = [];

  for (const file of files) {
    const mod = await dataModule(file);
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value === 'function') continue;
      inventory.push({
        file: `frontend/src/data/${file}`,
        export: exportName,
        records: Array.isArray(value) ? value.length : Object.keys(value || {}).length,
        migrated: false,
        reason: 'imported by no component; a strictly smaller subset of index.js',
      });
    }
  }
  return inventory;
}

export async function extractStaticData() {
  const { destinations, conflicts: destConflicts } = await buildDestinations();
  const { packages, conflicts: pkgConflicts, unresolved } = await buildPackages(destinations);
  const { validDestinations, validPackages, invalid } = validate({ destinations, packages });
  const staleSources = await inventoryStaleSources();

  return {
    destinations: validDestinations,
    packages: validPackages,
    report: {
      destinationsDiscovered: destinations.length,
      packagesDiscovered: packages.length,
      conflicts: [...destConflicts, ...pkgConflicts],
      unresolvedDestinations: unresolved,
      invalid,
      staleSources,
    },
  };
}

// Inspect the transform without touching the database:
//   node scripts/extractStaticData.mjs         (summary)
//   node scripts/extractStaticData.mjs --json  (full payload)
if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await extractStaticData();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const { report } = result;
    console.log('── Extraction summary ──');
    console.log(`Destinations discovered : ${report.destinationsDiscovered}`);
    console.log(`Packages discovered     : ${report.packagesDiscovered}`);
    console.log(`Valid destinations      : ${result.destinations.length}`);
    console.log(`Valid packages          : ${result.packages.length}`);
    console.log(`Invalid records         : ${report.invalid.length}`);
    report.invalid.forEach((i) => console.log(`   ${i.entity} ${i.id}: ${i.problems.join('; ')}`));
    console.log(`Unresolved destinations : ${report.unresolvedDestinations.length}`);
    report.unresolvedDestinations.forEach((u) => console.log(`   ${u.slug} (${u.title})`));
    console.log(`Field conflicts         : ${report.conflicts.length}`);
    report.conflicts.forEach((c) =>
      console.log(`   ${c.slug || c.name}.${c.field}: kept "${c.kept}" over "${c.alternative}" (${c.alternativeFrom})`)
    );
    console.log(`Stale sources ignored   : ${report.staleSources.length} exports`);

    const withDestination = result.packages.filter((p) => p.destinationName).length;
    console.log(`\nPackages with destination: ${withDestination}/${result.packages.length}`);
    console.log(`Featured (carousel)      : ${result.packages.filter((p) => p.featured).length}`);
    console.log(`Popular (best sellers)   : ${result.packages.filter((p) => p.popular).length}`);
  }
}

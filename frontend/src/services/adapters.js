import { formatCurrency, formatDuration } from '../utils/format';

/**
 * Adapters between the API shape and the shape the UI renders.
 *
 * There is exactly one of these per entity — components never map database
 * fields themselves. Legacy field names (`heroImage`, `reviews`, `overview`,
 * `location`, `save`) are preserved deliberately: the card and detail
 * components were written against the old static objects, and keeping the
 * names means switching to the API did not require touching their markup.
 *
 * `id` intentionally carries the slug, because routes are `/trip/:id` and
 * existing links and bookmarks resolve by slug. The numeric primary key is
 * exposed separately as `dbId`.
 */

export function adaptPackage(pkg) {
  if (!pkg) return null;

  const duration = formatDuration(pkg.durationDays, pkg.durationNights, pkg.durationText);

  return {
    // Identity
    id: pkg.slug,
    slug: pkg.slug,
    dbId: pkg.id,

    // Headline content
    title: pkg.title,
    subtitle: pkg.subtitle,
    tagline: pkg.shortDescription,
    overview: pkg.description,

    // Imagery
    heroImage: pkg.coverImage,
    image: pkg.coverImage,
    gallery: pkg.gallery ?? [],

    // Facts
    duration,
    durationDays: pkg.durationDays,
    durationNights: pkg.durationNights,
    rating: pkg.rating === null ? null : String(pkg.rating),
    reviews: pkg.reviewsCount,
    groupSize: pkg.groupSize,
    difficulty: pkg.difficulty,

    // Money — formatted for display, numeric kept for sorting/filtering
    price: formatCurrency(pkg.price, pkg.currency),
    priceValue: pkg.price,
    originalPrice: formatCurrency(pkg.originalPrice, pkg.currency),
    originalPriceValue: pkg.originalPrice,
    currency: pkg.currency,
    save: pkg.savings,

    // Structured content
    highlights: pkg.highlights ?? [],
    itinerary: pkg.itinerary ?? [],
    inclusions: pkg.inclusions ?? [],
    exclusions: pkg.exclusions ?? [],
    batches: pkg.batches ?? [],
    tags: pkg.tags ?? [],
    packageType: pkg.tripType,

    // Placement
    badge: pkg.badge,
    featured: pkg.featured,
    popular: pkg.popular,

    // Destination
    destination: pkg.destination ?? null,
    location: pkg.destination?.name ?? pkg.locationLabel ?? null,
  };
}

export function adaptDestination(destination) {
  if (!destination) return null;

  return {
    id: destination.slug,
    slug: destination.slug,
    dbId: destination.id,

    name: destination.name,
    // The legacy components read `state` for domestic and `country` for
    // international destinations; both are provided so either works.
    state: destination.name,
    country: destination.country,
    region: destination.region,
    kind: destination.kind,

    highlight: destination.shortDescription,
    about: destination.description,
    thumbnail: destination.image,
    image: destination.image,
    gallery: destination.gallery ?? [],
    cities: destination.cities ?? [],

    featured: destination.featured,
    packageCount: destination.packageCount ?? null,

    // Present only on the detail endpoint.
    packages: Array.isArray(destination.packages) ? destination.packages.map(adaptPackage) : undefined,
  };
}

export const adaptPackages = (list) => (Array.isArray(list) ? list.map(adaptPackage) : []);
export const adaptDestinations = (list) => (Array.isArray(list) ? list.map(adaptDestination) : []);

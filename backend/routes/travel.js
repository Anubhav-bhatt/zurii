/**
 * Public read APIs for travel content.
 *
 *   GET /api/destinations         list active destinations (+ package counts)
 *   GET /api/destinations/:slug   one destination with its published packages
 *   GET /api/packages             list published packages, filterable
 *   GET /api/packages/:slug       one package with its destination
 *
 * Conventions follow the existing routes in server.js: `{ success, data }` on
 * success, `{ success: false, error }` on failure, and never a raw database
 * error to the client.
 *
 * Only PUBLISHED packages and active destinations are ever exposed here.
 * Every value reaching SQL is a bound parameter.
 */
const express = require('express');

const PUBLIC_PACKAGE_STATUS = 'PUBLISHED';
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;

/** NUMERIC arrives from pg as a string; the UI needs real numbers. */
const num = (value) => (value === null || value === undefined ? null : Number(value));

function serializeDestination(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country,
    region: row.region,
    kind: row.kind,
    shortDescription: row.short_description,
    description: row.description,
    image: row.image,
    gallery: row.gallery ?? [],
    featured: row.featured,
    cities: row.metadata?.cities ?? [],
    ...(row.package_count !== undefined ? { packageCount: Number(row.package_count) } : {}),
  };
}

function serializePackage(row) {
  if (!row) return null;
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    shortDescription: row.short_description,
    description: row.description,

    durationDays: row.duration_days,
    durationNights: row.duration_nights,
    durationText: row.duration_text,

    price: num(row.price),
    originalPrice: num(row.original_price),
    currency: row.currency,

    coverImage: row.cover_image,
    gallery: row.gallery ?? [],
    highlights: row.highlights ?? [],
    itinerary: row.itinerary ?? [],
    inclusions: row.inclusions ?? [],
    exclusions: row.exclusions ?? [],
    batches: row.batches ?? [],
    tags: row.tags ?? [],

    tripType: row.trip_type,
    rating: num(row.rating),
    reviewsCount: row.reviews_count,
    groupSize: row.group_size,
    difficulty: row.difficulty,

    featured: row.featured,
    popular: row.popular,
    status: row.status,

    // Presentation details carried over from the legacy card data. Best-seller
    // entries stored a `badge`; carousel entries stored a `carouselTag`.
    badge: metadata.badge ?? metadata.carouselTag ?? null,
    savings: metadata.savings ?? null,
    locationLabel: metadata.locationLabel ?? null,

    destination: row.destination_slug
      ? {
          id: row.destination_id,
          slug: row.destination_slug,
          name: row.destination_name,
          country: row.destination_country,
          region: row.destination_region,
          kind: row.destination_kind,
        }
      : null,
  };
}

/** Columns needed to serialize a package plus its destination, in one query. */
/**
 * TWO PROJECTIONS, NOT ONE `p.*`.
 *
 * `packages` has seven wide JSONB/text columns — description, gallery,
 * highlights, itinerary, inclusions, exclusions, batches — and exactly one
 * screen renders any of them: TripDetailPage, which loads a single package from
 * GET /packages/:slug. Every other caller draws cards.
 *
 * Selecting them everywhere made the list endpoint ship the entire itinerary and
 * day-by-day inclusions of every result to build a grid of titles and prices.
 * Measured on the live catalogue, GET /api/packages was 185,974 bytes; the card
 * columns alone carry the same screen.
 *
 * `metadata` stays in the card projection despite being the widest column
 * (285 B average): serializePackage reads `badge`, `savings` and `locationLabel`
 * out of it, and those are on the card. `short_description` stays too — it is the
 * card tagline, read by TrendingTrips on the homepage. Dropping either would be
 * a visible regression rather than a saving.
 *
 * The two share serializePackage. A column that was not selected arrives as
 * `undefined`, which the serializer turns into `[]` for the array fields and
 * omits for `description`; frontend services/adapters.js already defaults every
 * one of them (`pkg.itinerary ?? []`). So a card built from the narrow row is
 * byte-identical in the properties it actually uses.
 */
const PACKAGE_CARD_COLUMNS = `
         p.id, p.slug, p.title, p.subtitle, p.short_description,
         p.duration_days, p.duration_nights, p.duration_text,
         p.price, p.original_price, p.currency,
         p.cover_image, p.tags, p.trip_type,
         p.rating, p.reviews_count, p.group_size, p.difficulty,
         p.featured, p.popular, p.status, p.metadata, p.destination_id
`;

const DESTINATION_JOIN_COLUMNS = `
         d.slug    AS destination_slug,
         d.name    AS destination_name,
         d.country AS destination_country,
         d.region  AS destination_region,
         d.kind    AS destination_kind
`;

const PACKAGE_FROM = `
    FROM packages p
    LEFT JOIN destinations d ON d.id = p.destination_id
`;

/** Card fields only — every list and grid. */
const PACKAGE_LIST_SELECT = `
  SELECT ${PACKAGE_CARD_COLUMNS}, ${DESTINATION_JOIN_COLUMNS} ${PACKAGE_FROM}
`;

/** Everything, for the one screen that renders it. */
const PACKAGE_DETAIL_SELECT = `
  SELECT p.*, ${DESTINATION_JOIN_COLUMNS} ${PACKAGE_FROM}
`;

const SORTS = {
  recommended: 'p.featured DESC, p.popular DESC, p.rating DESC NULLS LAST, p.id ASC',
  price_asc: 'p.price ASC NULLS LAST, p.id ASC',
  price_desc: 'p.price DESC NULLS LAST, p.id ASC',
  duration_asc: 'p.duration_days ASC NULLS LAST, p.id ASC',
  duration_desc: 'p.duration_days DESC NULLS LAST, p.id ASC',
  rating: 'p.rating DESC NULLS LAST, p.id ASC',
};

/** Named duration buckets, kept in one place so the UI and API agree. */
const DURATION_BUCKETS = {
  '1-3': [1, 3],
  '4-6': [4, 6],
  '7+': [7, null],
};

const isTrue = (value) => value === 'true' || value === '1';

function clampLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

module.exports = function createTravelRouter(pool) {
  const router = express.Router();

  // ── GET /api/destinations ──────────────────────────────────────────
  router.get('/destinations', async (req, res) => {
    try {
      const { kind, country, region, featured } = req.query;
      const values = [PUBLIC_PACKAGE_STATUS];
      const where = ['d.active = true'];

      if (kind === 'domestic' || kind === 'international') {
        values.push(kind);
        where.push(`d.kind = $${values.length}`);
      }
      if (country) {
        values.push(country);
        where.push(`lower(d.country) = lower($${values.length})`);
      }
      if (region) {
        values.push(region);
        where.push(`lower(d.region) = lower($${values.length})`);
      }
      if (isTrue(featured)) where.push('d.featured = true');

      const { rows } = await pool.query(
        `SELECT d.*, COUNT(p.id) AS package_count
           FROM destinations d
           LEFT JOIN packages p ON p.destination_id = d.id AND p.status = $1
          WHERE ${where.join(' AND ')}
          GROUP BY d.id
          ORDER BY COUNT(p.id) DESC, d.name ASC`,
        values
      );

      res.status(200).json({ success: true, data: rows.map(serializeDestination) });
    } catch (err) {
      console.error('Destinations Fetch Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch destinations' });
    }
  });

  // ── GET /api/destinations/:slug ────────────────────────────────────
  router.get('/destinations/:slug', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT d.*, COUNT(p.id) AS package_count
           FROM destinations d
           LEFT JOIN packages p ON p.destination_id = d.id AND p.status = $2
          WHERE d.slug = $1 AND d.active = true
          GROUP BY d.id`,
        [req.params.slug, PUBLIC_PACKAGE_STATUS]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Destination not found' });
      }

      // The destination page always renders its trips, so they come along in
      // the same response rather than forcing a second round trip.
      const packages = await pool.query(
        `${PACKAGE_LIST_SELECT} WHERE p.status = $1 AND d.slug = $2 ORDER BY ${SORTS.recommended}`,
        [PUBLIC_PACKAGE_STATUS, req.params.slug]
      );

      res.status(200).json({
        success: true,
        data: {
          ...serializeDestination(rows[0]),
          packages: packages.rows.map(serializePackage),
        },
      });
    } catch (err) {
      console.error('Destination Fetch Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch destination' });
    }
  });

  // ── GET /api/packages ─────────────────────────────────────────────
  router.get('/packages', async (req, res) => {
    try {
      const {
        destination, featured, popular, tripType, tag,
        minPrice, maxPrice, duration, q, sort, limit, offset,
      } = req.query;

      const values = [PUBLIC_PACKAGE_STATUS];
      const where = ['p.status = $1'];

      if (destination) {
        values.push(destination);
        where.push(`d.slug = $${values.length}`);
      }
      if (isTrue(featured)) where.push('p.featured = true');
      if (isTrue(popular)) where.push('p.popular = true');
      if (tripType) {
        values.push(tripType);
        where.push(`lower(p.trip_type) = lower($${values.length})`);
      }
      if (tag) {
        values.push(JSON.stringify([String(tag).toLowerCase()]));
        where.push(`p.tags @> $${values.length}::jsonb`);
      }

      const min = Number.parseFloat(minPrice);
      if (Number.isFinite(min)) {
        values.push(min);
        where.push(`p.price >= $${values.length}`);
      }
      const max = Number.parseFloat(maxPrice);
      if (Number.isFinite(max)) {
        values.push(max);
        where.push(`p.price <= $${values.length}`);
      }

      const bucket = DURATION_BUCKETS[duration];
      if (bucket) {
        const [low, high] = bucket;
        values.push(low);
        where.push(`p.duration_days >= $${values.length}`);
        if (high !== null) {
          values.push(high);
          where.push(`p.duration_days <= $${values.length}`);
        }
      }

      if (q && String(q).trim().length > 0) {
        values.push(`%${String(q).trim()}%`);
        const i = values.length;
        where.push(
          `(p.title ILIKE $${i} OR p.subtitle ILIKE $${i} OR p.short_description ILIKE $${i}
            OR p.description ILIKE $${i} OR d.name ILIKE $${i})`
        );
      }

      const orderBy = SORTS[sort] || SORTS.recommended;

      values.push(clampLimit(limit));
      const limitPlaceholder = `$${values.length}`;
      values.push(Math.max(0, Number.parseInt(offset, 10) || 0));
      const offsetPlaceholder = `$${values.length}`;

      const { rows } = await pool.query(
        `${PACKAGE_LIST_SELECT}
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderBy}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      );

      // Total ignores limit/offset so the UI can show a result count.
      const countValues = values.slice(0, values.length - 2);
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS total
           FROM packages p
           LEFT JOIN destinations d ON d.id = p.destination_id
          WHERE ${where.join(' AND ')}`,
        countValues
      );

      res.status(200).json({
        success: true,
        data: rows.map(serializePackage),
        meta: { total: countRows[0].total, count: rows.length },
      });
    } catch (err) {
      console.error('Packages Fetch Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch packages' });
    }
  });

  // ── GET /api/packages/:slug ───────────────────────────────────────
  router.get('/packages/:slug', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `${PACKAGE_DETAIL_SELECT} WHERE p.slug = $1 AND p.status = $2`,
        [req.params.slug, PUBLIC_PACKAGE_STATUS]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }

      res.status(200).json({ success: true, data: serializePackage(rows[0]) });
    } catch (err) {
      console.error('Package Fetch Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch package' });
    }
  });

  return router;
};

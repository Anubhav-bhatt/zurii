/**
 * Public read APIs for travel content.
 *
 *   GET /api/destinations         list active destinations (+ package counts)
 *   GET /api/destinations/:slug   one destination with its published packages
 *   GET /api/packages             list published packages, filterable
 *                                 (?slugs=a,b,c returns exactly those cards)
 *   GET /api/packages/:slug       one package with its destination
 *
 * Successful responses are cacheable for a minute (see PUBLIC_CACHE); errors
 * and everything else under /api are `no-store` (server.js). A database
 * outage is a 503 with Retry-After, any other failure a 500 — both with a
 * plain sentence, never the database's message (lib/httpErrors.js).
 *
 * Conventions follow the existing routes in server.js: `{ success, data }` on
 * success, `{ success: false, error }` on failure, and never a raw database
 * error to the client.
 *
 * Only PUBLISHED packages and active destinations are ever exposed here.
 * Every value reaching SQL is a bound parameter.
 */
const express = require('express');
const { sendServerError } = require('../lib/httpErrors');

// What a visitor reads when the catalogue cannot be loaded. Never the
// database's own wording, and never "0 trips" — the frontend shows a retry.
const CATALOGUE_UNAVAILABLE = 'Trips are temporarily unavailable. Please try again in a moment.';
const CATALOGUE_FAILED = 'We could not load trips just now. Please try again.';
const catalogueError = (req, res, err, context) =>
  sendServerError(req, res, err, { context, message: CATALOGUE_FAILED, unavailableMessage: CATALOGUE_UNAVAILABLE });

const PUBLIC_PACKAGE_STATUS = 'PUBLISHED';
const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10000;

/**
 * Public catalogue data is the same for every visitor and changes rarely, so
 * browsers may reuse it for 60 s and show a stale copy for up to 5 more
 * minutes while they revalidate in the background (ETags make that a 304).
 * Invalidation is time-based: a catalogue edit is visible to a fresh page
 * load within 60 s, and to a page that was already open within ~6 minutes.
 * `public` is safe because nothing here depends on who is asking — admin and
 * lead routes are `no-store` (server.js).
 */
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';

/** Search: words of 2+ letters or digits, up to 6, from at most 100 characters. */
const SEARCH_MAX = 100;
const SEARCH_MAX_TERMS = 6;
const SLUGS_MAX = 50;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/i;

/**
 * Split a search into words. Case, spacing and punctuation do not matter
 * ("Kashmir's", "  KERALA ", "new-york"), and since a word is letters and
 * digits only it can never carry a LIKE wildcard. Single letters are dropped:
 * they match nearly everything.
 */
function searchTerms(q) {
  const text = String(q ?? '').normalize('NFKC').slice(0, SEARCH_MAX).toLowerCase();
  const terms = text.split(/[^\p{L}\p{N}]+/u).filter((term) => term.length >= 2);
  return [...new Set(terms)].slice(0, SEARCH_MAX_TERMS);
}

/** Belt and braces: a term is alphanumeric already, but escape LIKE syntax anyway. */
const likeContains = (term) => `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;

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

      res.set('Cache-Control', PUBLIC_CACHE);
      res.status(200).json({ success: true, data: rows.map(serializeDestination) });
    } catch (err) {
      catalogueError(req, res, err, 'destinations_list');
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

      res.set('Cache-Control', PUBLIC_CACHE);
      res.status(200).json({
        success: true,
        data: {
          ...serializeDestination(rows[0]),
          packages: packages.rows.map(serializePackage),
        },
      });
    } catch (err) {
      catalogueError(req, res, err, 'destination_detail');
    }
  });

  // ── GET /api/packages ─────────────────────────────────────────────
  router.get('/packages', async (req, res) => {
    try {
      const {
        destination, featured, popular, tripType, tag,
        minPrice, maxPrice, duration, q, sort, limit, offset, slugs,
      } = req.query;

      const values = [PUBLIC_PACKAGE_STATUS];
      const where = ['p.status = $1'];
      const add = (value) => {
        values.push(value);
        return `$${values.length}`;
      };

      // ?slugs=a,b,c — exactly these cards, in this order (wishlist, recently
      // viewed). One request instead of one full-detail request per slug.
      if (typeof slugs === 'string') {
        const wanted = [...new Set(slugs.split(',').map((x) => x.trim()).filter((x) => SLUG_PATTERN.test(x)))].slice(0, SLUGS_MAX);
        const list = add(wanted);
        const { rows } = await pool.query(
          `${PACKAGE_LIST_SELECT} WHERE p.status = $1 AND p.slug = ANY(${list}::text[])
            ORDER BY array_position(${list}::text[], p.slug::text)`,
          values
        );
        res.set('Cache-Control', PUBLIC_CACHE);
        return res.status(200).json({
          success: true,
          data: rows.map(serializePackage),
          meta: { total: rows.length, count: rows.length, requested: wanted.length },
        });
      }

      if (typeof destination === 'string' && destination) where.push(`d.slug = ${add(destination)}`);
      if (isTrue(featured)) where.push('p.featured = true');
      if (isTrue(popular)) where.push('p.popular = true');
      if (typeof tripType === 'string' && tripType) where.push(`lower(p.trip_type) = lower(${add(tripType)})`);
      if (typeof tag === 'string' && tag) where.push(`p.tags @> ${add(JSON.stringify([tag.toLowerCase()]))}::jsonb`);

      const min = Number.parseFloat(minPrice);
      if (Number.isFinite(min)) where.push(`p.price >= ${add(min)}`);
      const max = Number.parseFloat(maxPrice);
      if (Number.isFinite(max)) where.push(`p.price <= ${add(max)}`);

      const bucket = DURATION_BUCKETS[duration];
      if (bucket) {
        const [low, high] = bucket;
        where.push(`p.duration_days >= ${add(low)}`);
        if (high !== null) where.push(`p.duration_days <= ${add(high)}`);
      }

      // Every word must match somewhere (title, subtitle, descriptions, or the
      // destination's name, country or region). Matches in the title or the
      // destination name rank first unless the visitor chose another sort.
      let relevance = null;
      if (typeof q === 'string' && q.trim()) {
        const terms = searchTerms(q);
        if (terms.length === 0) {
          where.push('FALSE'); // punctuation or single letters: nothing to match, nothing returned
        } else {
          const strong = [];
          for (const term of terms) {
            const like = add(likeContains(term));
            where.push(
              `(p.title ILIKE ${like} OR p.subtitle ILIKE ${like} OR p.short_description ILIKE ${like}
                OR p.description ILIKE ${like} OR d.name ILIKE ${like} OR d.country ILIKE ${like} OR d.region ILIKE ${like})`
            );
            strong.push(`(CASE WHEN p.title ILIKE ${like} OR d.name ILIKE ${like} THEN 1 ELSE 0 END)`);
          }
          relevance = strong.join(' + ');
        }
      }

      const chosen = SORTS[sort] && sort !== 'recommended' ? SORTS[sort] : null;
      const orderBy = chosen ?? (relevance ? `${relevance} DESC, ${SORTS.recommended}` : SORTS.recommended);

      const take = clampLimit(limit);
      const skip = Math.min(Math.max(0, Number.parseInt(offset, 10) || 0), MAX_OFFSET);
      const limitPlaceholder = add(take);
      const offsetPlaceholder = add(skip);

      // The total rides on every row (one round trip instead of two).
      const { rows } = await pool.query(
        `SELECT ${PACKAGE_CARD_COLUMNS}, ${DESTINATION_JOIN_COLUMNS}, COUNT(*) OVER () AS total_count
           ${PACKAGE_FROM}
          WHERE ${where.join(' AND ')}
          ORDER BY ${orderBy}
          LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
        values
      );

      let total = rows.length ? Number(rows[0].total_count) : 0;
      if (!rows.length && skip > 0) {
        // A page past the end still reports the true total for "Showing …".
        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int AS total ${PACKAGE_FROM} WHERE ${where.join(' AND ')}`,
          values.slice(0, values.length - 2)
        );
        total = countRows[0].total;
      }

      res.set('Cache-Control', PUBLIC_CACHE);
      res.status(200).json({
        success: true,
        data: rows.map(serializePackage),
        meta: { total, count: rows.length, offset: skip, limit: take },
      });
    } catch (err) {
      catalogueError(req, res, err, 'packages_list');
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

      res.set('Cache-Control', PUBLIC_CACHE);
      res.status(200).json({ success: true, data: serializePackage(rows[0]) });
    } catch (err) {
      catalogueError(req, res, err, 'package_detail');
    }
  });

  return router;
};

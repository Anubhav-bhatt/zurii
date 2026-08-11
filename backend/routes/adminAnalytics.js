/**
 * Admin read APIs for analytics and lead journeys. ALL routes here require an
 * authenticated admin — requireAuth is applied to the whole router, so a new
 * endpoint added later cannot accidentally ship public.
 *
 *   GET /api/admin/analytics/overview       headline counts + conversion rate
 *   GET /api/admin/analytics/searches       top and zero-result search queries
 *   GET /api/admin/analytics/destinations   per-destination engagement
 *   GET /api/admin/analytics/packages       most viewed/wishlisted/enquired
 *   GET /api/admin/analytics/funnel         package_view → … → enquiry counts
 *   GET /api/admin/bookings                 enquiry list (newest first)
 *   GET /api/admin/bookings/:id             one enquiry, full detail
 *   GET /api/admin/bookings/:id/journey     the anonymous journey behind a lead
 *
 * Conventions follow routes/travel.js: `{ success, data }` on success,
 * `{ success: false, error }` on failure, never a raw database error to the
 * client, and every value reaching SQL is a bound parameter.
 *
 * Every analytics list is windowed by ?days=1|7|30 (default 7, clamped to
 * 1..90) and capped at 20 rows. Enquiry and contact COUNTS come from their own
 * tables by created_at — the lead tables are the truth for leads; events are
 * only the trail that led there.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');

const DEFAULT_DAYS = 7;
const MIN_DAYS = 1;
const MAX_DAYS = 90;
const LIST_LIMIT = 20;
const BOOKINGS_LIMIT = 50;
/** Most journey events ever returned for one lead; see the journey endpoint. */
const JOURNEY_EVENT_LIMIT = 1000;
/** Hard ceiling for the security audit feed. */
const AUDIT_LIMIT = 100;

/**
 * Collapse a user-agent string to a short, readable label.
 *
 * The raw header is stored (bounded to 512 chars) but is noise in a table and
 * is the kind of field that invites accidental over-display, so the API returns
 * a summary rather than the whole string.
 */
function summarizeUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return null;
  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /curl\//i.test(userAgent) ? 'curl'
    : /node|axios|python|go-http/i.test(userAgent) ? 'script'
    : 'Other';
  const os =
    /iPhone|iPad/.test(userAgent) ? 'iOS'
    : /Android/.test(userAgent) ? 'Android'
    : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;
  return os ? `${browser} · ${os}` : browser;
}

/** ?days=1|7|30 — default 7, clamped to 1..90; garbage falls back to the default. */
function clampDays(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  return Math.min(Math.max(parsed, MIN_DAYS), MAX_DAYS);
}

/** pg returns COUNT/AVG as strings; the dashboard needs real numbers. */
const num = (value) => (value === null || value === undefined ? null : Number(value));

/** The list row for GET /bookings — no email/phone/message at list level. */
function serializeBookingListRow(row) {
  return {
    id: row.id,
    name: row.name,
    packageTitle: row.package_title,
    packageSlug: row.package_slug,
    travelDate: row.travel_date,
    travellers: row.travellers,
    status: row.status,
    createdAt: row.created_at,
    hasJourney: row.visitor_id !== null,
  };
}

function serializeEvent(row) {
  return {
    type: row.event_type,
    entityType: row.entity_type,
    entitySlug: row.entity_slug,
    path: row.page_path,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

/**
 * Deterministic journey summary, computed in plain JS from the ordered event
 * rows. Ties break alphabetically so the same events always tell the same
 * story.
 */
function summarizeJourney(events) {
  const destinationViews = new Map(); // slug -> count
  const packageViews = new Map(); // slug -> count
  const wishlisted = new Set();
  const searches = []; // first-seen order, deduplicated
  const seenQueries = new Set();
  let whatsappClicked = false;

  for (const event of events) {
    const slug = event.entity_slug;
    switch (event.event_type) {
      case 'destination_view':
        if (slug) destinationViews.set(slug, (destinationViews.get(slug) || 0) + 1);
        break;
      case 'package_view':
        if (slug) packageViews.set(slug, (packageViews.get(slug) || 0) + 1);
        break;
      case 'wishlist_add':
        if (slug) wishlisted.add(slug);
        break;
      case 'wishlist_remove':
        if (slug) wishlisted.delete(slug);
        break;
      case 'search_performed': {
        const raw = event.metadata?.query;
        const query = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
        if (query && !seenQueries.has(query)) {
          seenQueries.add(query);
          searches.push(query);
        }
        break;
      }
      case 'whatsapp_click':
        whatsappClicked = true;
        break;
      default:
        break;
    }
  }

  const topOf = (counts) => {
    let best = null;
    let bestCount = 0;
    for (const [slug, count] of counts) {
      if (count > bestCount || (count === bestCount && best !== null && slug < best)) {
        best = slug;
        bestCount = count;
      }
    }
    return best;
  };

  return {
    primaryDestination: topOf(destinationViews),
    packagesViewed: packageViews.size,
    mostViewedPackage: topOf(packageViews),
    wishlisted: [...wishlisted].sort(),
    searches,
    whatsappClicked,
  };
}

module.exports = function createAdminAnalyticsRouter(pool) {
  const router = express.Router();

  // Every route in this file is admin-only. Mounted once, up front.
  router.use(requireAuth);

  // ── GET /analytics/overview ───────────────────────────────────────
  router.get('/analytics/overview', async (req, res) => {
    try {
      const days = clampDays(req.query.days);

      const [events, bookings, contacts] = await Promise.all([
        pool.query(
          `SELECT COUNT(DISTINCT visitor_id)::int AS visitors,
                  COUNT(DISTINCT session_id)::int AS sessions,
                  COUNT(*) FILTER (WHERE event_type = 'package_view')::int     AS package_views,
                  COUNT(*) FILTER (WHERE event_type = 'destination_view')::int AS destination_views,
                  COUNT(*) FILTER (WHERE event_type = 'wishlist_add')::int     AS wishlist_adds,
                  COUNT(*) FILTER (WHERE event_type = 'whatsapp_click')::int   AS whatsapp_clicks
             FROM analytics_events
            WHERE created_at >= NOW() - make_interval(days => $1)`,
          [days]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM bookings
            WHERE created_at >= NOW() - make_interval(days => $1)`,
          [days]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM contacts
            WHERE created_at >= NOW() - make_interval(days => $1)`,
          [days]
        ),
      ]);

      const row = events.rows[0];
      const enquiries = bookings.rows[0].n;
      const packageViews = row.package_views;

      res.status(200).json({
        success: true,
        data: {
          visitors: row.visitors,
          sessions: row.sessions,
          packageViews,
          destinationViews: row.destination_views,
          wishlistAdds: row.wishlist_adds,
          whatsappClicks: row.whatsapp_clicks,
          enquiries,
          contacts: contacts.rows[0].n,
          viewToEnquiryRate: packageViews > 0 ? Number((enquiries / packageViews).toFixed(4)) : 0,
        },
      });
    } catch (err) {
      console.error('Analytics Overview Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch the analytics overview' });
    }
  });

  // ── GET /analytics/searches ───────────────────────────────────────
  // The query is grouped lowercased+trimmed so "Bali " and "bali" are one
  // line. The result count is read from metadata (the client sends `results`;
  // `resultCount` is accepted as a fallback) and only digit strings count —
  // a hostile value simply falls out of the average.
  router.get('/analytics/searches', async (req, res) => {
    try {
      const days = clampDays(req.query.days);

      // Digit-string guard on the result count: metadata is client-supplied,
      // so a non-numeric value must fall out of the maths, not crash a cast.
      const resultsText = `COALESCE(metadata->>'results', metadata->>'resultCount')`;

      const [top, zero] = await Promise.all([
        pool.query(
          `SELECT lower(trim(metadata->>'query')) AS query,
                  COUNT(*)::int AS count,
                  AVG(CASE WHEN ${resultsText} ~ '^[0-9]+$'
                           THEN ${resultsText}::numeric END) AS avg_results
             FROM analytics_events
            WHERE event_type = 'search_performed'
              AND created_at >= NOW() - make_interval(days => $1)
              AND COALESCE(trim(metadata->>'query'), '') <> ''
            GROUP BY lower(trim(metadata->>'query'))
            ORDER BY count DESC, query ASC
            LIMIT ${LIST_LIMIT}`,
          [days]
        ),
        pool.query(
          `SELECT lower(trim(metadata->>'query')) AS query, COUNT(*)::int AS count
             FROM analytics_events
            WHERE event_type = 'search_performed'
              AND created_at >= NOW() - make_interval(days => $1)
              AND COALESCE(trim(metadata->>'query'), '') <> ''
              AND ${resultsText} ~ '^[0-9]+$'
              AND ${resultsText}::int = 0
            GROUP BY lower(trim(metadata->>'query'))
            ORDER BY count DESC, query ASC
            LIMIT ${LIST_LIMIT}`,
          [days]
        ),
      ]);

      res.status(200).json({
        success: true,
        data: {
          top: top.rows.map((row) => ({
            query: row.query,
            count: row.count,
            avgResults: row.avg_results === null ? null : Number(Number(row.avg_results).toFixed(1)),
          })),
          zeroResults: zero.rows.map((row) => ({ query: row.query, count: row.count })),
        },
      });
    } catch (err) {
      console.error('Analytics Searches Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch search analytics' });
    }
  });

  // ── GET /analytics/destinations ───────────────────────────────────
  // Package-level engagement rolls up to the package's destination, so a
  // wishlist on "Bali Honeymoon" counts toward Bali.
  router.get('/analytics/destinations', async (req, res) => {
    try {
      const days = clampDays(req.query.days);

      const { rows } = await pool.query(
        `SELECT d.slug, d.name,
                (SELECT COUNT(*)::int FROM analytics_events e
                  WHERE e.event_type = 'destination_view' AND e.entity_slug = d.slug
                    AND e.created_at >= NOW() - make_interval(days => $1)) AS views,
                (SELECT COUNT(*)::int FROM analytics_events e
                   LEFT JOIN packages p ON p.slug = e.entity_slug
                  WHERE e.event_type = 'wishlist_add'
                    AND e.created_at >= NOW() - make_interval(days => $1)
                    AND (p.destination_id = d.id OR e.entity_slug = d.slug)) AS wishlist_adds,
                (SELECT COUNT(*)::int FROM analytics_events e
                   LEFT JOIN packages p ON p.slug = e.entity_slug
                  WHERE e.event_type = 'whatsapp_click'
                    AND e.created_at >= NOW() - make_interval(days => $1)
                    AND (p.destination_id = d.id OR e.entity_slug = d.slug)) AS whatsapp_clicks,
                (SELECT COUNT(*)::int FROM bookings b
                   JOIN packages p ON p.id = b.package_id
                  WHERE p.destination_id = d.id
                    AND b.created_at >= NOW() - make_interval(days => $1)) AS enquiries
           FROM destinations d
          WHERE d.active = true
          ORDER BY views DESC, d.name ASC
          LIMIT ${LIST_LIMIT}`,
        [days]
      );

      res.status(200).json({
        success: true,
        data: rows.map((row) => ({
          slug: row.slug,
          name: row.name,
          views: row.views,
          wishlistAdds: row.wishlist_adds,
          whatsappClicks: row.whatsapp_clicks,
          enquiries: row.enquiries,
        })),
      });
    } catch (err) {
      console.error('Analytics Destinations Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch destination analytics' });
    }
  });

  // ── GET /analytics/packages ───────────────────────────────────────
  router.get('/analytics/packages', async (req, res) => {
    try {
      const days = clampDays(req.query.days);

      // Ranked packages for one event type. Joining on slug keeps only events
      // that point at a real package — stale slugs simply do not rank.
      const rankedByEvent = (eventType) =>
        pool.query(
          `SELECT p.slug, p.title, COUNT(*)::int AS count
             FROM analytics_events e
             JOIN packages p ON p.slug = e.entity_slug
            WHERE e.event_type = $1
              AND e.created_at >= NOW() - make_interval(days => $2)
            GROUP BY p.slug, p.title
            ORDER BY count DESC, p.slug ASC
            LIMIT ${LIST_LIMIT}`,
          [eventType, days]
        );

      const [viewed, wishlistedRows, enquired, whatsapp] = await Promise.all([
        rankedByEvent('package_view'),
        rankedByEvent('wishlist_add'),
        // Enquiries come from the bookings table, not events — the lead table
        // is the truth for leads.
        pool.query(
          `SELECT p.slug, p.title, COUNT(*)::int AS count
             FROM bookings b
             JOIN packages p ON p.id = b.package_id
            WHERE b.created_at >= NOW() - make_interval(days => $1)
            GROUP BY p.slug, p.title
            ORDER BY count DESC, p.slug ASC
            LIMIT ${LIST_LIMIT}`,
          [days]
        ),
        rankedByEvent('whatsapp_click'),
      ]);

      const shape = (rows) => rows.map((r) => ({ slug: r.slug, title: r.title, count: r.count }));

      res.status(200).json({
        success: true,
        data: {
          mostViewed: shape(viewed.rows),
          mostWishlisted: shape(wishlistedRows.rows),
          mostEnquired: shape(enquired.rows),
          whatsapp: shape(whatsapp.rows),
        },
      });
    } catch (err) {
      console.error('Analytics Packages Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch package analytics' });
    }
  });

  // ── GET /analytics/funnel ─────────────────────────────────────────
  router.get('/analytics/funnel', async (req, res) => {
    try {
      const days = clampDays(req.query.days);

      const [events, bookings] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE event_type = 'package_view')::int         AS package_view,
                  COUNT(*) FILTER (WHERE event_type = 'plan_trip_click')::int      AS plan_trip_click,
                  COUNT(*) FILTER (WHERE event_type = 'enquiry_form_opened')::int  AS enquiry_form_opened,
                  COUNT(*) FILTER (WHERE event_type = 'enquiry_form_started')::int AS enquiry_form_started
             FROM analytics_events
            WHERE created_at >= NOW() - make_interval(days => $1)`,
          [days]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM bookings
            WHERE created_at >= NOW() - make_interval(days => $1)`,
          [days]
        ),
      ]);

      const row = events.rows[0];
      res.status(200).json({
        success: true,
        data: [
          { stage: 'package_view', count: row.package_view },
          { stage: 'plan_trip_click', count: row.plan_trip_click },
          { stage: 'enquiry_form_opened', count: row.enquiry_form_opened },
          { stage: 'enquiry_form_started', count: row.enquiry_form_started },
          { stage: 'enquiries', count: bookings.rows[0].n },
        ],
      });
    } catch (err) {
      console.error('Analytics Funnel Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch funnel analytics' });
    }
  });

  // ── GET /bookings ─────────────────────────────────────────────────
  // Read-only lead list. When ?days is supplied the window is clamped like
  // the analytics routes; without it the newest 50 leads are shown regardless
  // of age — a lead older than a week is still a lead the admin must see.
  router.get('/bookings', async (req, res) => {
    try {
      const values = [];
      let where = '';
      if (req.query.days !== undefined) {
        values.push(clampDays(req.query.days));
        where = `WHERE b.created_at >= NOW() - make_interval(days => $1)`;
      }

      const { rows } = await pool.query(
        `SELECT b.id, b.name, b.travellers, b.status, b.created_at, b.visitor_id,
                to_char(b.travel_date, 'YYYY-MM-DD') AS travel_date,
                p.title AS package_title, p.slug AS package_slug
           FROM bookings b
           LEFT JOIN packages p ON p.id = b.package_id
           ${where}
          ORDER BY b.created_at DESC, b.id DESC
          LIMIT ${BOOKINGS_LIMIT}`,
        values
      );

      res.status(200).json({ success: true, data: rows.map(serializeBookingListRow) });
    } catch (err) {
      console.error('Admin Bookings List Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch bookings' });
    }
  });

  // ── GET /bookings/:id ─────────────────────────────────────────────
  // Full detail including the personal fields — this route is admin-only,
  // which is exactly where personal data is allowed to surface.
  router.get('/bookings/:id', async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const { rows } = await pool.query(
        `SELECT b.id, b.name, b.email, b.phone, b.travellers, b.departure_city,
                b.message, b.status, b.admin_notes, b.source, b.created_at,
                b.updated_at, b.visitor_id, b.session_id,
                to_char(b.travel_date, 'YYYY-MM-DD') AS travel_date,
                p.title AS package_title, p.slug AS package_slug
           FROM bookings b
           LEFT JOIN packages p ON p.id = b.package_id
          WHERE b.id = $1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const row = rows[0];
      res.status(200).json({
        success: true,
        data: {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          packageTitle: row.package_title,
          packageSlug: row.package_slug,
          travelDate: row.travel_date,
          travellers: row.travellers,
          departureCity: row.departure_city,
          message: row.message,
          status: row.status,
          adminNotes: row.admin_notes,
          source: row.source,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          visitorId: row.visitor_id,
          sessionId: row.session_id,
          hasJourney: row.visitor_id !== null,
        },
      });
    } catch (err) {
      console.error('Admin Booking Detail Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch the booking' });
    }
  });

  // ── GET /bookings/:id/journey ─────────────────────────────────────
  // The anonymous trail that preceded this lead: every event by the same
  // visitor in the 7 days before the enquiry (+2 minutes of slack, because
  // the enquiry_submitted event and the booking row race each other).
  router.get('/bookings/:id/journey', async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const booking = await pool.query(
        'SELECT id, visitor_id, created_at FROM bookings WHERE id = $1',
        [id]
      );
      if (booking.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Booking not found' });
      }

      const { visitor_id: visitorId, created_at: createdAt } = booking.rows[0];

      // A lead submitted without analytics ids (blocked storage, old client)
      // simply has no journey — that is an empty answer, not an error.
      if (!visitorId) {
        return res.status(200).json({
          success: true,
          data: { summary: summarizeJourney([]), events: [] },
        });
      }

      // Capped: a hostile visitor id can accumulate ~1.2M rows in a week at
      // the public rate limit, and an uncapped read would drag them all into
      // memory. Keep the newest rows (closest to the lead), serve them oldest
      // first, and say so when the cap was hit.
      const { rows: events } = await pool.query(
        `SELECT event_type, entity_type, entity_slug, page_path, metadata, created_at
           FROM (SELECT event_type, entity_type, entity_slug, page_path, metadata, created_at, id
                   FROM analytics_events
                  WHERE visitor_id = $1
                    AND created_at <= $2::timestamp + interval '2 minutes'
                    AND created_at >= $2::timestamp - interval '7 days'
                  ORDER BY created_at DESC, id DESC
                  LIMIT ${JOURNEY_EVENT_LIMIT}) recent
          ORDER BY created_at ASC, id ASC`,
        [visitorId, createdAt]
      );

      res.status(200).json({
        success: true,
        data: {
          summary: summarizeJourney(events),
          events: events.map(serializeEvent),
          truncated: events.length === JOURNEY_EVENT_LIMIT,
        },
      });
    } catch (err) {
      console.error('Admin Booking Journey Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch the journey' });
    }
  });

  // ── GET /security/audit ───────────────────────────────────────────
  //
  // The admin authentication trail. Protected by the router-wide requireAuth
  // like everything else here — an audit log readable without credentials would
  // hand an attacker a list of valid admin usernames and their login times.
  //
  // Only bounded, non-sensitive columns are selected. lib/adminAudit.js already
  // guarantees no password, hash, token or connection string reaches the table,
  // so there is nothing to redact on the way out.
  router.get('/security/audit', async (req, res) => {
    try {
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), AUDIT_LIMIT);
      const { rows } = await pool.query(
        `SELECT l.id, l.admin_id, l.event_type, l.success, l.ip_address, l.user_agent,
                l.metadata, l.created_at, a.username
           FROM admin_audit_logs l
           LEFT JOIN admins a ON a.id = l.admin_id
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT $1`,
        [limit]
      );

      res.status(200).json({
        success: true,
        data: rows.map((row) => ({
          id: String(row.id),
          eventType: row.event_type,
          success: row.success,
          // The joined username for an existing admin; the one preserved in
          // metadata when the account has since been deleted; otherwise the
          // username that was attempted. Null only for a truly anonymous event.
          admin: row.username ?? row.metadata?.username ?? row.metadata?.attemptedUsername ?? null,
          adminExists: row.username !== null,
          ip: row.ip_address,
          client: summarizeUserAgent(row.user_agent),
          reason: row.metadata?.reason ?? null,
          createdAt: row.created_at,
        })),
        meta: { limit, returned: rows.length },
      });
    } catch (err) {
      console.error('Admin Security Audit Error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch the security activity' });
    }
  });

  return router;
};

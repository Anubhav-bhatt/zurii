/**
 * Public write API for trip enquiries.
 *
 *   POST /api/bookings   create one enquiry (no auth — this is the lead form)
 *
 * Conventions follow routes/travel.js and server.js: `{ success, data }` on
 * success, `{ success: false, error }` on failure, a structured log line for
 * the operator (lib/logger.js) and a plain sentence for the client. A database
 * error message can name tables and columns, so it never crosses the wire.
 *
 * Marketing attribution (lib/attribution.js) rides along with the enquiry and,
 * like the analytics ids, can never fail it.
 *
 * The only trusted input is what lib/validateBooking.js returns, and every
 * value reaching SQL is a bound parameter.
 *
 * `status` and `source` are deliberately not accepted from the request: a
 * visitor must not be able to post an enquiry that is already 'CONFIRMED', so
 * both come from the column defaults ('NEW', 'Website').
 */
const express = require('express');
const { validateBooking } = require('../lib/validateBooking');
const { readIdempotencyKey, hashSubmission, createOnce, IdempotencyError } = require('../lib/idempotency');
const { parseAttribution, attributionValues, ATTRIBUTION_COLUMNS } = require('../lib/attribution');
const { log, errorFields, classifyDbError } = require('../lib/logger');

const PUBLIC_PACKAGE_STATUS = 'PUBLISHED';

/** One message for every validation failure; the per-field map carries detail. */
const VALIDATION_ERROR = 'Please check the highlighted fields.';

module.exports = function createBookingsRouter(pool, options = {}) {
  const router = express.Router();

  // Anti-flood only. The endpoint stays public and anonymous — guest-first — and
  // the ceiling is generous enough that a real family sending several enquiries
  // is never blocked. Injectable so tests can drive the 429 path without
  // sending 20 real requests.
  const limiter = options.leadLimiter ?? require('../middleware/security').leadLimiter;

  // ── POST /api/bookings ────────────────────────────────────────────
  router.post('/bookings', limiter, async (req, res) => {
    const { valid, fields, value } = validateBooking(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, error: VALIDATION_ERROR, fields });
    }

    let idempotencyKey;
    try {
      idempotencyKey = readIdempotencyKey(req);
    } catch (err) {
      return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    }

    try {
      // A slug that was sent but does not resolve means the form was built from
      // stale or forged data. Storing NULL would silently lose which trip the
      // enquiry is about, so it is reported as a field error instead.
      let packageId = null;
      if (value.packageSlug) {
        const { rows } = await pool.query(
          'SELECT id FROM packages WHERE slug = $1 AND status = $2',
          [value.packageSlug, PUBLIC_PACKAGE_STATUS]
        );
        if (rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: VALIDATION_ERROR,
            fields: { packageSlug: 'That trip is no longer available.' },
          });
        }
        packageId = rows[0].id;
      }

      // Plan My Trip names a destination but no package. Resolved to an id for
      // reporting; an unknown or inactive slug is simply not recorded — it is
      // context, not something the visitor can fix.
      const parsed = parseAttribution(req.body);
      let destinationId = null;
      if (!packageId && parsed.destinationSlug) {
        const found = await pool.query('SELECT id FROM destinations WHERE slug = $1 AND active = true', [parsed.destinationSlug]);
        destinationId = found.rows[0]?.id ?? null;
      }
      const attribution = attributionValues(parsed);

      // visitor_id/session_id are anonymous analytics attribution ids.
      // validateBooking has already shape-checked them and dropped anything
      // malformed to null, so a bad id can never fail this INSERT.
      // Duplicate protection (Phase 4): see lib/idempotency.js.
      const { row: booking, replayed } = await createOnce(pool, {
        endpoint: 'booking',
        key: idempotencyKey,
        requestHash: hashSubmission({ ...value, packageId, destinationId, attribution }),
        insert: async (db) => {
          const { rows } = await db.query(
            `INSERT INTO bookings
               (package_id, name, email, phone, travel_date, travellers, departure_city, message,
                visitor_id, session_id, destination_id, ${ATTRIBUTION_COLUMNS.join(', ')})
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                     ${ATTRIBUTION_COLUMNS.map((_, i) => `$${i + 12}`).join(', ')})
             RETURNING id, status, created_at`,
            [
              packageId,
              value.name,
              value.email,
              value.phone,
              value.travelDate,
              value.travellers,
              value.departureCity,
              value.message,
              value.visitorId,
              value.sessionId,
              destinationId,
              ...attribution,
            ]
          );
          return rows[0];
        },
        load: async (db, id) => (await db.query('SELECT id, status, created_at FROM bookings WHERE id = $1', [id])).rows[0],
      });

      if (replayed) res.set('Idempotent-Replayed', 'true');
      res.status(201).json({
        success: true,
        data: { id: booking.id, status: booking.status, createdAt: booking.created_at },
      });
    } catch (err) {
      if (err instanceof IdempotencyError) {
        return res.status(err.status).json({ success: false, error: err.message, code: err.code });
      }
      // Structured and scrubbed: the error object carries the visitor's values.
      log.error('lead_insert_failed', { reqId: req.id, context: 'booking', ...errorFields(err) });
      if (['db_unavailable', 'db_timeout'].includes(classifyDbError(err))) {
        res.set('Retry-After', '30');
        return res.status(503).json({
          success: false,
          error: 'We could not send your enquiry just now. Please try again in a moment, or reach us on WhatsApp.',
          code: 'SERVICE_UNAVAILABLE',
        });
      }
      res.status(500).json({ success: false, error: 'We could not send your enquiry. Please try again, or reach us on WhatsApp.' });
    }
  });

  return router;
};

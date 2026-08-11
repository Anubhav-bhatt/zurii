/**
 * Public write API for trip enquiries.
 *
 *   POST /api/bookings   create one enquiry (no auth — this is the lead form)
 *
 * Conventions follow routes/travel.js and server.js: `{ success, data }` on
 * success, `{ success: false, error }` on failure, console.error for the
 * operator and a generic sentence for the client. A database error message can
 * name tables and columns, so it never crosses the wire.
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

      // visitor_id/session_id are anonymous analytics attribution ids.
      // validateBooking has already shape-checked them and dropped anything
      // malformed to null, so a bad id can never fail this INSERT.
      const { rows } = await pool.query(
        `INSERT INTO bookings
           (package_id, name, email, phone, travel_date, travellers, departure_city, message,
            visitor_id, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
        ]
      );

      const booking = rows[0];
      res.status(201).json({
        success: true,
        data: { id: booking.id, status: booking.status, createdAt: booking.created_at },
      });
    } catch (err) {
      console.error('Booking Insert Error:', err);
      res.status(500).json({ success: false, error: 'Failed to submit your enquiry' });
    }
  });

  return router;
};

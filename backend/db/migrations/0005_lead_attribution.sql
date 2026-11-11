-- 0005_lead_attribution
--
-- First-party marketing attribution on leads (Phase 6, ZT-16). Additive only:
-- new NULLable columns, one foreign key and one index. No existing row is read,
-- rewritten or back-filled: a lead saved before this migration simply has no
-- attribution, and reports show it as "not captured" rather than guessing.
-- See docs/MARKETING_ATTRIBUTION.md.
--
--   utm_source … utm_term   the session's UTM tags, at most 100 characters each
--   referrer_host           the referring site's host only, never a full URL
--   landing_page            the session's first page, path only (no query string)
--   click_id_type           'gclid' or 'fbclid' when the landing URL carried one;
--                           the identifier value itself is never stored
--   attribution_channel     derived when the lead is saved: paid_search,
--                           paid_social, display, email, social, organic_search,
--                           referral, other_campaign or direct
--   submission_source       the form: contact_page, trip_enquiry or plan_my_trip
--   bookings.destination_id the destination chosen on Plan My Trip (a package
--                           enquiry already reaches its destination through
--                           package_id)

-- ── contacts ────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN utm_source          VARCHAR(100),
  ADD COLUMN utm_medium          VARCHAR(100),
  ADD COLUMN utm_campaign        VARCHAR(100),
  ADD COLUMN utm_content         VARCHAR(100),
  ADD COLUMN utm_term            VARCHAR(100),
  ADD COLUMN referrer_host       VARCHAR(253),
  ADD COLUMN landing_page        VARCHAR(255),
  ADD COLUMN click_id_type       VARCHAR(10),
  ADD COLUMN attribution_channel VARCHAR(20),
  ADD COLUMN submission_source   VARCHAR(20);

-- ── bookings ────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN utm_source          VARCHAR(100),
  ADD COLUMN utm_medium          VARCHAR(100),
  ADD COLUMN utm_campaign        VARCHAR(100),
  ADD COLUMN utm_content         VARCHAR(100),
  ADD COLUMN utm_term            VARCHAR(100),
  ADD COLUMN referrer_host       VARCHAR(253),
  ADD COLUMN landing_page        VARCHAR(255),
  ADD COLUMN click_id_type       VARCHAR(10),
  ADD COLUMN attribution_channel VARCHAR(20),
  ADD COLUMN submission_source   VARCHAR(20),
  ADD COLUMN destination_id      INTEGER REFERENCES destinations(id) ON DELETE SET NULL;

-- ── analytics_events ────────────────────────────────────────────────
-- The campaign report's daily trend and the overview read every event in a
-- date window; until now only (event_type, created_at) and
-- (visitor_id, created_at) were indexed.
CREATE INDEX analytics_events_created_idx ON analytics_events (created_at);

-- 0001_baseline_schema
--
-- The seven application tables exactly as the pre-ledger boot path builds them
-- on an empty database:
--
--   db/baseSchema.js                       contacts, admins (+ every later column)
--   scripts/migrateTravelSchema.mjs        destinations, packages + indexes
--   scripts/migrateBookingsSchema.mjs      bookings + indexes
--   scripts/migrateAnalyticsSchema.mjs     analytics_events + indexes, lead attribution columns
--   scripts/migrateAdminSecuritySchema.mjs admin_audit_logs + indexes
--
-- Same column order, types, defaults, NOT NULLs, constraint names and index
-- definitions. Proven by `node scripts/db.mjs verify`, which compares the live
-- schema with db/schema/0001_baseline_schema.snapshot.json — captured from a
-- database built by those scripts, not written by hand.
--
-- Plain CREATE, not IF NOT EXISTS: the ledger runs this once, on an empty
-- database. An existing database is never "migrated" by this file; it is
-- adopted only after its schema is proven identical (migrate --adopt-baseline).
--
-- Deliberately absent: the legacy_* table renames (destructive, and only ever
-- needed by one abandoned schema) and any data. Seeding is db/catalogueSeed.js.

-- ── Leads: general contact form ────────────────────────────────────
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  interest VARCHAR(255),
  message TEXT,
  callback VARCHAR(50),
  priority VARCHAR(20) DEFAULT 'normal',
  status VARCHAR(30) DEFAULT 'pending',
  source VARCHAR(50) DEFAULT 'Website',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  visitor_id VARCHAR(64),
  session_id VARCHAR(64)
);

-- ── Admin accounts ─────────────────────────────────────────────────
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  password_changed_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Travel catalogue ───────────────────────────────────────────────
CREATE TABLE destinations (
  id                SERIAL PRIMARY KEY,
  legacy_id         VARCHAR(150),
  name              VARCHAR(150) NOT NULL,
  slug              VARCHAR(150) NOT NULL UNIQUE,
  country           VARCHAR(100),
  region            VARCHAR(100),
  kind              VARCHAR(20)  NOT NULL DEFAULT 'domestic',
  short_description TEXT,
  description       TEXT,
  image             TEXT,
  gallery           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  featured          BOOLEAN      NOT NULL DEFAULT false,
  active            BOOLEAN      NOT NULL DEFAULT true,
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT destinations_kind_check CHECK (kind IN ('domestic', 'international'))
);

CREATE TABLE packages (
  id                SERIAL PRIMARY KEY,
  legacy_id         VARCHAR(200),
  title             VARCHAR(250) NOT NULL,
  slug              VARCHAR(250) NOT NULL UNIQUE,
  destination_id    INTEGER REFERENCES destinations(id) ON DELETE SET NULL,
  subtitle          VARCHAR(250),
  short_description TEXT,
  description       TEXT,
  duration_days     INTEGER,
  duration_nights   INTEGER,
  duration_text     VARCHAR(80),
  price             NUMERIC(12, 2),
  original_price    NUMERIC(12, 2),
  currency          VARCHAR(3)   NOT NULL DEFAULT 'INR',
  cover_image       TEXT,
  gallery           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  highlights        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  itinerary         JSONB        NOT NULL DEFAULT '[]'::jsonb,
  inclusions        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  exclusions        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  batches           JSONB        NOT NULL DEFAULT '[]'::jsonb,
  tags              JSONB        NOT NULL DEFAULT '[]'::jsonb,
  trip_type         VARCHAR(50),
  rating            NUMERIC(2, 1),
  reviews_count     INTEGER,
  group_size        VARCHAR(60),
  difficulty        VARCHAR(30),
  featured          BOOLEAN      NOT NULL DEFAULT false,
  popular           BOOLEAN      NOT NULL DEFAULT false,
  status            VARCHAR(20)  NOT NULL DEFAULT 'PUBLISHED',
  metadata          JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT packages_status_check CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  CONSTRAINT packages_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT packages_original_price_check CHECK (original_price IS NULL OR original_price >= 0)
);

CREATE INDEX destinations_kind_active_idx ON destinations (kind, active);
CREATE INDEX destinations_featured_idx    ON destinations (featured) WHERE featured;
CREATE INDEX destinations_name_lower_idx  ON destinations (lower(name));
CREATE INDEX packages_destination_id_idx  ON packages (destination_id);
CREATE INDEX packages_status_idx          ON packages (status);
CREATE INDEX packages_featured_idx        ON packages (featured) WHERE featured;
CREATE INDEX packages_popular_idx         ON packages (popular) WHERE popular;
CREATE INDEX packages_price_idx           ON packages (price);
CREATE INDEX packages_trip_type_idx       ON packages (trip_type);
CREATE INDEX packages_tags_gin_idx        ON packages USING GIN (tags);

-- ── Leads: trip enquiries ──────────────────────────────────────────
CREATE TABLE bookings (
  id              SERIAL PRIMARY KEY,
  package_id      INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  name            VARCHAR(120)  NOT NULL,
  email           VARCHAR(255)  NOT NULL,
  phone           VARCHAR(32)   NOT NULL,
  travel_date     DATE,
  travellers      INTEGER,
  departure_city  VARCHAR(120),
  message         TEXT,
  status          VARCHAR(20)   NOT NULL DEFAULT 'NEW',
  admin_notes     TEXT,
  source          VARCHAR(50)   NOT NULL DEFAULT 'Website',
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  visitor_id      VARCHAR(64),
  session_id      VARCHAR(64),
  CONSTRAINT bookings_status_check CHECK (status IN
    ('NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED')),
  CONSTRAINT bookings_travellers_check CHECK (travellers IS NULL OR
    (travellers >= 1 AND travellers <= 50))
);

CREATE INDEX bookings_status_idx     ON bookings (status);
CREATE INDEX bookings_package_id_idx ON bookings (package_id);
CREATE INDEX bookings_created_at_idx ON bookings (created_at DESC);

-- ── First-party anonymous analytics ────────────────────────────────
CREATE TABLE analytics_events (
  id           SERIAL PRIMARY KEY,
  visitor_id   VARCHAR(64)  NOT NULL,
  session_id   VARCHAR(64),
  event_type   VARCHAR(40)  NOT NULL,
  entity_type  VARCHAR(20),
  entity_id    INTEGER,
  entity_slug  VARCHAR(250),
  page_path    VARCHAR(300),
  referrer     VARCHAR(300),
  utm          JSONB,
  metadata     JSONB        NOT NULL DEFAULT '{}',
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX analytics_events_visitor_created_idx ON analytics_events (visitor_id, created_at);
CREATE INDEX analytics_events_type_created_idx    ON analytics_events (event_type, created_at);
CREATE INDEX analytics_events_entity_slug_idx     ON analytics_events (entity_slug) WHERE entity_slug IS NOT NULL;

-- ── Admin authentication audit trail ───────────────────────────────
CREATE TABLE admin_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  admin_id    INTEGER      REFERENCES admins(id) ON DELETE SET NULL,
  event_type  VARCHAR(64)  NOT NULL,
  success     BOOLEAN      NOT NULL DEFAULT TRUE,
  ip_address  VARCHAR(64),
  user_agent  VARCHAR(512),
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX admin_audit_logs_created_idx       ON admin_audit_logs (created_at DESC);
CREATE INDEX admin_audit_logs_admin_created_idx ON admin_audit_logs (admin_id, created_at DESC);
CREATE INDEX admin_audit_logs_event_created_idx ON admin_audit_logs (event_type, created_at DESC);

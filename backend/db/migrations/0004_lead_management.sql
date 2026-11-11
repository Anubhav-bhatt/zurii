-- 0004_lead_management
--
-- Unified lead management (Phase 4). Additive only: no table is dropped,
-- renamed or merged, no row is deleted, and no existing status value is
-- rewritten. See docs/LEAD_MANAGEMENT.md for the status model.
--
--   contacts.lead_status    the unified status of a contact lead. NULL until an
--                           admin changes it; until then it is derived from the
--                           legacy `status` (completed -> CLOSED, anything else
--                           -> NEW). `status` keeps its pending/completed meaning
--                           and is kept in step by the application.
--   bookings.status         gains CANCELLED, which the CRM offered but the
--                           constraint refused. Every old value stays valid.
--   deleted_at/_by/_reason  soft deletion for both tables (replaces the hard
--                           DELETE of contact leads).
--   lead_notes              internal notes. Append-only.
--   lead_activity           append-only history: status changes, notes,
--                           deletion and recovery — who and when.
--   lead_idempotency_keys   duplicate-submission protection for the public
--                           contact and enquiry forms; keys expire after 24 h.

-- ── contacts ────────────────────────────────────────────────────────
ALTER TABLE contacts
  ADD COLUMN lead_status   VARCHAR(20),
  ADD COLUMN deleted_at    TIMESTAMPTZ,
  ADD COLUMN deleted_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN delete_reason VARCHAR(500);

ALTER TABLE contacts
  ADD CONSTRAINT contacts_lead_status_check CHECK (lead_status IS NULL OR lead_status IN
    ('NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED'));

-- contacts had no index at all; the admin list reads active leads newest-first.
CREATE INDEX contacts_active_created_idx ON contacts (created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- ── bookings ────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN deleted_at    TIMESTAMPTZ,
  ADD COLUMN deleted_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  ADD COLUMN delete_reason VARCHAR(500);

-- Widened, never narrowed: every value the old constraint accepted is still accepted.
ALTER TABLE bookings DROP CONSTRAINT bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN
  ('NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED'));

CREATE INDEX bookings_active_created_idx ON bookings (created_at DESC, id DESC) WHERE deleted_at IS NULL;

-- ── notes and activity ──────────────────────────────────────────────
-- A lead is one row of contacts OR bookings, so each history row carries
-- exactly one of the two foreign keys. RESTRICT: a lead with history cannot be
-- hard-deleted by accident. admin_id is deliberately NOT a foreign key: the
-- trail must keep saying who acted even after that admin account is removed,
-- and the username is stored for the same reason.
CREATE TABLE lead_notes (
  id             BIGSERIAL    PRIMARY KEY,
  contact_id     INTEGER      REFERENCES contacts(id) ON DELETE RESTRICT,
  booking_id     INTEGER      REFERENCES bookings(id) ON DELETE RESTRICT,
  body           TEXT         NOT NULL,
  admin_id       INTEGER,
  admin_username VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_notes_one_lead_check CHECK (num_nonnulls(contact_id, booking_id) = 1),
  CONSTRAINT lead_notes_body_check CHECK (char_length(body) BETWEEN 1 AND 2000)
);
CREATE INDEX lead_notes_contact_idx ON lead_notes (contact_id, created_at) WHERE contact_id IS NOT NULL;
CREATE INDEX lead_notes_booking_idx ON lead_notes (booking_id, created_at) WHERE booking_id IS NOT NULL;

CREATE TABLE lead_activity (
  id             BIGSERIAL    PRIMARY KEY,
  contact_id     INTEGER      REFERENCES contacts(id) ON DELETE RESTRICT,
  booking_id     INTEGER      REFERENCES bookings(id) ON DELETE RESTRICT,
  action         VARCHAR(30)  NOT NULL,
  from_status    VARCHAR(20),
  to_status      VARCHAR(20),
  details        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  admin_id       INTEGER,
  admin_username VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT lead_activity_one_lead_check CHECK (num_nonnulls(contact_id, booking_id) = 1),
  CONSTRAINT lead_activity_action_check CHECK (action IN ('status_changed', 'note_added', 'deleted', 'restored'))
);
CREATE INDEX lead_activity_contact_idx ON lead_activity (contact_id, created_at) WHERE contact_id IS NOT NULL;
CREATE INDEX lead_activity_booking_idx ON lead_activity (booking_id, created_at) WHERE booking_id IS NOT NULL;

-- Append-only, enforced in the database rather than by convention: UPDATE,
-- DELETE and TRUNCATE are refused. The one exception is deliberate
-- maintenance — removing synthetic test rows, or an approved retention job —
-- which must opt in inside its own transaction:
--   SET LOCAL zurii.lead_history_maintenance = 'on';
-- This guards against accidents in application code; it is not a
-- tamper-proof ledger against someone who controls the database.
CREATE FUNCTION lead_history_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE')
     AND current_setting('zurii.lead_history_maintenance', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only (% refused)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER lead_notes_append_only BEFORE UPDATE OR DELETE ON lead_notes
  FOR EACH ROW EXECUTE FUNCTION lead_history_append_only();
CREATE TRIGGER lead_notes_no_truncate BEFORE TRUNCATE ON lead_notes
  FOR EACH STATEMENT EXECUTE FUNCTION lead_history_append_only();
CREATE TRIGGER lead_activity_append_only BEFORE UPDATE OR DELETE ON lead_activity
  FOR EACH ROW EXECUTE FUNCTION lead_history_append_only();
CREATE TRIGGER lead_activity_no_truncate BEFORE TRUNCATE ON lead_activity
  FOR EACH STATEMENT EXECUTE FUNCTION lead_history_append_only();

-- ── duplicate-submission protection ─────────────────────────────────
-- One row per (form, Idempotency-Key). The key is claimed in the same
-- transaction that inserts the lead, so a retry either finds the finished lead
-- or — if the first attempt failed — nothing at all. CASCADE: keys are
-- disposable and must never block removing a lead.
CREATE TABLE lead_idempotency_keys (
  endpoint        VARCHAR(20)  NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  request_hash    CHAR(64)     NOT NULL,
  contact_id      INTEGER      REFERENCES contacts(id) ON DELETE CASCADE,
  booking_id      INTEGER      REFERENCES bookings(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ  NOT NULL,
  PRIMARY KEY (endpoint, idempotency_key),
  CONSTRAINT lead_idempotency_keys_endpoint_check CHECK (endpoint IN ('contact', 'booking'))
);
CREATE INDEX lead_idempotency_keys_expires_idx ON lead_idempotency_keys (expires_at);

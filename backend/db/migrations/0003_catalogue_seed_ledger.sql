-- 0003_catalogue_seed_ledger
--
-- Provenance for catalogue rows created by db/catalogueSeed.js. Tooling table:
-- the API never reads it.
--
-- For every destination/package the seeder created it records the artifact
-- version and content hash it wrote, and a hash of the row as it stood right
-- after writing. On every later run the seeder compares the row's CURRENT hash
-- with row_hash:
--
--   equal      the row is untouched since seeding  -> safe to update from a newer artifact
--   different  someone edited it (admin, SQL, a fix script) -> never overwritten, reported
--   no entry   the row was not created by the seeder (e.g. production rows from
--              the old migrate:data import) -> never touched, reported
--
-- which is what makes re-running the seed safe against hand-edited content.
CREATE TABLE catalogue_seed_ledger (
  entity_type      VARCHAR(20)  NOT NULL,
  slug             VARCHAR(250) NOT NULL,
  artifact_version INTEGER      NOT NULL,
  artifact_hash    CHAR(64)     NOT NULL,
  row_hash         CHAR(32)     NOT NULL,
  seeded_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_type, slug),
  CONSTRAINT catalogue_seed_ledger_entity_type_check CHECK (entity_type IN ('destination', 'package'))
);

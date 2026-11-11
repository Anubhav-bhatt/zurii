# Database migrations, catalogue seeding and server deployment

Status: introduced in Phase 1 for **local** databases. Production still uses the
original boot path (`backend/docker-entrypoint.sh`) unchanged; moving production
onto the ledger is a separate, approved step described below.

## 1. Versioned migrations

```
backend/db/migrations/
  0001_baseline_schema.sql                    the seven application tables, exactly as the legacy boot path builds them
  0002_admins_username_case_insensitive.sql   formerly the manual migrate:admin-username
  0003_catalogue_seed_ledger.sql              provenance table for the catalogue seeder
  0004_lead_management.sql                    unified lead status, soft delete, notes, append-only
                                              activity, idempotency keys (docs/LEAD_MANAGEMENT.md)
  0005_lead_attribution.sql                   lead attribution columns, bookings.destination_id,
                                              analytics_events(created_at) index (docs/MARKETING_ATTRIBUTION.md)
```

**0004 and 0005 are required by the application.** The server checks for their
objects at startup and exits if any is missing, naming the migration
(`backend/db/leadSchema.js`) — it never applies them itself. Apply them to a
database *before* deploying code that needs them. 0005 is additive (nullable
columns, one foreign key, one index — no data read or rewritten); its index on
`analytics_events` is built without CONCURRENTLY, so writes to that table wait
while it builds (seconds for a typical size).

Retention report (read-only counts by age, Phase 6):
`node scripts/db.mjs retention-report --target <development|test|production>` —
see docs/PRIVACY_AND_RETENTION.md.

Applied by `backend/db/migrator.js` through `node scripts/db.mjs migrate --target <…>`.
The ledger table `schema_migrations` records `id`, SHA-256 `checksum`,
`applied_at`, `applied_by`, `execution_ms` and `adopted`.

- Each migration runs once, in its own transaction, recorded in that same transaction.
- An applied file whose checksum changes stops every later run. **Never edit an
  applied migration** — add a new one.
- A PostgreSQL advisory lock prevents two runners at once; `lock_timeout` (10s)
  and `statement_timeout` (5min) bound DDL.
- Migrations contain no data changes and no renames/drops (pinned by `tests/dbSafety.test.mjs`).
- Seeding is separate (`seed-catalogue`).

**Proof the baseline is exact.** `db/schema/0001_baseline_schema.snapshot.json`
was captured from a database built by the legacy scripts (`initBaseSchema`,
`migrateTravelSchema`, `migrateBookingsSchema`, `migrateAnalyticsSchema`,
`migrateAdminSecuritySchema`). A database built by the migrations matches it
column for column (types, defaults, NOT NULLs, order), constraint for constraint
and index for index; an independent `pg_dump --schema-only` comparison of the
two databases was identical (596 lines of DDL). `npm run db:dev:verify` and the
test suite re-check this every run.

### Adding a migration

1. Create `backend/db/migrations/0005_short_description.sql` (no `BEGIN`/`COMMIT`).
2. `npm run db:dev:migrate`, then `npm test` (rebuilds `zurii_test` from scratch).
3. If it changes one of the seven tables, regenerate the expectation the tests
   compare against only if the change is intended for the baseline itself —
   normally it is not. Instead, record exactly what the migration changes in
   `backend/db/schemaChanges.js`: `db:*:verify` and `databaseFoundation.test.mjs`
   accept a database only if it is the baseline plus the documented changes of
   the migrations its ledger lists.
4. The policy in `dbSafety.test.mjs` applies: no `RENAME`, no `DROP`, no data
   changes. Two narrow exceptions exist, both used by 0004: a CHECK constraint
   may be dropped and re-added **under the same name in the same migration**
   (the only way to widen one — the foundation test proves 0004 only widens),
   and trigger definitions may name the operations they guard
   (`BEFORE UPDATE OR DELETE ON …`, `TG_OP IN (…)`).

## 2. Catalogue artifact and seeding

Two artifacts in `backend/db/catalogue/`, each 36 destinations and 68 packages:

- `catalogue.v1.json` — generated deterministically by `npm run catalogue:export`
  from `frontend/src/data/index.js` via the existing extractor, with the source
  file's SHA-256 recorded. Image references are the original remote URLs.
- `catalogue.v2.json` — **what the seeder loads.** `npm run catalogue:localize`
  derives it from v1 and the image manifest
  (`tools/images/manifest/image-manifest.v1.json`). Only image references
  change, to locally hosted site-relative paths; the SHA-256 of both inputs is
  recorded. See [IMAGE_ASSETS.md](IMAGE_ASSETS.md).

The backend never imports frontend files at runtime; the artifacts ship inside
the backend (and its Docker build context).

`npm run catalogue:check` fails if the frontend data changed without v1 being
regenerated. `npm run catalogue:localize:check` fails if v2 is not exactly what
v1 and the image manifest produce.

`seed-catalogue` (`backend/db/catalogueSeed.js`), in one transaction:

| Row state | Action |
|---|---|
| No row, no ledger entry | insert |
| Seeded, untouched since, artifact unchanged | nothing |
| Seeded, untouched since, artifact changed | update (e.g. the local image paths in v2) |
| Seeded, then edited | **never overwritten** — reported |
| Seeded, then deleted | **not re-created** — reported |
| Existed before the seeder (no ledger entry) | **never touched** — reported |

"Untouched" is decided by comparing an `md5` of the row with the hash recorded
when it was seeded (`catalogue_seed_ledger`). `--dry-run` reports without writing.
Image references must be portable — `http(s)://…` or a site-relative `/path` —
machine paths are rejected.

The six optional demo extras (`scripts/seed-zurii-demo.mjs`) are **not** part of
the artifact. Six packages have no destination in the source data and keep
`destination_id = NULL`, as the original import did: `varanasi-heritage`,
`manali-weekend`, `rishikesh-adventure`, `kasol-kheerganga`,
`munnar-tea-gardens`, `pushkar-cultural`.

### Image references

- `npm run db:dev:images` writes every catalogue image reference in `zurii_dev`
  to `backend/db/catalogue/image-references.v2.csv` (entity, slug, field,
  position, kind, host, reference). `image-references.v1.csv` is the same
  inventory taken before the images were localised, kept for reconciliation.
- Catalogue v2 points 358 of the 365 references at locally hosted files.
  Seeding it updated the 104 managed rows of `zurii_dev` and nothing else. The
  other 7 references (two Unsplash+ photographs) are still remote — see
  [IMAGE_ASSETS.md](IMAGE_ASSETS.md#unresolved--needs-a-decision).

## 3. Safety guards (`backend/db/safety.js`)

| Tool | Guard |
|---|---|
| `scripts/db.mjs --target development` | `DATABASE_URL` → exactly `zurii_dev`, approved local host, live `current_database()`, marker `development`, non-superuser |
| `scripts/db.mjs --target test`, `npm test` | `TEST_DATABASE_URL` → exactly `zurii_test`, approved local host, credentials/database not shared with any `DATABASE_URL`, live checks, marker `test`, non-superuser; never falls back to `DATABASE_URL` |
| test files | refuse at import unless `ZURII_DB_TARGET=test` (set only by the runner); re-verify the live connection in `before()` |
| `reset` / `prepare` | test target only; re-verified on the same connection immediately before `DROP SCHEMA` |
| Manual data scripts (`migrateTravelData`, `seed-zurii-demo`, `remove-zurii-demo`, `fixTravelImages`, `migrate-zurii-v1`) | local: only verified `zurii_dev` / `zurii_test`; remote: only with `ZURII_CONFIRM_REMOTE_DATABASE=<exact database name>` |
| `--target production` | `ZURII_PRODUCTION_DB_APPROVED=yes`, `--confirm-database <name>` matching URL and `current_database()`, and no dev/test marker; never `reset`/`prepare` |

The production boot scripts run by `docker-entrypoint.sh` are deliberately **not**
guarded, so the live deployment behaves exactly as before.

## 4. Future one-shot production migration (prepared, NOT executed)

Run only in an approved maintenance window, by an operator, never automatically.

1. **Back up**: provider snapshot **and** `pg_dump -Fc`; confirm the restore works.
2. **Rehearse on a copy**: restore the snapshot to a staging database.
3. **Verify** (read-only):
   `ZURII_PRODUCTION_DB_APPROVED=yes node scripts/db.mjs verify --target production --confirm-database <name>`.
   Expected differences to resolve *before* adoption, each with its own reviewed
   migration or a recorded decision:
   - `contacts.status` may default to `'new'` (noted in `server.js`), not `'pending'`;
   - older column widths/orders (order is ignored; widths are compared);
   - `legacy_*` tables (ignored), the six demo packages (catalogue check only).
4. **Adopt**: `… migrate --target production --confirm-database <name> --adopt-baseline`.
   It refuses unless step 3 reports the schema identical; then it records 0001 as
   adopted (nothing executed) and applies 0002–0005. The full gated release
   sequence, with the pre-adoption checks, is in [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md).
5. Repeat 3–4 on production; run `verify` again.
6. **Switch the deploy path**: replace the five scripts in `docker-entrypoint.sh`
   with a single one-shot job — e.g. Render `preDeployCommand:
   node scripts/db.mjs migrate --target production --confirm-database <name>` —
   so migrations run once per release, never per replica. Remove boot-time DDL
   from `server.js` only after that job is live.
7. Catalogue: existing production rows were created by the old import, so
   `seed-catalogue` treats them as *unmanaged* and never touches them. Taking
   them under ledger management is its own future, verified step.

## 5. Server deployment checklist (portable, no machine-specific values)

1. Provision PostgreSQL 16 with TLS, automated backups and point-in-time
   recovery; create a least-privilege application role (not the provider superuser).
2. Set runtime environment: `DATABASE_URL`, `DATABASE_SSL=verify` (+
   `DATABASE_CA_CERT`), `JWT_SECRET`, `JWT_REFRESH_SECRET` (distinct, ≥32 chars),
   `ALLOWED_ORIGINS`, `NODE_ENV=production` behind TLS, `TRUST_PROXY` = number of
   proxy hops actually in front of the API.
3. Apply schema migrations once (step 4 procedure for an existing database;
   `migrate --target production` on an empty one).
4. Import the approved catalogue: `seed-catalogue --target production` (`--dry-run` first).
5. Verify integrity: `verify --target production`.
6. Start the backend (`node server.js`) — it fails fast on bad configuration or
   an unreachable database.
7. Build the frontend with `VITE_API_URL` empty and serve it behind a same-origin
   `/api/*` proxy (nginx or Vercel rewrite) so the refresh cookie stays first-party.
8. Probe `GET /api/health` (liveness) and `GET /api/ready` (database); run the
   smoke checks (destinations, packages, a package detail, 404s, admin 401).

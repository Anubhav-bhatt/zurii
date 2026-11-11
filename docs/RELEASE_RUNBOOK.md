# Release runbook — `feature/zurii-production-hardening` to production

Prepared in Phase 7 from local rehearsals. **Nothing here has been run against
production, Render, Vercel or GitHub.** Every gate needs a named approver and a
recorded result (who, when, output) in [OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md).
Stop at the first unexpected result; do not improvise on a production database.

Placeholders: `<PROD_DB_NAME>`, `<STAGING_DB_NAME>`, `<RELEASE_COMMIT>`,
`<PROD_ORIGIN>` (e.g. `https://www.example.com`), `<PREVIEW_URL>`,
`<RENDER_URL>` (the API's onrender.com URL), `<CA_PEM_FILE>`. Secrets are read
with `read -rs`, never typed as arguments or committed.

## 0. Why the order matters (evidence from the Phase 7 rehearsals)

| Fact | Consequence |
|---|---|
| Production runs `main`: legacy boot scripts, **no migration ledger**. | Adopt the baseline and apply 0002–0005 with the tool, after a verified backup. |
| The new backend exits at startup without 0004 and 0005 (`schema_behind`). | **Migrate first**, then deploy the backend. A deploy that skips this fails its start, and the old release should keep serving (confirm in the Render deploy log). |
| `main` runs unchanged on a database migrated to 0005 (rehearsed: boot, catalogue, contact and booking forms, admin list). | Migrating while the old release serves is safe. An application rollback never requires a database rollback. |
| The new backend accepts the old frontend's payloads and the old admin's `PATCH /api/contact/:id/complete` (rehearsed). | Backend before frontend. |
| Merging to `main` triggers Render **and** Vercel; Vercel usually finishes first. Rehearsed: the new frontend on the old backend serves every public journey (browse, search, filters, pagination, wishlist, enquiry forms), but the new admin CRM shows "Could not load enquiries" until the new backend is live. | Decide the order deliberately (step 7); a short frontend-first window affects admins only. |
| A `pg_dump`/`pg_restore` copy respells IN-list CHECK constraints. | Fixed in Phase 7 (`schemaSnapshot.canonicalConstraint`). Without the fix, a restored staging copy can never be adopted. Use the release commit's tooling. |
| On a legacy-imported catalogue, `verify` reports the **schema** identical but exits non-zero on the **catalogue** (image fields: remote URLs vs the v2 artifact's local paths — 169 fields when the catalogue equals `main`'s import). | Judge adoption by the `schema :` line. The catalogue result is expected until the catalogue is reconciled (step 9). |

## 1. Preconditions (all required)

- [ ] ZT-01 credential rotation done and verified ([OPERATOR_ACTIONS.md §1](OPERATOR_ACTIONS.md)).
- [ ] CI green on GitHub for the pull request (section 11).
- [ ] Owner approvals: Phase 5 content, privacy/retention text, canonical domain (`VITE_SITE_URL`).
- [ ] A maintenance window with low traffic; one operator, one reviewer.
- [ ] A trusted machine with Node 24 (`.nvmrc`), PostgreSQL 16 client tools (`pg_dump --version` ≥ the server's major) and a checkout of `<RELEASE_COMMIT>`:

```bash
git clone <repository-url> zurii-release && cd zurii-release && git checkout <RELEASE_COMMIT>
cd backend && npm ci --omit=dev
read -rs DATABASE_URL && export DATABASE_URL          # production URL from the password manager
export DATABASE_SSL=verify DATABASE_CA_CERT="$(cat <CA_PEM_FILE>)"
```

## 2. Gate 1 — backup and verified restore

```bash
pg_dump --format=custom --no-owner --file="zurii-$(date +%Y%m%d-%H%M).dump" "$DATABASE_URL"
```

Also take a provider snapshot (Aiven console). Restore the dump into a **separate,
access-restricted** staging database (never the production instance's own database):

```bash
read -rs STAGING_URL && export STAGING_URL
pg_restore --no-owner --role=<staging app role> --dbname="$STAGING_URL" zurii-<stamp>.dump
```

Verify: the row count of every table in staging equals production
(`SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1;` after `ANALYZE`,
or exact `count(*)` per table). Record both lists.

## 3. Gate 2 — schema comparison (read-only), staging first

```bash
DATABASE_URL="$STAGING_URL" ZURII_PRODUCTION_DB_APPROVED=yes \
  node scripts/db.mjs verify --target production --confirm-database <STAGING_DB_NAME>
```

Read-only pre-checks (run on staging, then on production):

```sql
SELECT to_regclass('public.schema_migrations');                         -- expect NULL (no ledger yet)
SELECT lower(username), count(*) FROM admins GROUP BY 1 HAVING count(*) > 1;   -- expect no rows (0002's unique index)
SELECT status, count(*) FROM bookings GROUP BY 1;                       -- expect only NEW/CONTACTED/INTERESTED/CONFIRMED/CLOSED
SELECT column_default FROM information_schema.columns
 WHERE table_name = 'contacts' AND column_name = 'status';              -- 'pending' (baseline) or 'new' (known drift)
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 2 DESC;    -- analytics_events size: 0005 builds an index on it
SELECT pid, state, now() - xact_start AS age FROM pg_stat_activity
 WHERE datname = current_database() AND xact_start < now() - interval '1 minute';  -- long transactions block DDL
```

Expected `verify` differences and what to do:

| Difference | Action |
|---|---|
| `contacts.status: default is 'new'…, expected 'pending'` | The code always inserts `status` explicitly (`'pending'`), so the default is unused. With owner approval: `ALTER TABLE contacts ALTER COLUMN status SET DEFAULT 'pending';` (metadata only). Rehearsed. |
| `legacy_*` tables | Ignored by the comparison; leave them. |
| Anything else (column type/width, missing/extra constraint or index, unexpected table) | **Stop.** It needs its own reviewed decision or migration. |
| Catalogue: fields differ, `0 ledger rows` | Expected for legacy-imported rows; not an adoption criterion. Record the count. |

## 4. Gate 3 — full rehearsal on the staging copy

```bash
export DATABASE_URL="$STAGING_URL" ZURII_PRODUCTION_DB_APPROVED=yes
# apply exactly the approved drift statement(s) from Gate 2, then:
node scripts/db.mjs migrate --target production --confirm-database <STAGING_DB_NAME>                  # must REFUSE (no --adopt-baseline)
node scripts/db.mjs migrate --target production --confirm-database <STAGING_DB_NAME> --adopt-baseline # adopts 0001, applies 0002–0005
node scripts/db.mjs verify  --target production --confirm-database <STAGING_DB_NAME>                  # schema : identical … + documented changes
node scripts/db.mjs migrate --target production --confirm-database <STAGING_DB_NAME>                  # 0 applied, 5 already applied
```

Then start both releases against the staging copy (container or local process,
`NODE_ENV=production`, staging-only JWT secrets) and smoke-test each: `/api/ready`,
`/api/packages?limit=1`, one destination, one trip, admin login and lead list.
The previous release must also boot (it is the application rollback). Record
timings: the Phase 7 rehearsal applied 0002–0005 in under 50 ms on a small database.

## 5. Gate 4 — approval

Reviewer signs off the Gate 1–3 outputs. Without it, do not continue.

## 6. Gate 5 — production migration (old release keeps serving)

```bash
pg_dump --format=custom --no-owner --file="zurii-pre-migration-$(date +%Y%m%d-%H%M).dump" "$DATABASE_URL"   # fresh backup
export ZURII_PRODUCTION_DB_APPROVED=yes
node scripts/db.mjs verify  --target production --confirm-database <PROD_DB_NAME>
# the SAME approved drift statement(s) as on staging, nothing else
node scripts/db.mjs migrate --target production --confirm-database <PROD_DB_NAME> --adopt-baseline
node scripts/db.mjs verify  --target production --confirm-database <PROD_DB_NAME>
node scripts/db.mjs status  --target production --confirm-database <PROD_DB_NAME>
unset ZURII_PRODUCTION_DB_APPROVED DATABASE_URL STAGING_URL
curl -s https://<PROD_ORIGIN>/api/ready      # the old release still serves: {"status":"ready"}
```

Locks: each migration runs in one transaction with `lock_timeout` 10 s. If it
times out (a long transaction), nothing is applied; retry later. 0005's index
on `analytics_events` blocks analytics writes while it builds (fire-and-forget
events only; enquiries are unaffected).

## 7. Gate 6 — backend release (Render)

Decide the deploy order first: merging to `main` starts both providers.

- **Preferred:** Render: Settings → turn **Auto-Deploy off** before merging.
  Vercel: optionally pause production deploys (Project → Git → Ignored Build
  Step), or accept that the frontend may go live first (see section 10).
- Merge the reviewed pull request. Then **Render → Manual Deploy → `<RELEASE_COMMIT>`**.
- Watch the deploy log for `"event":"startup"` with `"node":"v24.19.0"`, and for
  **no** `"event":"startup_failed"`. The entrypoint's legacy schema lines are
  expected and harmless on the migrated schema (verified after boot in Phase 7).
- `curl -s <RENDER_URL>/api/health` → `{"status":"ok"}`; `/api/ready` → `{"status":"ready"}`.
- No new environment variables are required (same set as `main`).

## 8. Gate 7 — frontend release (Vercel)

- Production environment: `VITE_SITE_URL=<PROD_ORIGIN>`; `VITE_API_URL` **unset**.
- "Include files outside the root directory in the Build Step" enabled
  (the prerender reads `backend/db/catalogue/catalogue.v2.json`).
- Deploy a **preview** first and run section 12 against it; then promote/deploy production.
- Build log must show `prerender: 124 pages … · sitemap 123 URLs`.

## 9. Gate 8 — post-release verification

```bash
O=<PROD_ORIGIN>
curl -s $O/api/ready                                              # {"status":"ready"}
curl -s "$O/api/packages?limit=1" | grep -o '"total":[0-9]*'      # the live catalogue count
curl -sI $O/api/admin/leads | grep -i -E '^HTTP|cache-control'    # 401, no-store
curl -s $O/trip/<a published slug> | grep -o '<title>[^<]*'      # the trip's own title
curl -s -o /dev/null -w '%{http_code}\n' $O/no-such-page          # 404
curl -sI "$O/international?utm_source=x" | grep -i location       # /packages?tag=international&utm_source=x
curl -s $O/robots.txt | grep Sitemap                              # names $O/sitemap.xml
```

Then in a browser: admin login (session survives a reload), lead list, one
status change on a clearly marked test lead (delete it afterwards), and the
Meta procedure in section 13. Catalogue images: production rows still hold the
pre-Phase-2 remote image URLs (the seeder never touches unmanaged rows), so
pages show remote images until an approved catalogue reconciliation step.

## 10. Rollback and forward recovery

**Application rollback (backend):** Render → Deploys → redeploy the previous
successful deploy. Rehearsed compatible with the migrated schema, with these
effects while rolled back:

- leads soft-deleted in the new CRM reappear in the old admin list;
- the old admin cannot hard-delete a lead that has CRM notes/activity (500; history is append-only by design);
- old-admin status changes update `contacts.status` only — the new CRM's `lead_status` does not see them;
- new leads have no attribution and no duplicate protection; the new CRM shows them as `NEW`.

**Frontend rollback:** Vercel → Deployments → previous production deployment →
Promote/Instant Rollback. The old frontend works against the new backend
(rehearsed: payloads and the old admin's complete/reopen calls).

**Database:** there are no down-migrations (policy: no drops), and none is
needed for an application rollback. Prefer forward fixes. Restoring the
pre-migration dump is a last resort that **loses every lead written since**;
it needs owner approval and an export of newer leads first. `verify` works on
restored copies since the Phase 7 fix.

**Partial migration:** each migration commits separately. If 0002–0005 stops
part-way (for example 0002 on duplicate usernames), the ledger records exactly
what was applied, the old release keeps serving, and the new backend will not
start. Fix the cause, then re-run `migrate`.

## 11. GitHub CI (once pushing is authorised)

```bash
git push -u origin feature/zurii-production-hardening
gh pr create --base main --head feature/zurii-production-hardening --title "Production hardening (Phases 0–7)" --body-file <description>
gh pr checks --watch      # three jobs: Frontend…, Backend…, Image manifest integrity
```

Then apply branch protection on `main` as recommended in [CI.md](CI.md)
(require PR review, the three status checks, up-to-date branches, conversation
resolution; block force pushes; include administrators). A local rehearsal is
not a CI result.

## 12. Preview-deployment checks (Vercel preview → Render)

```bash
P=<PREVIEW_URL>
curl -s $P/about | grep -o '<title>[^<]*'                          # its own title
curl -s -o /dev/null -w '%{http_code}\n' $P/no-such-page           # 404
curl -s $P/trip/no-such-trip | grep -c 'id="root"'                 # 1 (shell; the app shows "no longer available")
curl -sI "$P/international?utm_source=x" | grep -i -E '^HTTP|location'   # 308 → /packages?tag=international&utm_source=x
curl -sI $P/admin | grep -i x-robots-tag                            # noindex, nofollow
curl -s $P/robots.txt                                               # Disallow: /   (preview)
curl -sI $P/assets/index-<hash>.js | grep -i cache-control         # public, max-age=31536000, immutable
curl -s -o /dev/null -w '%{http_code}\n' $P/assets/missing.js      # 404
curl -sI $P/ | grep -i -E 'content-security-policy|x-frame-options|x-content-type'
curl -sI $P/api/admin/leads | grep -i cache-control                 # no-store
```

Client IP behind Vercel → Render: follow [DEPLOYMENT.md → Client IP and rate limits](../DEPLOYMENT.md#client-ip-and-rate-limits)
and confirm two different networks do not share a login rate-limit bucket.

## 13. Meta Events Manager — manual test (approved preview only)

1. Events Manager → Data sources → Pixel `4858424197723199` → Settings: confirm
   **Automatic advanced matching is off**. On 2026-11-11 the Pixel's live
   configuration still had it **on** — switch it off first.
   Use an ordinary desktop browser with ad/tracker blockers disabled for the
   preview. Meta's bot blocking (enabled for this Pixel) silently drops events
   from headless or automated browsers, so an automated run proves nothing about
   delivery either way.
2. Test events → enter `<PREVIEW_URL>` → open it from there (adds the test marker).
3. Before choosing anything in the cookie banner: **no events** appear.
4. Allow → one `PageView`. Navigate to `/packages` by clicking a link (no reload)
   → one more `PageView`. This is the case fixed in the final audit; it
   must appear.
5. Open a trip → `PageView` + `ViewContent` (`content_ids` = the trip slug, `content_type` = product).
6. Search from the header → one `Search` with only `content_category: packages` (no query text).
7. Submit a Contact Us enquiry clearly marked TEST → one `Lead` (`content_category: contact`)
   only after the success message. Repeat for a trip enquiry (`trip_enquiry`) and Plan My Trip (`plan_my_trip`).
8. Click a WhatsApp button (do not send the message) → one `Contact`.
9. Open `/admin` → no events.
10. Footer → Cookie preferences → Decline → no further events; `_fbp`/`_fbc` cookies gone.
11. In every event's parameters: no names, emails, phone numbers, messages or campaign values.
12. Delete the TEST leads in the CRM. Record the result in OPERATOR_ACTIONS.md.

## 14. Monitoring (first 72 hours)

Uptime checks on `/api/health` (liveness) and `/api/ready` (readiness), alerts
on `startup_failed`, `lead_insert_failed`, 5xx rate and `db_unavailable` log
events ([OBSERVABILITY.md](OBSERVABILITY.md)); daily look at lead counts per
source in the CRM against the previous week.

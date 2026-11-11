# Deployment handoff — Zurii Travels production hardening

For the engineer who will release this work. It summarises; the procedures are
in the linked documents. **Nothing has been deployed, no production database
has been touched, and `main` has not been updated.** Production release is
**not authorised** until the blockers in section 9 are closed.

| | |
|---|---|
| Repository | `https://github.com/Anubhav-bhatt/zurii` (public) |
| Branch | `feature/zurii-production-hardening` — one commit on top of `main` (`d80380c`) |
| Release sequence | [RELEASE_RUNBOOK.md](RELEASE_RUNBOOK.md) — follow it gate by gate |
| Open actions | [OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md) (status register at the top) |
| Also read | [../DEPLOYMENT.md](../DEPLOYMENT.md), [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md), [CI.md](CI.md) |

## 1. Deploy triggers — read first

- Vercel's GitHub integration deploys **Production on every push to `main`**
  (GitHub's deployment history shows one per `main` commit) and a Preview for
  other branches.
- `render.yaml` deploys `main` automatically (`autoDeploy: true`).
- Therefore **merging or pushing `main` is the release.** Pause Render
  auto-deploy and Vercel production deploys in the providers' dashboards before
  `main` is updated, and confirm it there — editing `render.yaml` alone is not
  evidence.
- A Preview of this branch calls the **production** API (the `/api` rewrite in
  `frontend/vercel.json`); a form submitted there writes a real lead. Treat
  previews as production-connected.

## 2. Frontend (Vercel, Root Directory `frontend`)

- React 19, Vite 8, Tailwind 4. Node 24 (`.nvmrc`). `npm ci && npm run build`
  (Vite build, then prerendering of 124 pages and `sitemap.xml`).
- The build reads `backend/db/catalogue/catalogue.v2.json`: keep "Include files
  outside the root directory in the Build Step" enabled.
- Environment (names only): `VITE_SITE_URL` (Production only — the canonical
  origin; without it there are no canonical URLs and no sitemap),
  `VITE_API_URL` (must be **unset**), `VITE_META_PIXEL_ID` (optional override;
  empty disables the Pixel), `SITE_NOINDEX` (staging builds).
- Images ship from `frontend/public/assets/{travel,brand}/v1/` with immutable
  caching; never change bytes at a published path ([IMAGE_ASSETS.md](IMAGE_ASSETS.md)).

## 3. Backend (Render, Docker)

- Express 5 on `node:24.19-alpine` (`backend/Dockerfile`), health check
  `/api/health` (liveness, no database); `/api/ready` checks PostgreSQL.
- Environment (names only): `DATABASE_URL`, `DATABASE_SSL` (`verify`),
  `DATABASE_CA_CERT`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (different, ≥32
  characters), `ALLOWED_ORIGINS`, `NODE_ENV=production`, `TRUST_PROXY`,
  `PORT`, `LOG_LEVEL` (optional). Leave `ADMIN_SEED` and `COOKIE_SAMESITE`
  unset. Same variables as the current release — none are new.
- **The server refuses to start until migrations 0004 and 0005 are applied.**
  The entrypoint still runs the legacy schema scripts on every boot; they are
  harmless on the migrated schema (verified).

## 4. PostgreSQL 16

- TLS with certificate verification, automated backups and point-in-time
  recovery. The app role must own the tables (the boot scripts run DDL), so it
  cannot be a read/write-only role; it should not be a superuser.
- Versioned migrations `backend/db/migrations/0001`–`0005`, applied only with
  `node scripts/db.mjs … --target production --confirm-database <name>` and
  `ZURII_PRODUCTION_DB_APPROVED=yes`. Production has **no migration ledger
  yet**: it must be adopted (`--adopt-baseline`) after a verified backup and a
  rehearsal on a restored copy ([RELEASE_RUNBOOK.md §2–6](RELEASE_RUNBOOK.md)).
- On production, `verify` reports the schema separately from the catalogue;
  the catalogue part is expected to fail on the legacy-imported rows (their
  image fields still point to remote URLs) until an approved reconciliation.

## 5. Order

Backup + verified restore → schema checks → rehearsal on the staging copy →
approval → production migration (the current release keeps serving) →
backend → frontend (preview first) → verification → monitoring.

## 6. Meta Pixel `4858424197723199`

Loads only after visitor consent; never on admin routes. Verified locally with
Meta's real library (delivery blocked). **Real delivery is unconfirmed.**
Before advertising: switch **Automatic advanced matching off** in Events
Manager (it was on in the Pixel's live configuration on 2026-11-11), then run
the manual Test Events procedure in [RELEASE_RUNBOOK.md §13](RELEASE_RUNBOOK.md)
with an ordinary browser — Meta's bot blocking drops events from automated ones.

## 7. Verification after release

`/api/health`, `/api/ready`, catalogue counts, trip page titles, a real 404,
legacy redirects, `robots.txt`, admin sign-in and the Meta procedure:
[RELEASE_RUNBOOK.md §9](RELEASE_RUNBOOK.md).

## 8. Rollback

Application rollback (Render: redeploy the previous deploy; Vercel: promote the
previous deployment) is compatible with the migrated schema; known side effects
and the database rule (no down-migrations; restoring a backup loses newer leads)
are in [RELEASE_RUNBOOK.md §10](RELEASE_RUNBOOK.md).

## 9. Blockers (all open)

Credential rotation for values exposed in Git history; verified production
backup and restore; migration adoption through 0005; provider checks on a
preview (routing, headers, client IP); the CI run on GitHub and branch
protection on `main` (none exists today); paused auto-deploys; owner approvals
(content, privacy and retention, canonical domain); Meta advanced matching off
and real Test Events delivery. Details and status: [OPERATOR_ACTIONS.md](OPERATOR_ACTIONS.md).

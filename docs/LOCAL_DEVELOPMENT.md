# Local development

How to run Zurii on a developer machine against an **isolated local
PostgreSQL 16** — two databases, two least-privilege roles, nothing shared with
production. For deploying, read [DEPLOYMENT.md](../DEPLOYMENT.md) instead; for
how schema and catalogue changes work, read [DATABASE_MIGRATIONS.md](DATABASE_MIGRATIONS.md).

## Requirements

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop / Engine | Compose v2 | Runs only the local database container |
| Node.js | 24 LTS (verified on 24.19) | Production images pin `node:24.19-alpine`; `.nvmrc` says 24 |
| npm | ≥ 10 | Lockfiles are npm lockfile v3 — use `npm ci` |
| openssl | any | Generates the local-only credentials |

## First-time setup (fresh machine)

```bash
# 1. Dependencies, exactly as locked
(cd backend && npm ci)
(cd frontend && npm ci)

# 2. Local-only credentials → three gitignored files (never printed, never overwritten)
sh infra/local-db/bootstrap-env.sh

# 3. Start PostgreSQL 16 on 127.0.0.1:55432 and wait until it is healthy
docker compose -f infra/local-db/compose.yml up -d --wait

# 4. Schema + travel catalogue for the development database
cd backend
npm run db:dev:migrate     # versioned migrations (ledger: schema_migrations)
npm run db:dev:seed        # 36 destinations, 68 packages from db/catalogue/catalogue.v2.json
npm run db:dev:verify      # schema + catalogue integrity — must print "verification passed"

# 5. Run it
npm start                                  # API on http://localhost:5001  (backend/)
(cd ../frontend && npm run dev)            # SPA on http://localhost:5173 → calls :5001

# 6. An admin account for /admin/insights (prompts without echo; forced change at first login)
node create-admin.js add <username>
```

> **Port 5173 already in use?** Vite then picks another port, and the API's
> development CORS allowlist (5173, 4173, 3000, 8080) will refuse it. Either run
> `npm run dev -- --port 4173 --strictPort`, or add the origin to
> `ALLOWED_ORIGINS` in `backend/.env`.

## Tests

```bash
cd backend
npm run test:unit   # no database at all
npm test            # full suite: verifies zurii_test, rebuilds it (reset → migrate → seed), then runs everything
npm test -- tests/travel-api.test.mjs   # a subset
npm test -- --keep                      # skip the reset

cd ../frontend
npm run lint
npm test            # unit tests (pure modules: SEO metadata, attribution, trip plan, …)
npm run build       # vite build + prerendered pages, sitemap and robots.txt (docs/SEO.md)
VITE_SITE_URL=https://example.org npm run build && npm run check:seo -- https://example.org
```

The same checks run in GitHub Actions ([CI.md](CI.md)) against a disposable
PostgreSQL. Backend logs are JSON lines ([OBSERVABILITY.md](OBSERVABILITY.md));
pipe them through `jq` to read them locally.

`npm test` is the **only** supported way to run database-backed tests. It reads
`TEST_DATABASE_URL` (never `DATABASE_URL`), and refuses unless the target is
exactly `zurii_test`, on an approved local host, with its own credentials, the
`zurii.environment = 'test'` marker and a non-superuser role. Running a
database-backed test file directly (`node --test tests/…`) fails before it
connects.

## Database operations

All commands from the repository root. `zurii_local_admin` is the container
superuser — for inspection and backups only; the application never uses it.

| Task | Command |
|---|---|
| Start | `docker compose -f infra/local-db/compose.yml up -d --wait` |
| Stop (keeps data) | `docker compose -f infra/local-db/compose.yml stop` |
| Status / health | `docker compose -f infra/local-db/compose.yml ps` |
| Logs | `docker compose -f infra/local-db/compose.yml logs -f postgres` |
| SQL shell (dev) | `docker compose -f infra/local-db/compose.yml exec postgres psql -U zurii_local_admin -d zurii_dev` |
| Migration status | `cd backend && npm run db:dev:status` |
| Apply new migrations to dev | `cd backend && npm run db:dev:migrate` (0005 is required by the server from Phase 6) |
| Retention report (counts only) | `cd backend && npm run db:dev:retention` — see [PRIVACY_AND_RETENTION.md](PRIVACY_AND_RETENTION.md) |
| Back up dev | `docker compose -f infra/local-db/compose.yml exec -T postgres pg_dump -U zurii_local_admin -d zurii_dev -Fc > ~/zurii_dev-$(date +%Y%m%d-%H%M).dump` |
| Inspect a backup | `docker compose -f infra/local-db/compose.yml exec -T postgres pg_restore --list < ~/zurii_dev-….dump` |
| Restore into dev | `docker compose -f infra/local-db/compose.yml exec -T postgres pg_restore -U zurii_local_admin -d zurii_dev --clean --if-exists --no-owner --role=zurii_dev_app < ~/zurii_dev-….dump` |
| Rebuild the test DB | `cd backend && npm run db:test:prepare` |
| Image references (CSV) | `cd backend && npm run db:dev:images` |
| Rebuild / verify travel images | `cd tools/images && npm ci && npm run build && npm run verify` — see [IMAGE_ASSETS.md](IMAGE_ASSETS.md) |
| **Destroy all local data** | `docker compose -f infra/local-db/compose.yml down -v` |

Keep backups **outside** the repository. The volume (`zurii_local_pgdata`) keeps
the passwords it was first initialised with: after `down -v`, delete
`infra/local-db/.env` (and `backend/.env`, `backend/.env.test`) and re-run the
bootstrap script to get matching new ones.

## Configuration reference (names only — values are generated)

| Variable | Where | Purpose |
|---|---|---|
| `ZURII_LOCAL_PG_PORT` | `infra/local-db/.env` | Host port, default `55432` (bound to 127.0.0.1 only) |
| `ZURII_LOCAL_PG_SUPERUSER_PASSWORD` | `infra/local-db/.env` | Container superuser (admin/backup only) |
| `ZURII_DEV_DB_PASSWORD` / `ZURII_TEST_DB_PASSWORD` | `infra/local-db/.env` | Passwords of `zurii_dev_app` / `zurii_test_app` |
| `DATABASE_URL` | `backend/.env` | `postgres://zurii_dev_app:…@127.0.0.1:55432/zurii_dev` |
| `DATABASE_SSL` | `backend/.env`, `backend/.env.test` | `disable` — plaintext is acceptable on loopback only |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | `backend/.env`, `backend/.env.test` | Separate, generated values per file |
| `PORT`, `NODE_ENV` | `backend/.env` | `5001`, `development` (keep `development` on plain HTTP) |
| `TEST_DATABASE_URL` | `backend/.env.test` | `postgres://zurii_test_app:…@127.0.0.1:55432/zurii_test` |
| `ZURII_LOCAL_DB_HOSTS` | environment (optional) | Extra approved hosts for guarded targets, e.g. a compose service name |
| `ZURII_CONFIRM_REMOTE_DATABASE` | environment (operators only) | Required before the manual data scripts touch a non-local database |
| `ZURII_PRODUCTION_DB_APPROVED` | environment (operators only) | Required for `scripts/db.mjs --target production` |

Nothing in application code refers to a container name, a machine path or a
local credential; all of it is configuration.

## The two local databases

| | `zurii_dev` | `zurii_test` |
|---|---|---|
| Owner role | `zurii_dev_app` (no superuser, no createdb/createrole) | `zurii_test_app` (same) |
| Marker | `zurii.environment = development` | `zurii.environment = test` |
| Who uses it | the local API, `db:dev:*` | `npm test`, `db:test:*` only |
| Cross-access | test role cannot connect | dev role cannot connect |
| Reset allowed | no | yes (`reset` / `prepare`, guarded) |

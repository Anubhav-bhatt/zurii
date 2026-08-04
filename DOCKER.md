# Zurii — Docker: Run & Deploy

Containerised as three services. Everything below was verified end to end on
Docker 29.6 / Compose v5.3.

| Service    | Image           | Base                | Size   | Exposed |
| ---------- | --------------- | ------------------- | ------ | ------- |
| `frontend` | `zurii-frontend`| `nginx:1.27-alpine` | 78 MB  | `80` → host |
| `backend`  | `zurii-backend` | `node:20-alpine`    | 204 MB | internal only |
| `db`       | `zurii-db`      | `postgres:16-alpine`| 411 MB | internal only |

## Architecture

```
browser → :8080 ─→ nginx (frontend) ──┬─→ /            static React bundle
                                      └─→ /api/*  ───→ backend :5001 ──TLS──→ db :5432
```

nginx serves the built SPA **and** reverse-proxies `/api/*` to the backend, so
the browser only ever talks to one origin. That is deliberate:

- **No CORS.** No preflight, no origin allowlist to maintain.
- **The auth cookie works.** The refresh token is `SameSite=Lax`; on a split
  origin the browser would not send it and admin sessions would silently die.
- **The image is portable.** Vite bakes env vars in at *build* time, so an
  absolute API URL would mean rebuilding per environment. Same-origin relative
  paths make one image valid everywhere.

Only the frontend publishes a port. The backend and database are reachable only
on the internal Compose network.

---

## 1. Run locally

**Prerequisite:** Docker Desktop (or any Docker Engine) with Compose v2+.

```bash
cd zurii

# 1. Create your env file
cp .env.example .env

# 2. Fill in the required values
#    POSTGRES_PASSWORD — URL-safe characters only (no @ : / ? #)
#    JWT_SECRET, JWT_REFRESH_SECRET — generate each with:
openssl rand -hex 48
#    ADMIN_SEED — your admin login, as user:password

# 3. Build and start
docker compose up -d --build
```

Open **http://localhost:8080**. Change the port with `WEB_PORT` in `.env`.

Compose waits for Postgres to pass `pg_isready` before starting the backend, so
the first boot has no connection race. The backend creates the `contacts` and
`admins` tables and seeds admin accounts automatically on startup.

Verify it came up:

```bash
docker compose ps                      # all services running/healthy
docker compose logs -f backend         # expect "Server is running on port 5001"
curl -i -X POST localhost:8080/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"T","email":"t@t.com","phone":"1","interest":"Goa","message":"hi","callback":"am"}'
# → 201 Created
```

### Everyday commands

```bash
docker compose logs -f [service]        # tail logs
docker compose restart backend          # restart one service
docker compose up -d --build backend    # rebuild after a code change
docker compose down                     # stop (database volume preserved)
docker compose down -v                  # stop AND delete all data
docker compose exec db psql -U zurii -d zurii   # SQL shell
```

Rebuilding the **frontend** is required after changing `VITE_API_URL` — it is
compiled into the bundle, not read at runtime:

```bash
docker compose up -d --build frontend
```

---

## 2. Configuration

Set in `.env` next to `docker-compose.yml`. It is gitignored — never commit it.

| Variable             | Required | Default       | Notes |
| -------------------- | -------- | ------------- | ----- |
| `POSTGRES_PASSWORD`  | **yes**  | —             | URL-safe chars only; interpolated into a connection string |
| `JWT_SECRET`         | **yes**  | —             | Backend exits at startup if unset |
| `JWT_REFRESH_SECRET` | **yes**  | —             | Backend exits at startup if unset |
| `ADMIN_SEED`         | no       | *(empty)*     | Admin logins to create on first boot, `user:pass,user:pass`. Empty = none created |
| `POSTGRES_USER`      | no       | `zurii`       | |
| `POSTGRES_DB`        | no       | `zurii`       | |
| `WEB_PORT`           | no       | `8080`        | Host port for the UI |
| `NODE_ENV`           | no       | `development` | **Only set `production` behind HTTPS** — see below |
| `VITE_API_URL`       | no       | *(empty)*     | Empty = same-origin. Build-time only |
| `DATABASE_URL`       | no       | *(composed)*  | Set to override and use a managed Postgres |

### The `NODE_ENV` trap

`backend/server.js:176` sets the refresh cookie's `Secure` flag from
`NODE_ENV === 'production'`. Browsers refuse `Secure` cookies over plain HTTP,
including `http://localhost`. The failure is quiet and confusing: login appears
to succeed, then the admin is logged out ~15 minutes later when the access token
expires and the refresh call finds no cookie.

- Plain HTTP (local, or a VM before you add TLS) → keep `NODE_ENV=development`
- HTTPS in front of the stack → set `NODE_ENV=production`

---

## 3. Deploy

### Before you deploy — required

1. **Purge the old admin accounts from any existing database.** Admin
   credentials used to be hardcoded in `server.js` and are therefore still
   visible in this repository's **git history**. Treat `Yashjain28`,
   `aayat10`, and `arshiya01` — and those three passwords — as public
   knowledge, and never reuse them. Seeding now comes from `ADMIN_SEED`, but
   accounts already written to a database are unaffected by that change:

   ```bash
   docker compose exec backend node create-admin.js list
   docker compose exec backend node create-admin.js remove Yashjain28
   docker compose exec backend node create-admin.js remove aayat10
   docker compose exec backend node create-admin.js remove arshiya01
   ```

   A brand-new database created from this version has none of them.
2. **Choose your own `ADMIN_SEED`** rather than shipping the `CHANGE_ME`
   placeholder from `.env.example`.
3. **Generate fresh secrets** for the deployment host. Do not reuse the local
   `JWT_SECRET` / `JWT_REFRESH_SECRET`, and never commit them.
4. **Terminate TLS**, then set `NODE_ENV=production`.
5. **Back up the database** if it holds real enquiries.

### Option A — single VM (self-hosted, recommended for this stack)

Any Linux host with Docker. TLS is terminated by a reverse proxy on the host;
the stack itself binds to loopback only.

```bash
# on the server
git clone https://github.com/Anubhav-bhatt/zurii.git && cd zurii
cp .env.example .env && $EDITOR .env      # real secrets, NODE_ENV=production

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The prod overlay sets `NODE_ENV=production`, `restart: always`, binds the UI to
`127.0.0.1:8080`, and keeps Postgres unpublished.

Then put HTTPS in front. Caddy gets certificates automatically:

```caddy
# /etc/caddy/Caddyfile
zurii.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

`sudo systemctl reload caddy` and you are live. Because Caddy forwards to nginx,
which proxies `/api/*` internally, the whole app is served from one HTTPS
origin — cookies and CORS both behave.

To update:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Option B — managed Postgres (Aiven / Neon / Supabase / RDS)

Recommended for anything with real data: you get backups and failover instead of
a single Docker volume.

Set the full connection string in `.env` and start without the bundled database:

```bash
DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=require

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build --no-deps backend frontend
```

`--no-deps` keeps the local `db` service out. The app forces TLS for any
non-localhost host, which is exactly what managed providers want.

### Option C — PaaS (Render / Railway / Fly.io / App Runner)

These build the two Dockerfiles directly; skip Compose.

- **backend** — build context `./backend`. Set `DATABASE_URL`, `JWT_SECRET`,
  `JWT_REFRESH_SECRET`, `NODE_ENV=production`. Attach a managed Postgres.
- **frontend** — build context `./frontend`. Two choices:
  - *Same-origin (preferred):* leave the `VITE_API_URL` build arg empty and set
    the runtime env `BACKEND_URL=https://your-backend-host` so nginx proxies.
  - *Split origin:* set build arg `VITE_API_URL=https://your-backend-host`. You
    must then widen CORS in `server.js` and switch the cookie to
    `sameSite: 'none'`, or admin login will not persist.

Platform health checks: use `/healthz` for the frontend. The backend has no
health route — probe `/api/contact`, which answers `401` when alive (its
Docker `HEALTHCHECK` treats any HTTP response as healthy).

### Option D — Kubernetes

Both images are stateless and run as non-root, so they map to plain
Deployments. Put the secrets in a `Secret`, use a managed database, and route
with an Ingress. Set the frontend's `BACKEND_URL` to the backend Service DNS
name (e.g. `http://zurii-backend:5001`).

---

## 4. Troubleshooting

**`Cannot find module 'cookie-parser'`**
`backend/node_modules` is committed to this repo but predates the JWT-auth
commit. `backend/.dockerignore` excludes it so `npm ci` installs a clean tree —
if you removed that entry, restore it.

**`The server does not support SSL connections`**
`server.js:40-42` forces TLS for every host except `localhost`/`127.0.0.1`, and
it overwrites whatever `sslmode` the URL asked for. That is why `db/Dockerfile`
builds Postgres with a self-signed certificate rather than using
`postgres:16-alpine` as-is. Accepted because the pool connects with
`rejectUnauthorized: false`.

**Admin login works, then logs out after ~15 minutes**
`NODE_ENV=production` without HTTPS. See *The `NODE_ENV` trap* above.

**Cannot log in to the admin panel**
Check which accounts exist and create one if needed:

```bash
docker compose exec backend node create-admin.js list
docker compose exec backend node create-admin.js add <user> <password>
```

`ADMIN_SEED` only creates accounts that do not already exist — it never
overwrites a password. To change one:
`docker compose exec backend node create-admin.js reset <user> <newpass>`.

**`column "interest" does not exist` (Postgres `42703`)**
Fixed. `initDB()` now runs `ADD COLUMN IF NOT EXISTS` for `interest` and
`callback` alongside `priority`/`status`/`source`, so restarting the backend
repairs a database created by an older version. Historically these were missing,
which made `POST /api/contact` fail against any pre-existing database.

**Frontend calls `localhost:5001` in production**
`VITE_API_URL` was baked in at build time. Clear it and rebuild:
`docker compose up -d --build frontend`.

**`port is already allocated`**
Change `WEB_PORT` in `.env`.

**Contact form returns 502**
The backend is down or unreachable. `docker compose logs backend`. nginx
resolves the backend lazily via Docker DNS, so it starts fine on its own and
returns 502 until the backend answers.

---

## Files

| Path                      | Purpose |
| ------------------------- | ------- |
| `docker-compose.yml`      | Base stack: db + backend + frontend |
| `docker-compose.prod.yml` | Production overlay (TLS-fronted, loopback bind) |
| `.env.example`            | Template for `.env` |
| `backend/Dockerfile`      | Two-stage Node build, non-root, tini, healthcheck |
| `backend/.dockerignore`   | Excludes the stale committed `node_modules` |
| `frontend/Dockerfile`     | Vite build → nginx runtime |
| `frontend/nginx.conf`     | SPA fallback, `/api` proxy, caching (envsubst template) |
| `frontend/.dockerignore`  | Excludes `.env` so it cannot poison the build |
| `db/Dockerfile`           | Postgres 16 with TLS enabled |

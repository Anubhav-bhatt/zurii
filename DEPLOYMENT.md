# Deploying Zurii Travels

For the engineer deploying this application. It assumes no prior knowledge of
the codebase.

**You will create every credential yourself.** This repository contains no
password, key or connection string — not even an example one you could
accidentally ship. Anything that looks like a credential in an `.env.example`
is an empty blank waiting for your value.

> **Before you begin.** Credentials were committed to this repository's history
> in the past and must be treated as compromised. If you were handed existing
> database credentials, confirm with the repository owner that they have been
> rotated. See [Security notes](#security-notes).

---

## Contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Generating secrets](#generating-secrets)
- [Database setup](#database-setup)
- [Creating the first admin](#creating-the-first-admin)
- [Deployment](#deployment)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)
- [Security notes](#security-notes)

---

## Requirements

| Requirement | Notes |
|---|---|
| Docker | 24+ (needs Compose v2 interpolation with defaults) |
| Docker Compose | v2, i.e. `docker compose`, not `docker-compose` |
| PostgreSQL | 14+. Either the bundled container or a managed service |
| A domain | Needed for `ALLOWED_ORIGINS` and for TLS |
| TLS termination | nginx, Caddy, an ALB or a platform router **in front of** this stack. The bundled nginx listens on plain HTTP only |

You do **not** need Node.js installed. Everything builds inside Docker.

---

## Quick start

```bash
git clone <repository-url>
cd zurii

cp .env.example .env
$EDITOR .env          # fill in the blanks — see the table below

docker compose build
docker compose up -d
```

Then create your admin account:

```bash
docker compose exec backend node create-admin.js add <your-username>
```

No application source file needs editing at any point.

---

## Environment variables

All of these live in the `.env` file next to `docker-compose.yml`.

**Private** means server-side only — it never reaches a browser.
**Public** means Vite compiles it into the JavaScript bundle, where anyone who
loads the site can read it.

| Variable | Required | Visibility | Description | Example placeholder |
|---|---|---|---|---|
| `POSTGRES_PASSWORD` | Yes, topology A | Private | Password for the bundled database. URL-safe characters only — it is interpolated into a connection string | *(you generate)* |
| `POSTGRES_USER` | No | Private | Bundled database user | `zurii` |
| `POSTGRES_DB` | No | Private | Bundled database name | `zurii` |
| `DATABASE_URL` | Yes, topology B | Private | Full connection string for an external database. Overrides topology A entirely | `postgresql://USER:PASSWORD@HOST:5432/DATABASE_NAME` |
| `DATABASE_SSL` | No | Private | `verify` \| `no-verify` \| `disable`. See [Database SSL](#database-ssl) | `verify` |
| `DATABASE_CA_CERT` | No | Private | Path to a CA bundle in the container, or the PEM text. Only for `verify` | `/etc/ssl/certs/provider-ca.pem` |
| `JWT_SECRET` | **Yes** | Private | Signs 15-minute access tokens. Min 32 chars | *(you generate)* |
| `JWT_REFRESH_SECRET` | **Yes** | Private | Signs 7-day refresh tokens. Must **differ** from `JWT_SECRET` | *(you generate)* |
| `ALLOWED_ORIGINS` | **Yes in production** | Private | Comma-separated browser origins allowed to call the API. Never `*` | `https://zurii.example` |
| `NODE_ENV` | No | Private | `production` enables HSTS and `Secure` cookies. Only with TLS in front | `development` |
| `TRUST_PROXY` | No | Private | Trusted reverse-proxy hops. `1` behind the bundled nginx. Compose sets this for you | `1` |
| `ADMIN_SEED` | No | Private | Optional bootstrap admin, `user:password`. Prefer the CLI — see below | *(leave empty)* |
| `WEB_PORT` | No | Private | Host port for the web UI | `8080` |
| `VITE_API_URL` | No | **Public** | Leave **empty** for same-origin `/api/*` proxying. Baked in at image build time | *(empty)* |

### The one rule about `VITE_` variables

Anything prefixed `VITE_` is compiled into the browser bundle and is readable by
every visitor. A backend API URL is fine there. A database password, a JWT
signing secret or an admin password is not — those belong in the private
variables above and must only ever be read by the backend.

---

## Generating secrets

Generate each secret separately. Never reuse one for both JWT variables: they
sign tokens with different lifetimes, so a shared secret would make a captured
7-day refresh token usable as a 15-minute access token.

```bash
# Run once per secret and paste each result into a different variable
openssl rand -hex 64
```

For `POSTGRES_PASSWORD`, keep it URL-safe — it gets interpolated into a
`postgres://` string, so `@ : / ? #` would corrupt it:

```bash
openssl rand -hex 24
```

Store these in your hosting platform's secret manager. The `.env` file is for
the machine running Compose; it is gitignored and must never be committed.

Verify your configuration before starting anything:

```bash
docker compose run --rm backend npm run check:env
```

This prints one line per variable — `configured`, `MISSING` or `INVALID` — and
**never prints a value**. It exits non-zero when something is wrong, so it can
gate a deploy.

---

## Database setup

Pick one topology. Both use identical application source; the difference is
configuration only.

### Topology A — bundled PostgreSQL container

Suitable for a single-host, self-managed deployment.

1. Leave `DATABASE_URL` **empty** in `.env`.
2. Set `POSTGRES_PASSWORD`.
3. Start with `docker compose up -d`.

The connection string is composed for you as
`postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}`.

> The bundled database has no backups, no failover and no upgrade path. For
> real customer data prefer topology B.

### Topology B — external / managed PostgreSQL

Aiven, Neon, Supabase, RDS, Cloud SQL.

1. Set `DATABASE_URL` to the provider's connection string.
2. Set `DATABASE_SSL=verify` and supply `DATABASE_CA_CERT` if the provider
   issues its own CA.
3. Start **without** the bundled database:

```bash
docker compose up -d --build --no-deps backend frontend
```

`--no-deps` is what stops the unused `db` container from starting.

### Hostnames inside Docker

`localhost` inside a container means *that container*. It can never reach a
database on your host or in a sibling container.

| Database location | Correct host in `DATABASE_URL` |
|---|---|
| Bundled `db` service | `db` |
| Managed provider | the provider's hostname |
| PostgreSQL on the Docker host | `host.docker.internal` (Docker Desktop), or the host's LAN IP |

### Database SSL

| `DATABASE_SSL` | Behaviour | When to use |
|---|---|---|
| `verify` | Encrypts **and** authenticates the server certificate | Production. The correct choice |
| `no-verify` | Encrypts only; cannot detect an interceptor | A provider that gives you no CA bundle |
| `disable` | No TLS | Database on a private network or localhost |
| *(unset)* | TLS off for localhost, encrypted-but-unverified elsewhere | Backwards-compatible default |

The backend prints a warning at startup if production is running unverified. It
is a warning, not a failure — but `verify` is what you want before go-live.

### Schema initialisation

The schema applies itself. The container entrypoint
(`backend/docker-entrypoint.sh`) runs the migrations on every start, and the
server heals its own tables at boot. Every statement is `CREATE ... IF NOT
EXISTS` or `ADD COLUMN IF NOT EXISTS`:

- it never drops a table, never deletes data, and never resets anything;
- running it repeatedly is a no-op;
- an existing production database is brought up to date in place.

Exactly one migration is deliberately left for you to run by hand. It is
described in the next section, and a fresh deployment is not finished until you
have run it.

> **Scaling note.** This runs on every backend replica's boot. With more than
> one replica, two containers can issue the same DDL simultaneously, which
> PostgreSQL can answer with a duplicate-object error despite `IF NOT EXISTS`.
> The bundled Compose file runs a single backend, so this cannot occur. If you
> scale out, move the entrypoint's migration block into a one-shot init job.

### The one manual migration — `migrate:admin-username`

Run this once against the production database after the first deploy:

```bash
docker compose exec backend npm run migrate:admin-username

# On Render, use the service Shell, or run it from a checkout with
# DATABASE_URL pointed at the production database.
```

**Why it is not automatic.** Login matches case-insensitively
(`WHERE LOWER(username) = $1`), but the table's uniqueness constraint is
case-*sensitive*. So `Admin` and `admin` can both exist, both satisfy the
constraint, and one login then matches two rows — PostgreSQL returns whichever
it likes without an `ORDER BY`, so which account you authenticate as, and
therefore whose password is checked, becomes non-deterministic. This migration
adds a unique index on `LOWER(username)` so the constraint finally matches the
query.

It is idempotent and non-destructive — `CREATE UNIQUE INDEX IF NOT EXISTS`
only, no `DROP`, no `UPDATE`, no `DELETE` — so re-running it is a no-op.

It is kept out of `docker-entrypoint.sh` deliberately. If two accounts already
collide it reports them and exits non-zero without touching a row, and the
entrypoint runs under `set -e`: automating it would turn two badly-named admin
accounts into a total outage of the public website, catalogue and contact form
included. The blast radius has to match the fault, so you run it by hand and
read the result.

> If it reports a collision, resolve it before going further. Deciding which
> account is real is an operator's call — both automatic answers, renaming one
> or deleting one, can lock a person out of production.

---

## Creating the first admin

**Recommended — the CLI.** The password is prompted with echo disabled, so it
never enters your shell history, the process list, or any file:

```bash
docker compose exec backend node create-admin.js add <username>
```

You will be prompted twice. The password must be at least 20 characters and
must not be a common default.

The account is created with `must_change_password` set, so the new admin must
replace your temporary password at first login and can reach nothing else until
they do — every admin API answers `403 PASSWORD_CHANGE_REQUIRED` until it is
replaced, and the replacement must meet the full 20-character policy.

**When you have to read the password to someone**, 20 characters does not
survive the phone call. Use the bootstrap variant instead:

```bash
docker compose exec backend node create-admin.js add-temporary <username>
```

It accepts 10 characters or more — still block-listing the common defaults —
and is deliberately narrow: it is only available on the two commands that
*always* set `must_change_password`, so a short password can never become an
account's permanent one. Use `reset-temporary <username>` for the same thing on
an existing account.

Other commands:

```bash
docker compose exec backend node create-admin.js list
docker compose exec backend node create-admin.js change-password <username>
docker compose exec backend node create-admin.js disable <username>
docker compose exec backend node create-admin.js enable <username>
docker compose exec backend node create-admin.js remove <username>
```

`disable` revokes every session and blocks sign-in while keeping the account and
its audit history — prefer it to `remove` when someone leaves, because deleting
the row also severs the audit trail's link to what they did.

**Alternative — `ADMIN_SEED`.** For automated first-boot provisioning only. Set
`ADMIN_SEED=username:password` in `.env` and the account is created at startup,
also requiring a password change at first login. It is the weaker option: the
password sits in an environment variable readable by any process on the host,
and in whatever file supplied it. **Unset it once the account exists.**

Every admin has their own account and their own bcrypt hash. There is no shared
password, no master password in source, and no default account — if you create
no admin, the admin panel is simply unreachable.

---

## Deployment

### Local / staging over plain HTTP

```bash
cp .env.example .env
$EDITOR .env                    # NODE_ENV=development
docker compose build
docker compose up -d
```

Keep `NODE_ENV=development` when serving over plain HTTP. Setting `production`
marks the refresh cookie `Secure`, so browsers refuse to store it over HTTP and
admin login silently fails to persist.

### Production behind TLS

Terminate TLS in front of the stack, then use the production overlay:

```bash
cp .env.example .env
$EDITOR .env                    # NODE_ENV=production, ALLOWED_ORIGINS=https://your-domain
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The overlay binds the web port to `127.0.0.1` so your TLS proxy is the only
public entrypoint, sets `restart: always`, and never publishes the database.

Point your reverse proxy at `127.0.0.1:${WEB_PORT}` and configure it to
redirect HTTP to HTTPS and to send `X-Forwarded-Proto`.

### Render (backend only)

`render.yaml` at the repository root is a Blueprint for the API as a Docker web
service. Apply it from **Blueprints → New Blueprint Instance**; Render reads the
file from the repo, so the service's shape stays reviewed and versioned.

Render prompts for every value marked `sync: false` — `DATABASE_URL`,
`DATABASE_CA_CERT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ALLOWED_ORIGINS`. None
of them is in the file, and none should ever be.

Three settings that are specific to running behind Render's edge:

- **`TRUST_PROXY=1`.** Render terminates TLS and forwards to the container, so
  without this `req.ip` is Render's address for every request. The login rate
  limiter would then bucket the whole internet into one key — a single attacker
  could lock out every admin — and the audit trail would record the proxy's IP
  on every event.
- **`healthCheckPath: /api/health`, not `/api/ready`.** Render restarts a
  service whose health check fails, and restarts cannot fix an unreachable
  database — pointing it at the readiness probe turns a transient Aiven blip
  into a flap. Boot-time database failure is already fatal: `server.js` awaits
  `initDB()` and exits non-zero. Curl `/api/ready` yourself for the
  database-backed answer.
- **`DATABASE_SSL=verify` with `DATABASE_CA_CERT`.** Aiven issues its own CA;
  paste the PEM from their console. Without it the connection is encrypted but
  unauthenticated, and the startup log says so.

The entrypoint applies all five idempotent migrations before the server starts,
so a fresh Render deploy needs no manual migration step. That assumes **one
instance** — see the note in `backend/docker-entrypoint.sh` before scaling up.

> **Do not point the browser at this URL directly.** Serve the frontend with a
> `/api/*` proxy to this service instead — see [Vercel
> (frontend)](#vercel-frontend) below. The refresh cookie is `SameSite=Lax`, so a
> browser calling this origin from another site will not send it, and admins get
> signed out when their 15-minute access token expires. Setting `ALLOWED_ORIGINS`
> fixes CORS; it does not fix this.

### Vercel (frontend)

`frontend/vercel.json` makes the SPA and the API one origin from the browser's
point of view:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://zurii-alt4.onrender.com/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The first rule proxies the API; the second is the SPA fallback, so a deep link
like `/admin/insights` serves `index.html` instead of Vercel's 404. Order
matters — a catch-all above the `/api` rule would swallow every API call.

**`VITE_API_URL` must be unset or empty in the Vercel project.** This is the one
setting that silently breaks admin sessions. `VITE_*` variables are read at
*build* time and compiled into the bundle, and a dashboard value overrides the
repository default, so setting it to `https://zurii-alt4.onrender.com` makes the
browser bypass the proxy and call Render cross-site. The refresh cookie is then
never sent and the symptom is not an error — login succeeds, the dashboard works
for about fifteen minutes on the in-memory access token, and every page reload
lands on the login screen. Leaving it unset makes a production build use
same-origin `/api/...`; see `frontend/src/config/api.js`.

Verify it from the deployed bundle rather than from the dashboard:

```bash
# The API origin the bundle was built with. Expect NO output — an empty base URL
# means relative /api/... paths.
curl -s https://zurii.vercel.app/ | grep -o '/assets/[^"]*\.js' | head -1 |
  xargs -I{} curl -s https://zurii.vercel.app{} | grep -o 'https://[a-z0-9-]*\.onrender\.com'
```

With this topology the backend needs no cookie changes: leave `COOKIE_SAMESITE`
unset so the refresh cookie stays `SameSite=Lax`, which is the strongest value
that works. `ALLOWED_ORIGINS` is still required — config validation makes it
mandatory in production — and should list the frontend origin, but it is no
longer load-bearing for the browser, because the browser is not making a
cross-origin request. `TRUST_PROXY=1` stays set for the reason above; Vercel
adds a hop in front of Render, but Render's own edge is still the only hop whose
`X-Forwarded-For` this service should trust.

Check what the deployed backend actually sends, rather than what you think it is
configured with. A bogus cookie takes the clear-cookie path and echoes the real
attributes, without touching any account:

```bash
curl -s -i -X POST -H 'Cookie: zurii_refresh_token=bogus' \
  https://zurii.vercel.app/api/auth/refresh | grep -i '^set-cookie'
# Expect: Path=/; ...; HttpOnly; Secure; SameSite=Lax
```

#### Migrating off a cross-site setup

If that probe reports `SameSite=None`, the deployment is on the cross-site
topology and the two changes must be made **frontend first**:

1. Clear `VITE_API_URL` in the Vercel project and redeploy, so the bundle calls
   `/api/...` on its own origin. Sessions keep working throughout, because
   `SameSite=None` is sent in first-party contexts too.
2. **Then** delete `COOKIE_SAMESITE` on Render, returning the cookie to `Lax`.

The reverse order signs out every admin in between: a `Lax` cookie with a
still-cross-site bundle is precisely the combination the browser never sends.
`SameSite=None` is also a third-party cookie, which Safari's ITP blocks outright
and Firefox and Brave block in their default modes — so a cross-site deployment
that "works" generally means it works in Chrome, for now.

---

## Verification

Run these in order. Each one tells you a different thing is working.

```bash
# 1. Containers up, backend healthy (health depends on the database)
docker compose ps
```

`backend` must show `healthy`, not just `running`. If it shows `unhealthy`, the
database is unreachable — go to Troubleshooting.

```bash
# 2. Startup log — expect the ✓ lines and no stack trace
docker compose logs backend | tail -20
```

```bash
# 3. Liveness: is the process up?
curl -i http://localhost:8080/api/health
# HTTP/1.1 200 OK    {"status":"ok"}

# 4. Readiness: can it reach PostgreSQL?
curl -i http://localhost:8080/api/ready
# HTTP/1.1 200 OK    {"status":"ready"}
# 503 {"status":"not-ready"} means the database is not reachable
```

```bash
# 5. Frontend serves
curl -I http://localhost:8080/
# HTTP/1.1 200 OK, content-type: text/html
```

```bash
# 6. Public API returns data (proves the schema exists and is queryable)
curl -s http://localhost:8080/api/destinations | head -c 200
```

```bash
# 7. Admin routes reject anonymous callers — expect 401
curl -i http://localhost:8080/api/contact
curl -i http://localhost:8080/api/admin/analytics/overview
```

```bash
# 8. A wrong password is rejected generically — expect 401 and a message that
#    does NOT say whether the username exists
curl -i -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"nobody","password":"wrong"}'
```

```bash
# 9. CORS refuses an unlisted origin: the response must NOT echo it back
curl -si http://localhost:8080/api/destinations \
  -H 'Origin: https://evil.example' | grep -i access-control-allow-origin
# Expect NO output
```

```bash
# 10. Restart survives
docker compose restart backend && sleep 10 && curl -s http://localhost:8080/api/ready
```

Finally, open `http://localhost:8080/admin/insights` in a browser and sign in
with the account you created. You will be asked to change the password on first
login — that is the intended behaviour.

**Confirm no credentials are logged:**

```bash
docker compose logs backend | grep -Ei 'postgres://|password|secret|bearer' || echo "clean"
```

---

## Troubleshooting

### `required variable JWT_SECRET is missing a value`

Compose refused to start because `.env` is incomplete. Fill the named variable.
Run `docker compose run --rm backend npm run check:env` to see all of them at
once.

### Backend container restarts repeatedly

Read the reason — it is printed on every attempt:

```bash
docker compose logs backend | tail -30
```

The backend exits deliberately rather than serving while broken. The two
common causes:

- **`Configuration error — the server cannot start`** followed by a list of
  variables. Fix them in `.env` and `docker compose up -d` again.
- **`Database initialization failed: <reason>`**. See below.

### `Database initialization failed: connect ECONNREFUSED`

Nothing is listening at the host and port in `DATABASE_URL`.

- Using the bundled database? The host must be `db`, not `localhost`.
- Using a managed provider? Check the host and port, and that your server's IP
  is allowed through the provider's firewall.

### `Database initialization failed: password authentication failed`

Wrong user or password in `DATABASE_URL`. If you changed `POSTGRES_PASSWORD`
after the volume was created, note that PostgreSQL only reads that variable
when it *initialises* a fresh volume — the existing database still has the old
password. Either change it in the database:

```bash
docker compose exec db psql -U zurii -d zurii \
  -c "ALTER USER zurii WITH PASSWORD 'new-password';"
```

…or discard the volume, **which deletes all data**:

```bash
docker compose down -v      # destructive — data is gone
```

### `The server does not support SSL connections`

Your database is not serving TLS but the driver is requesting it. Set
`DATABASE_SSL=disable` for a plaintext local database.

### `self signed certificate in certificate chain`

`DATABASE_SSL=verify` without the provider's CA. Download their CA bundle,
mount it into the container, and point `DATABASE_CA_CERT` at that path — or use
`no-verify` temporarily, accepting that it cannot detect an interceptor.

### Frontend loads but every API call fails with a CORS error

`ALLOWED_ORIGINS` does not contain the origin the browser is actually using.
It must be the exact scheme and host with no trailing path or slash —
`https://zurii.example`, not `https://zurii.example/`. In production the
localhost dev origins are deliberately **not** trusted.

### Admin login succeeds but you are signed out on the next page

The refresh cookie is not coming back to `POST /api/auth/refresh`. Open the
Network panel on a reload and look at that request: no `Cookie` header means the
browser has it but will not send it, and a 401 with the cookie attached means the
server rejected it. Three causes, in the order worth checking:

1. **The browser is calling the API cross-site.** The requests should go to
   `https://<your-frontend>/api/...`. If they go straight to the backend's own
   origin, the `SameSite=Lax` cookie is not sent at all. Clear `VITE_API_URL` in
   the frontend's build environment and redeploy — see [Vercel
   (frontend)](#vercel-frontend). This is the common one, and the only one that
   still lets login itself succeed.
2. **`NODE_ENV=production` while serving over plain HTTP.** The cookie is marked
   `Secure`, so the browser discards it on receipt. Put TLS in front, or set
   `NODE_ENV=development` for a local HTTP deployment.
3. **The token was revoked server-side.** Changing a password, logging out or
   disabling the account all bump `token_version`, which invalidates every
   outstanding refresh cookie by design. Signing in again fixes it.

If you genuinely need the frontend on a different site from the API, set
`COOKIE_SAMESITE=none` on the backend as well. It requires HTTPS, and it is
weaker than the proxy — prefer the proxy.

### `port is already allocated`

Something else holds the port. Change `WEB_PORT` in `.env`.

### nginx: `502 Bad Gateway`

The frontend container is up but the backend is not reachable. Check
`docker compose ps` — if `backend` is `unhealthy`, fix the database first.

### Rate limits throttle every visitor at once

`TRUST_PROXY` is unset behind a proxy, so every visitor arrives with the
proxy's IP and shares one bucket. Compose sets `TRUST_PROXY=1` for the bundled
stack. Leave it **unset** if the backend is ever exposed directly — trusting
`X-Forwarded-For` on a directly reachable server lets any caller spoof their IP.

> When reporting a problem, never paste `.env`, `docker compose config` output,
> or a `DATABASE_URL`. The log lines above are written to be safe to share.

---

## Security notes

What is already in place, so you do not weaken it by accident:

- Passwords are bcrypt-hashed (cost 12); no plaintext password is ever stored,
  logged, returned by an API, or printed by the CLI.
- Login is rate-limited per IP+username, and accounts lock for 15 minutes after
  5 failed attempts. Both are deliberate — do not disable them.
- Login timing is equalised, so a wrong username costs the same as a wrong
  password and the endpoint cannot be used to enumerate usernames.
- Every failure returns the same generic message.
- Access tokens last 15 minutes; refresh tokens 7 days in an `HttpOnly`,
  `SameSite=Lax` cookie, marked `Secure` when `NODE_ENV=production`.
- Logout and password changes increment a per-admin `token_version`, which
  revokes every outstanding token for that admin immediately.
- Rotating `JWT_SECRET` or `JWT_REFRESH_SECRET` invalidates all sessions.
- Admin authentication events are written to an append-only audit table, which
  is allow-listed so no secret can be recorded there.
- Every SQL statement is parameterised.
- Request bodies are capped at 32 kB; errors return a generic message with no
  stack trace.
- `/api/admin/*` requires authentication at the router level, enforced
  server-side — hiding navigation in React is not a security control.

Your responsibilities:

- Rotate any credential you were given that has ever been in Git history.
- Put TLS in front of the stack and redirect HTTP to HTTPS.
- Enable MFA on GitHub, your database provider, your hosting provider and your
  domain registrar.
- Consider creating a least-privilege database user for the application rather
  than running it as the provider's superuser, keeping the superuser for
  administration.
- Never commit `.env`. Never use `git add -f` on it.

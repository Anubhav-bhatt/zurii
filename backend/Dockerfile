# syntax=docker/dockerfile:1

# Base image is pinned to a minor version rather than the floating `20-alpine`
# tag. `20-alpine` silently re-points at a new Node and a new Alpine on every
# rebuild, so two builds of the same commit could ship different runtimes — and
# a regression would look like an application bug. Bump this deliberately.
ARG NODE_VERSION=20.19-alpine

# ─────────────────────────────────────────────────────────────
# Stage 1: install production dependencies only
# ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Copy manifests first so this layer caches until dependencies change.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what the lockfile pins and fails loudly if the
# lockfile drifts from package.json. bcrypt v6 ships musl prebuilds, so no
# compiler toolchain is needed on Alpine.
#
# Install scripts are deliberately NOT disabled: bcrypt resolves its native
# prebuild in a postinstall step, and --ignore-scripts would produce an image
# that fails at require() time on every login.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ─────────────────────────────────────────────────────────────
# Stage 2: runtime
# ─────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

LABEL org.opencontainers.image.title="zurii-backend" \
      org.opencontainers.image.description="Zurii Travels API — Express + PostgreSQL" \
      org.opencontainers.image.source="https://github.com/anubhavbhatt/zurii" \
      org.opencontainers.image.licenses="UNLICENSED"

# `apk upgrade` picks up Alpine security fixes published after the base image
# was cut — without it the image ships whatever CVEs were open on tag day.
# tini reaps zombies and forwards SIGTERM so the container stops promptly
# instead of being SIGKILLed after the 10s timeout.
RUN apk upgrade --no-cache && apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=5001 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Dependencies and, below, the source tree are left owned by root while the
# process runs as `node`. That is deliberate and is the stronger arrangement:
# the application can read its own code but cannot rewrite it, so remote code
# execution has nowhere on disk to persist — a tampered `node_modules/pg` would
# otherwise survive every restart and sit in the path of every database call.
#
# It costs nothing here because this backend never writes to the filesystem at
# runtime (no uploads, no generated files, no cache directory); everything
# durable lives in PostgreSQL. If that ever changes, give the new path its own
# writable volume rather than chowning the application tree.
COPY --from=deps /app/node_modules ./node_modules

# Copy the whole source tree rather than naming each file.
#
# This used to enumerate `server.js migrate.js create-admin.js` and
# `middleware/`, which silently broke the image every time the app gained a
# directory: server.js now requires ./db/pool, ./routes/travel and
# ./routes/bookings, none of which were being copied, so the container started
# and immediately died on "Cannot find module './db/pool'".
#
# .dockerignore is what keeps this narrow — it excludes node_modules (stale and
# platform-specific in this repo), .env, .git and tests.
COPY . .

# The entrypoint applies the idempotent schema migrations before starting the
# server. Mode is set explicitly: a checkout on Windows or a `git config
# core.fileMode false` clone can land it non-executable, and the container
# would then fail to start with a bare "permission denied".
RUN chmod +x docker-entrypoint.sh

# Drop privileges — the `node` user ships with the base image.
USER node

EXPOSE 5001

# Readiness, not merely liveness.
#
# This used to probe GET /api/contact and treat ANY HTTP response as healthy.
# That route is auth-guarded, so it answers 401 without ever touching
# PostgreSQL: a backend with an unreachable database reported healthy forever,
# and `depends_on: service_healthy` happily started the frontend against it.
#
# GET /api/ready runs a bounded `SELECT 1` (result cached ~5s, so this probe
# cannot generate load) and returns 503 when the database is unreachable. The
# status code is now checked rather than assumed — the old promise-based form
# resolved on a 500 exactly as it did on a 200.
#
# Under plain Compose an unhealthy container is reported and gates dependents;
# it is not force-restarted, so a transient database blip surfaces without
# turning into a restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "server.js"]

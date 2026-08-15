#!/bin/sh
# Bring the schema up to date, then hand off to the app.
#
# Why this exists: the container's CMD used to be `node server.js` alone, and
# server.js only self-heals `contacts` and `admins`. Every other table —
# destinations, packages, bookings, analytics_events — is created by a script
# under scripts/, so a fresh `docker compose up` produced a stack where the
# catalogue was empty, enquiries 500'd on a missing table, and analytics had
# nowhere to write. Running them here makes the image self-sufficient.
#
# All three are idempotent (CREATE / ADD COLUMN ... IF NOT EXISTS inside a
# transaction) and are verified by re-running them in the test suite, so this is
# safe on every boot and every restart. Note for scale-out: two replicas booting
# at the same instant run the same DDL concurrently, which Postgres can answer
# with a duplicate-object error despite IF NOT EXISTS. With one backend replica
# (as in docker-compose.yml) that cannot happen; if you scale up, move this to a
# one-shot init container or a migration job instead of every replica's boot.
#
# NOT run here: `npm run migrate:data`, which imports frontend/src/data/index.js
# to seed the catalogue. That path does not exist in this image (backend build
# context only), and content seeding is a deliberate one-off, not a boot step.
# Seed it from a machine with the full repo checked out:
#   docker compose exec backend node scripts/migrateTravelData.mjs   # (needs the frontend tree)
# or point DATABASE_URL at the stack and run `npm run migrate:data` on the host.
set -e

echo "→ Applying schema migrations…"

# ORDER IS LOAD-BEARING.
#
# initBaseSchema creates `contacts` and `admins`. Both must exist before the
# two migrations that extend them:
#
#   migrateAnalyticsSchema     adds attribution columns to `contacts`
#   migrateAdminSecuritySchema adds lockout/revocation columns to `admins`,
#                              and an audit table whose FK references it
#
# Those two used to run here while the ONLY thing that created the base tables
# was server.js — which starts after this script finishes. On an existing
# database that worked by accident. On a fresh one it was a guaranteed,
# permanent restart loop: `set -e` aborted the entrypoint at the first failing
# migration, the container exited 1, `restart: unless-stopped` started it
# again, and the step that would have created `contacts` was never reached.
#
# Do not reorder these without checking each script's prerequisites.
node scripts/initBaseSchema.mjs
node scripts/migrateTravelSchema.mjs
node scripts/migrateBookingsSchema.mjs
node scripts/migrateAnalyticsSchema.mjs
node scripts/migrateAdminSecuritySchema.mjs
echo "✓ Schema up to date."

# exec so the app becomes PID 1's direct child: tini's SIGTERM reaches node
# rather than this shell, and the container stops without waiting to be killed.
exec "$@"

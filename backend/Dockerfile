# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: install production dependencies only
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy manifests first so this layer caches until dependencies change.
COPY package.json package-lock.json ./

# `npm ci` installs exactly what the lockfile pins and fails loudly if the
# lockfile drifts from package.json. bcrypt v6 ships musl prebuilds, so no
# compiler toolchain is needed on Alpine.
RUN npm ci --omit=dev && npm cache clean --force

# ─────────────────────────────────────────────────────────────
# Stage 2: runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# tini reaps zombies and forwards SIGTERM so the container stops promptly
# instead of being SIGKILLed after the 10s timeout.
RUN apk add --no-cache tini

ENV NODE_ENV=production \
    PORT=5001

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server.js migrate.js create-admin.js ./
COPY middleware ./middleware

# Drop privileges — the `node` user ships with the base image.
USER node

EXPOSE 5001

# This app exposes no dedicated /health route, so we probe a real endpoint.
# GET /api/contact is auth-guarded and answers 401 unauthenticated; any HTTP
# response proves the server is listening and the event loop is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/api/contact').then(()=>process.exit(0)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

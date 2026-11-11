# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: build the static bundle
# ─────────────────────────────────────────────────────────────
# Pinned to the same Node 24 LTS minor as backend/Dockerfile; a floating tag
# would let two builds of one commit use different toolchains.
FROM node:24.19-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# scripts/prerender.mjs (run by `npm run build`) reads the approved catalogue
# from ../backend/db/catalogue/catalogue.v2.json, which is outside this build
# context. It arrives through the named build context `catalogue`, which
# docker-compose.yml supplies (additional_contexts). A bare docker build needs
# it too:
#   docker build --build-context catalogue=backend/db/catalogue frontend
# Without it the build stops here instead of shipping pages without a catalogue.
COPY --from=catalogue catalogue.v2.json /backend/db/catalogue/catalogue.v2.json

# Vite inlines env vars at BUILD time — they cannot be changed later without
# rebuilding. Empty (the default) makes the app call same-origin relative
# paths like /api/contact, which nginx proxies to the backend. That keeps this
# image portable across environments: no CORS, no per-environment rebuild.
# Set an absolute URL (e.g. https://api.example.com) only if you host the
# backend on a different origin.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

# Prerendered pages (scripts/prerender.mjs): the canonical origin for
# canonical links, link previews and sitemap.xml, and SITE_NOINDEX=true for a
# staging image. Both public; both baked in at build time. docs/SEO.md.
ARG VITE_SITE_URL=""
ARG SITE_NOINDEX=""
ENV VITE_SITE_URL=$VITE_SITE_URL SITE_NOINDEX=$SITE_NOINDEX

RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 2: serve with nginx
# ─────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Files in /etc/nginx/templates are rendered with envsubst by the official
# entrypoint at container start, so BACKEND_URL is configurable at RUN time.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV BACKEND_URL=http://backend:5001

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

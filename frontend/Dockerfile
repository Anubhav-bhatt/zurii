# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: build the static bundle
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines env vars at BUILD time — they cannot be changed later without
# rebuilding. Empty (the default) makes the app call same-origin relative
# paths like /api/contact, which nginx proxies to the backend. That keeps this
# image portable across environments: no CORS, no per-environment rebuild.
# Set an absolute URL (e.g. https://api.example.com) only if you host the
# backend on a different origin.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

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

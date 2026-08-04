# syntax=docker/dockerfile:1

# Postgres with TLS enabled.
#
# Why this exists instead of using postgres:16-alpine directly:
# backend/server.js forces SSL for any host that is not localhost/127.0.0.1
# (server.js:40-42), and it does so *after* parsing DATABASE_URL — so an
# `sslmode=disable` in the URL is overwritten and ignored. Inside Compose the
# host is `db`, so the driver always demands TLS. The stock Postgres image
# serves plaintext only and the connection fails with
# "The server does not support SSL connections".
#
# A self-signed cert satisfies it because the app connects with
# { rejectUnauthorized: false }. This also matches how the app talks to
# managed Postgres (Aiven/Neon/Supabase), so local mirrors production.

FROM postgres:16-alpine

RUN apk add --no-cache openssl \
 && mkdir -p /etc/postgresql/certs \
 && openssl req -new -x509 -nodes -days 3650 \
      -subj "/CN=db" \
      -keyout /etc/postgresql/certs/server.key \
      -out   /etc/postgresql/certs/server.crt \
 && chmod 600 /etc/postgresql/certs/server.key \
 && chown -R postgres:postgres /etc/postgresql/certs \
 && apk del openssl

CMD ["postgres", \
     "-c", "ssl=on", \
     "-c", "ssl_cert_file=/etc/postgresql/certs/server.crt", \
     "-c", "ssl_key_file=/etc/postgresql/certs/server.key"]

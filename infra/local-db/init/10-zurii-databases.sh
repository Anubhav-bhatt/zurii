#!/bin/sh
# Runs ONCE, when the official postgres image initialises an empty volume.
#
# Creates the two isolated Zurii databases, one least-privilege owner role for
# each, and the per-database marker (zurii.environment) that the safety guards
# in backend/db/safety.js verify before anything writes.
#
# Passwords arrive as environment variables and are handed to psql as psql
# variables (:'name'), which quotes them as SQL literals — they are never
# interpolated into SQL text by the shell and never echoed.
set -eu

: "${ZURII_DEV_DB_PASSWORD:?ZURII_DEV_DB_PASSWORD is required}"
: "${ZURII_TEST_DB_PASSWORD:?ZURII_TEST_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=dev_password="$ZURII_DEV_DB_PASSWORD" \
  --set=test_password="$ZURII_TEST_DB_PASSWORD" <<'SQL'
CREATE ROLE zurii_dev_app  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'dev_password';
CREATE ROLE zurii_test_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'test_password';

CREATE DATABASE zurii_dev  OWNER zurii_dev_app  ENCODING 'UTF8' TEMPLATE template0;
CREATE DATABASE zurii_test OWNER zurii_test_app ENCODING 'UTF8' TEMPLATE template0;

-- Only each database's owner (and the local superuser) may connect to it.
REVOKE ALL ON DATABASE zurii_dev  FROM PUBLIC;
REVOKE ALL ON DATABASE zurii_test FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;

-- Environment markers. A production database never carries these values, so a
-- guard that requires them cannot be satisfied by a production connection.
ALTER DATABASE zurii_dev  SET zurii.environment = 'development';
ALTER DATABASE zurii_test SET zurii.environment = 'test';
SQL

echo "zurii local databases initialised: zurii_dev, zurii_test"

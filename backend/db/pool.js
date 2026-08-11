/**
 * Shared PostgreSQL pool.
 *
 * The connection/TLS logic used to be duplicated in server.js and
 * create-admin.js. Migration scripts need it too, so it lives here once.
 *
 * .env is resolved relative to this file rather than the working directory,
 * so `node scripts/migrateTravelData.mjs` works from any cwd.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');
const { parse } = require('pg-connection-string');

/**
 * Parse DATABASE_URL into a pg config, forcing TLS for every host except
 * localhost. Managed providers (Aiven/Neon/Supabase) require it, and the
 * bundled Compose database serves TLS for the same reason — see db/Dockerfile.
 */
function buildConfig(url = process.env.DATABASE_URL) {
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create backend/.env with your PostgreSQL connection string.'
    );
  }
  const config = parse(url);
  if (config.host !== 'localhost' && config.host !== '127.0.0.1') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

let pool = null;

/** Lazily created singleton pool, so importing this module never connects. */
function getPool() {
  if (!pool) pool = new Pool(buildConfig());
  return pool;
}

module.exports = { buildConfig, getPool };

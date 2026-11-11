/**
 * Duplicate-submission protection for the public lead forms (Phase 4).
 *
 * The browser sends an `Idempotency-Key` header — a random id for ONE
 * submission attempt, reused for every retry of it (double click, network
 * retry, the visitor pressing Send again after an uncertain response) and
 * replaced for the next enquiry. The key is claimed in the same transaction
 * that inserts the lead:
 *
 *   first request      claims the key, inserts the lead, commits → 201
 *   any later request  waits for the first to finish (the primary key
 *                      serialises them), finds the lead it created, and gets
 *                      the same 201 back with `Idempotent-Replayed: true`
 *   first one failed   its transaction rolled back, so the key is free and
 *                      the retry creates the lead
 *   same key, different form contents → 422, nothing stored
 *
 * Keys expire after 24 hours. Only the key, a SHA-256 of the submission and the
 * lead id are stored — no personal data is copied. Without the header the
 * endpoints behave exactly as before, so older clients keep working.
 */
const crypto = require('crypto');
const { log, errorFields } = require('./logger');

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const TTL_HOURS = 24;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const FK = { contact: 'contact_id', booking: 'booking_id' };

class IdempotencyError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'IdempotencyError';
    this.status = status;
    this.code = code;
  }
}

/** The header value, null when absent; throws on a malformed one. */
function readIdempotencyKey(req) {
  const raw = req.get('Idempotency-Key');
  if (raw === undefined || raw === '') return null;
  if (!KEY_PATTERN.test(raw)) {
    throw new IdempotencyError(400, 'INVALID_IDEMPOTENCY_KEY', 'Invalid Idempotency-Key header.');
  }
  return raw;
}

/** Stable hash of the validated submission (key order does not matter). */
function hashSubmission(value) {
  const canonical = JSON.stringify(Object.keys(value).sort().map((k) => [k, value[k] ?? null]));
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

let lastSweep = 0;
function sweepExpired(pool) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  pool.query('DELETE FROM lead_idempotency_keys WHERE expires_at < NOW()').catch((err) => {
    log.error('idempotency_sweep_failed', errorFields(err));
  });
}

/**
 * Create a lead at most once per key.
 *
 * @param {import('pg').Pool} pool
 * @param {object} opts
 * @param {'contact'|'booking'} opts.endpoint
 * @param {string|null} opts.key            from readIdempotencyKey
 * @param {string} opts.requestHash         from hashSubmission
 * @param {(db) => Promise<{ id: number }>} opts.insert   inserts the lead with `db`
 * @param {(db, id: number) => Promise<object>} opts.load  the row a replay answers with
 * @returns {Promise<{ row: object, replayed: boolean }>}
 */
async function createOnce(pool, { endpoint, key, requestHash, insert, load }) {
  if (!key) return { row: await insert(pool), replayed: false };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // An expired key is forgotten rather than replayed.
    await client.query(
      'DELETE FROM lead_idempotency_keys WHERE endpoint = $1 AND idempotency_key = $2 AND expires_at <= NOW()',
      [endpoint, key]
    );
    const claim = await client.query(
      `INSERT INTO lead_idempotency_keys (endpoint, idempotency_key, request_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(hours => $4))
       ON CONFLICT (endpoint, idempotency_key) DO NOTHING`,
      [endpoint, key, requestHash, TTL_HOURS]
    );

    if (claim.rowCount === 0) {
      // Someone holds this key. ON CONFLICT waited for their transaction, so
      // what we read now is final.
      const { rows } = await client.query(
        `SELECT request_hash, ${FK[endpoint]} AS lead_id FROM lead_idempotency_keys
          WHERE endpoint = $1 AND idempotency_key = $2`,
        [endpoint, key]
      );
      await client.query('COMMIT');
      const held = rows[0];
      if (!held || held.lead_id === null) {
        throw new IdempotencyError(409, 'IDEMPOTENCY_IN_PROGRESS', 'This submission is still being processed. Please try again.');
      }
      if (held.request_hash !== requestHash) {
        throw new IdempotencyError(422, 'IDEMPOTENCY_KEY_REUSED', 'This submission key was already used for a different enquiry.');
      }
      return { row: await load(pool, held.lead_id), replayed: true };
    }

    const row = await insert(client);
    await client.query(
      `UPDATE lead_idempotency_keys SET ${FK[endpoint]} = $3 WHERE endpoint = $1 AND idempotency_key = $2`,
      [endpoint, key, row.id]
    );
    await client.query('COMMIT');
    sweepExpired(pool);
    return { row, replayed: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { readIdempotencyKey, hashSubmission, createOnce, IdempotencyError, TTL_HOURS };

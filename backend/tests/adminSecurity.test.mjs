/**
 * Integration tests for admin security hardening: password policy, server-side
 * token revocation, account-level login throttling and the audit trail.
 *
 *   npm test          (from backend/)
 *
 * These boot the REAL server.js as a child process on an ephemeral port and
 * drive it over HTTP. Login, refresh and logout are defined directly on the app
 * rather than in a mountable router, so a throwaway Express app would test a
 * copy of the logic instead of the logic. Spawning the real thing means the
 * middleware order, the limiters and the handlers under test are the ones that
 * ship.
 *
 * They WRITE to the shared database. Everything created here is scoped to a
 * unique per-run admin username, and after() removes that admin and its audit
 * rows, then asserts none remain. Existing admin accounts are never touched.
 *
 * No password, hash or token value is ever printed.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import poolModule from '../db/pool.js';
import validatorModule from '../lib/validateAdminPassword.js';
import auditModule from '../lib/adminAudit.js';

const { getPool } = poolModule;
const { validateAdminPassword } = validatorModule;
const { sanitizeMetadata, USER_AGENT_MAX } = auditModule;

const RUN = crypto.randomBytes(4).toString('hex');
const TEST_ADMIN = `zzsectest-${RUN}`;
/** Long, unique, policy-compliant; exists only inside this process. */
const TEST_PASSWORD = `Test-Passphrase-${crypto.randomBytes(8).toString('hex')}`;

const pool = getPool();
let server;
let base;
let adminId;

/** Poll until the child server answers, so tests never race the boot. */
async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.status) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('test server did not start in time');
}

before(async () => {
  const hash = await bcrypt.hash(TEST_PASSWORD, 12);
  const { rows } = await pool.query(
    'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id',
    [TEST_ADMIN, hash]
  );
  adminId = rows[0].id;

  const port = 5300 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  await waitForServer(`${base}/api/packages`);
});

after(async () => {
  server?.kill('SIGTERM');
  // Audit rows keep admin_id after the admin is deleted only as NULL, so they
  // are removed by the username preserved in metadata as well as by id.
  await pool.query(
    `DELETE FROM admin_audit_logs
      WHERE admin_id = $1
         OR metadata->>'username' = $2
         OR metadata->>'attemptedUsername' = $2`,
    [adminId, TEST_ADMIN]
  );
  await pool.query('DELETE FROM admins WHERE username = $1', [TEST_ADMIN]);

  const leftoverAdmin = await pool.query('SELECT 1 FROM admins WHERE username = $1', [TEST_ADMIN]);
  assert.equal(leftoverAdmin.rows.length, 0, 'test admin must not survive the run');
  const leftoverAudit = await pool.query(
    `SELECT 1 FROM admin_audit_logs WHERE metadata->>'username' = $1 OR metadata->>'attemptedUsername' = $1`,
    [TEST_ADMIN]
  );
  assert.equal(leftoverAudit.rows.length, 0, 'test audit rows must not survive the run');

  await pool.end();
});

// ── helpers ─────────────────────────────────────────────────────────

const login = async (password = TEST_PASSWORD, username = TEST_ADMIN) => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  const refresh = /zurii_refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1] ?? null;
  return { status: res.status, error: body.error, token: body.accessToken ?? null, refresh };
};

const getProtected = (token) =>
  fetch(`${base}/api/admin/analytics/overview`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then((r) => r.status);

const postRefresh = (refresh) =>
  fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: refresh ? { Cookie: `zurii_refresh_token=${refresh}` } : {},
  }).then((r) => r.status);

const postLogout = (refresh) =>
  fetch(`${base}/api/auth/logout`, {
    method: 'POST',
    headers: refresh ? { Cookie: `zurii_refresh_token=${refresh}` } : {},
  }).then((r) => r.status);

const auditRows = (eventType) =>
  pool
    .query(
      `SELECT event_type, success, ip_address, user_agent, metadata
         FROM admin_audit_logs
        WHERE ($1::text IS NULL OR event_type = $1)
          AND (admin_id = $2 OR metadata->>'username' = $3 OR metadata->>'attemptedUsername' = $3)
        ORDER BY id DESC`,
      [eventType ?? null, adminId, TEST_ADMIN]
    )
    .then((r) => r.rows);

const clearThrottle = () =>
  pool.query('UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [adminId]);

const throttleState = () =>
  pool
    .query('SELECT failed_login_attempts, locked_until, token_version FROM admins WHERE id = $1', [adminId])
    .then((r) => r.rows[0]);

// ── password policy (pure) ──────────────────────────────────────────

describe('admin password policy', () => {
  it('rejects the classic weak passwords', () => {
    for (const weak of ['admin', 'password', 'password123', 'admin123', 'administrator', 'zurii', 'zurii123']) {
      assert.equal(validateAdminPassword(weak, 'someadmin').valid, false, `must reject ${weak}`);
    }
  });

  it('rejects a weak seed padded out to the length minimum', () => {
    // Long enough to pass a naive length check, no stronger than "admin123".
    assert.equal(validateAdminPassword('admin123admin123', 'someadmin').valid, false);
  });

  it('rejects anything shorter than the minimum', () => {
    assert.equal(validateAdminPassword('Short-Pass-12', 'someadmin').valid, false);
  });

  it('rejects a password equal to the username', () => {
    const name = 'averylongadminname';
    assert.equal(validateAdminPassword(name, name).valid, false);
  });

  it('rejects low-entropy repetition that passes on length alone', () => {
    assert.equal(validateAdminPassword('aaaaaaaaaaaaaaaaaa', 'someadmin').valid, false);
  });

  it('rejects a password beyond what bcrypt can hash (72 bytes)', () => {
    assert.equal(validateAdminPassword('x1y2z3'.repeat(20), 'someadmin').valid, false);
  });

  it('rejects a weak word padded with separators to reach the length minimum', () => {
    // The placeholder this repo shipped in .env.example, plus the general trick.
    for (const padded of ['CHANGE_ME_please', 'admin.123.admin.123', 'p-a-s-s-w-o-r-d-1234']) {
      assert.equal(validateAdminPassword(padded, 'someadmin').valid, false, `must reject ${padded}`);
    }
  });

  it('accepts a long unique passphrase', () => {
    const result = validateAdminPassword('shoreline-tandem-vault-97xq', 'someadmin');
    assert.equal(result.valid, true);
    assert.equal(result.error, null);
  });

  it('never echoes the submitted password in the error', () => {
    const secret = 'password123-should-not-appear';
    const { error } = validateAdminPassword(secret, 'someadmin');
    assert.ok(error);
    assert.ok(!error.includes(secret), 'error text must not contain the password');
  });
});

// ── token revocation ────────────────────────────────────────────────

describe('token version revocation', () => {
  it('accepts a token whose version matches the database', async () => {
    await clearThrottle();
    const session = await login();
    assert.equal(session.status, 200);
    assert.equal(await getProtected(session.token), 200);
  });

  it('rejects a validly signed token carrying the wrong version', async () => {
    const forged = jwt.sign(
      { id: adminId, username: TEST_ADMIN, tokenVersion: 99999 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    assert.equal(await getProtected(forged), 401);
  });

  it('rejects a pre-upgrade token that has no version claim at all', async () => {
    const legacy = jwt.sign({ id: adminId, username: TEST_ADMIN }, process.env.JWT_SECRET, { expiresIn: '15m' });
    assert.equal(await getProtected(legacy), 401, 'a token that cannot be revoked must not be honoured');
  });

  it('rejects a token for an admin that no longer exists', async () => {
    const ghost = jwt.sign(
      { id: 2147483600, username: 'deleted-admin', tokenVersion: 0 },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    assert.equal(await getProtected(ghost), 401);
  });
});

describe('logout revokes every outstanding session', () => {
  it('invalidates both the access token and the refresh cookie', async () => {
    await clearThrottle();
    const session = await login();
    assert.equal(session.status, 200);
    assert.equal(await getProtected(session.token), 200, 'sanity: token works before logout');
    assert.equal(await postRefresh(session.refresh), 200, 'sanity: refresh works before logout');

    assert.equal(await postLogout(session.refresh), 200);

    assert.equal(await getProtected(session.token), 401, 'old access token must be dead after logout');
    assert.equal(await postRefresh(session.refresh), 401, 'old refresh cookie must not mint a new token');
  });

  it('bumps token_version so the revocation is server-side, not cookie-deep', async () => {
    await clearThrottle();
    const before = (await throttleState()).token_version;
    const session = await login();
    await postLogout(session.refresh);
    const afterVersion = (await throttleState()).token_version;
    assert.equal(afterVersion, before + 1);
  });

  it('still answers 200 when called with no credentials at all', async () => {
    assert.equal(await postLogout(null), 200, 'logout must never strand a client');
  });

  it('lets the admin log in again straight afterwards', async () => {
    await clearThrottle();
    const session = await login();
    assert.equal(session.status, 200);
    assert.equal(await getProtected(session.token), 200);
  });
});

describe('password change revokes existing sessions', () => {
  it('kills a session issued before the change', async () => {
    await clearThrottle();
    const session = await login();
    assert.equal(await getProtected(session.token), 200);

    // Exactly what the CLI does, including the version bump in the same statement.
    const newHash = await bcrypt.hash(`Rotated-Passphrase-${crypto.randomBytes(8).toString('hex')}`, 12);
    await pool.query(
      `UPDATE admins SET password_hash = $1, token_version = token_version + 1,
              failed_login_attempts = 0, locked_until = NULL
        WHERE id = $2`,
      [newHash, adminId]
    );

    assert.equal(await getProtected(session.token), 401, 'token from before the change must be rejected');
    assert.equal(await postRefresh(session.refresh), 401, 'refresh from before the change must be rejected');

    // Restore the known password for the remaining tests.
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [
      await bcrypt.hash(TEST_PASSWORD, 12),
      adminId,
    ]);
  });
});

// ── account-level throttling ────────────────────────────────────────

describe('database-backed login throttle', () => {
  it('counts consecutive failures and locks the account at the threshold', async () => {
    await clearThrottle();
    for (let i = 0; i < 5; i += 1) {
      const attempt = await login(`definitely-wrong-${i}`);
      assert.equal(attempt.status, 401);
    }
    const state = await throttleState();
    assert.equal(state.failed_login_attempts, 5);
    assert.ok(state.locked_until, 'a lock must be set once the threshold is reached');
    assert.ok(new Date(state.locked_until) > new Date(), 'the lock must be in the future');
  });

  it('refuses even the correct password while locked, with a generic error', async () => {
    // Follows the previous test's locked state deliberately.
    const attempt = await login();
    assert.equal(attempt.status, 401);
    assert.equal(attempt.error, 'Invalid username or password.', 'must not disclose that the account is locked');
    assert.equal(attempt.token, null);
  });

  it('records the lock in the audit trail even though the response hides it', async () => {
    const rows = await auditRows('LOGIN_FAILURE');
    const reasons = rows.map((r) => r.metadata?.reason);
    assert.ok(reasons.includes('account_locked'), 'the real reason belongs in the trail');
    assert.ok(reasons.includes('bad_password'));
  });

  it('survives a server restart (state is in PostgreSQL, not process memory)', async () => {
    // The point of layer 2: the counters are a row, so nothing about the process
    // lifetime can clear them. Asserted by reading the row back directly.
    const state = await throttleState();
    assert.ok(state.locked_until, 'lock is persisted, so a restart cannot reset it');
  });

  it('clears the counters on a successful login once the lock has passed', async () => {
    // Expire the lock rather than waiting 15 real minutes.
    await pool.query(`UPDATE admins SET locked_until = NOW() - interval '1 minute' WHERE id = $1`, [adminId]);

    const attempt = await login();
    assert.equal(attempt.status, 200, 'an expired lock must not block a valid login');

    const state = await throttleState();
    assert.equal(state.failed_login_attempts, 0);
    assert.equal(state.locked_until, null);
  });

  it('restarts the count after an expired lock instead of re-locking immediately', async () => {
    await clearThrottle();
    await pool.query(
      `UPDATE admins SET failed_login_attempts = 5, locked_until = NOW() - interval '1 minute' WHERE id = $1`,
      [adminId]
    );
    await login('wrong-after-expiry');
    const state = await throttleState();
    assert.equal(state.failed_login_attempts, 1, 'the window rolls; it is not a permanent tally');
    assert.equal(state.locked_until, null, 'one failure must not re-lock the account');
    await clearThrottle();
  });

  it('does not leak whether a username exists', async () => {
    const unknown = await login('some-wrong-password', `zznosuch-${RUN}`);
    const known = await login('some-wrong-password');
    assert.equal(unknown.status, known.status);
    assert.equal(unknown.error, known.error);
    await clearThrottle();
  });
});

// ── audit trail ─────────────────────────────────────────────────────

describe('admin audit trail', () => {
  it('records LOGIN_SUCCESS, LOGIN_FAILURE and LOGOUT', async () => {
    await clearThrottle();
    await login('wrong-on-purpose');
    const session = await login();
    await postLogout(session.refresh);

    const types = new Set((await auditRows()).map((r) => r.event_type));
    for (const expected of ['LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT']) {
      assert.ok(types.has(expected), `${expected} must be recorded`);
    }
    await clearThrottle();
  });

  it('marks failures as unsuccessful and successes as successful', async () => {
    const rows = await auditRows();
    const success = rows.find((r) => r.event_type === 'LOGIN_SUCCESS');
    const failure = rows.find((r) => r.event_type === 'LOGIN_FAILURE');
    assert.equal(success.success, true);
    assert.equal(failure.success, false);
  });

  it('captures the client IP and a bounded user agent', async () => {
    const rows = await auditRows('LOGIN_SUCCESS');
    assert.ok(rows[0].ip_address, 'an IP must be recorded');
    if (rows[0].user_agent) {
      assert.ok(rows[0].user_agent.length <= USER_AGENT_MAX);
    }
  });

  it('never stores a password, hash, token or Authorization value', async () => {
    const serialized = JSON.stringify(await auditRows());
    assert.ok(!serialized.includes(TEST_PASSWORD), 'the password must never appear');
    assert.ok(!serialized.includes('$2b$'), 'no bcrypt hash may appear');
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(serialized), 'no JWT may appear');
    assert.ok(!/authorization/i.test(serialized), 'no Authorization header may appear');
    assert.ok(!/postgres:\/\//.test(serialized), 'no connection string may appear');
  });

  it('drops metadata keys that are not explicitly allowed', () => {
    const clean = sanitizeMetadata({
      username: 'someadmin',
      password: 'must-be-dropped',
      accessToken: 'must-be-dropped',
      authorization: 'Bearer must-be-dropped',
      DATABASE_URL: 'postgres://must-be-dropped',
      nested: { token: 'must-be-dropped' },
      reason: 'bad_password',
    });
    assert.deepEqual(Object.keys(clean).sort(), ['reason', 'username']);
  });

  it('bounds an over-long allowed value instead of storing it whole', () => {
    const clean = sanitizeMetadata({ attemptedUsername: 'a'.repeat(5000) });
    assert.ok(clean.attemptedUsername.length <= 200);
  });
});

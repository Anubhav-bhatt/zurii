/**
 * Integration tests for the production admin lifecycle:
 * temporary password → forced replacement → normal access, plus operator reset.
 *
 *   npm test          (from backend/)
 *
 * Boots the real server.js as a child process, because login, refresh, logout,
 * the session endpoint and change-password are all defined on the app rather
 * than in a mountable router — a throwaway app would test a copy of the logic.
 *
 * WRITES to the shared database. Every account created here carries a unique
 * per-run prefix and after() removes them plus their audit rows, asserting none
 * remain. Existing admin accounts are never touched, and no password or token
 * value is ever printed.
 */
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcrypt';

import poolModule from '../db/pool.js';

const { getPool } = poolModule;

const RUN = crypto.randomBytes(4).toString('hex');
const ALICE = `zzfl-alice-${RUN}`;
const BOB = `zzfl-bob-${RUN}`;
/** Policy-compliant, unique per run, in-process only. */
const TEMP_PASSWORD = `temporary-vault-${crypto.randomBytes(6).toString('hex')}`;
const PRIVATE_PASSWORD = `private-vault-${crypto.randomBytes(6).toString('hex')}`;
const BOB_PASSWORD = `bob-private-vault-${crypto.randomBytes(6).toString('hex')}`;

const pool = getPool();
let server;
let base;
let aliceId;
let bobId;

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

/** Insert an admin the way `create-admin.js add` does: temporary password. */
async function createAdmin(username, password, mustChange) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO admins (username, password_hash, must_change_password)
     VALUES ($1, $2, $3) RETURNING id`,
    [username, hash, mustChange]
  );
  return rows[0].id;
}

before(async () => {
  aliceId = await createAdmin(ALICE, TEMP_PASSWORD, true);
  bobId = await createAdmin(BOB, BOB_PASSWORD, false);

  const port = 5700 + Math.floor(Math.random() * 250);
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
  await pool.query(
    `DELETE FROM admin_audit_logs
      WHERE admin_id = ANY($1::int[])
         OR metadata->>'username' = ANY($2::text[])
         OR metadata->>'attemptedUsername' = ANY($2::text[])`,
    [[aliceId, bobId], [ALICE, BOB]]
  );
  await pool.query('DELETE FROM admins WHERE username = ANY($1::text[])', [[ALICE, BOB]]);

  const leftover = await pool.query('SELECT COUNT(*)::int AS n FROM admins WHERE username = ANY($1::text[])', [
    [ALICE, BOB],
  ]);
  assert.equal(leftover.rows[0].n, 0, 'test admins must not survive the run');
  await pool.end();
});

// ── helpers ─────────────────────────────────────────────────────────

const login = async (username, password) => {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    token: body.accessToken ?? null,
    mustChange: body.admin?.mustChangePassword,
    refresh: /zurii_refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1] ?? null,
  };
};

const call = async (path, token, options = {}) => {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, code: body.code, data: body.data, error: body.error };
};

const changePassword = (token, currentPassword, newPassword) =>
  call('/api/admin/change-password', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

const adminRow = (id) =>
  pool
    .query('SELECT must_change_password, token_version, password_changed_at FROM admins WHERE id = $1', [id])
    .then((r) => r.rows[0]);

const auditTypes = (id) =>
  pool
    .query('SELECT event_type FROM admin_audit_logs WHERE admin_id = $1 ORDER BY id', [id])
    .then((r) => r.rows.map((row) => row.event_type));

// ── the flow ────────────────────────────────────────────────────────

describe('temporary password authenticates but unlocks nothing', () => {
  it('logs in and reports that a password change is required', async () => {
    const session = await login(ALICE, TEMP_PASSWORD);
    assert.equal(session.status, 200);
    assert.equal(session.mustChange, true);
    assert.ok(session.token);
  });

  it('can read its own session state', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    const session = await call('/api/admin/session', token);
    assert.equal(session.status, 200);
    assert.equal(session.data.mustChangePassword, true);
    assert.equal(session.data.username, ALICE);
  });

  it('is refused by every business route, with no data in the body', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    const routes = [
      '/api/admin/analytics/overview',
      '/api/admin/analytics/searches',
      '/api/admin/analytics/destinations',
      '/api/admin/analytics/packages',
      '/api/admin/analytics/funnel',
      '/api/admin/bookings',
      '/api/admin/bookings/1',
      '/api/admin/bookings/1/journey',
      '/api/admin/security/audit',
      '/api/contact',
    ];
    for (const route of routes) {
      const res = await call(route, token);
      assert.equal(res.status, 403, `${route} must be refused`);
      assert.equal(res.code, 'PASSWORD_CHANGE_REQUIRED', `${route} must say why`);
      assert.equal(res.data, undefined, `${route} must not leak data`);
    }
  });

  it('is refused for mutations too, not only reads', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    for (const [method, route] of [
      ['PATCH', '/api/contact/1/complete'],
      ['PATCH', '/api/contact/1/reopen'],
      ['DELETE', '/api/contact/999999'],
    ]) {
      const res = await call(route, token, { method });
      assert.equal(res.status, 403, `${method} ${route} must be refused`);
      assert.equal(res.code, 'PASSWORD_CHANGE_REQUIRED');
    }
  });
});

describe('change-password validation', () => {
  it('requires a token', async () => {
    const res = await changePassword(null, TEMP_PASSWORD, PRIVATE_PASSWORD);
    assert.equal(res.status, 401);
  });

  it('requires both fields', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    assert.equal((await changePassword(token, '', PRIVATE_PASSWORD)).status, 400);
    assert.equal((await changePassword(token, TEMP_PASSWORD, '')).status, 400);
  });

  it('rejects a wrong current password without locking the account', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    const res = await changePassword(token, 'not-the-current-password', PRIVATE_PASSWORD);
    assert.equal(res.status, 400);

    // A mistyped field must not cost the admin a 15-minute lockout.
    const row = await pool.query('SELECT locked_until FROM admins WHERE id = $1', [aliceId]);
    assert.equal(row.rows[0].locked_until, null);
  });

  it('applies the shared password policy to the new password', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    for (const weak of ['short', 'admin123admin123', 'password123password']) {
      assert.equal((await changePassword(token, TEMP_PASSWORD, weak)).status, 400, `must reject ${weak}`);
    }
  });

  it('rejects reusing the current password', async () => {
    const { token } = await login(ALICE, TEMP_PASSWORD);
    const res = await changePassword(token, TEMP_PASSWORD, TEMP_PASSWORD);
    assert.equal(res.status, 400);
  });

  it('leaves the account still requiring a change after every rejection', async () => {
    assert.equal((await adminRow(aliceId)).must_change_password, true);
  });
});

describe('replacing the temporary password', () => {
  let sessionToken;
  let sessionRefresh;

  it('succeeds and clears the first-login flag', async () => {
    const session = await login(ALICE, TEMP_PASSWORD);
    sessionToken = session.token;
    sessionRefresh = session.refresh;

    const before = await adminRow(aliceId);
    const res = await changePassword(sessionToken, TEMP_PASSWORD, PRIVATE_PASSWORD);
    assert.equal(res.status, 200);

    const row = await adminRow(aliceId);
    assert.equal(row.must_change_password, false);
    assert.equal(row.token_version, before.token_version + 1, 'the version must bump to revoke sessions');
    assert.ok(row.password_changed_at, 'password_changed_at must be stamped');
  });

  it('revokes the access token that made the change', async () => {
    const res = await call('/api/admin/session', sessionToken);
    assert.equal(res.status, 401);
  });

  it('revokes the refresh cookie from that session', async () => {
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${sessionRefresh}` },
    });
    assert.equal(res.status, 401);
  });

  it('makes the temporary password stop working entirely', async () => {
    const res = await login(ALICE, TEMP_PASSWORD);
    assert.equal(res.status, 401, 'the operator-known password must be dead');
  });

  it('grants normal access with the new private password', async () => {
    const session = await login(ALICE, PRIVATE_PASSWORD);
    assert.equal(session.status, 200);
    assert.equal(session.mustChange, false);
    assert.equal((await call('/api/admin/analytics/overview', session.token)).status, 200);
    assert.equal((await call('/api/contact', session.token)).status, 200);
    assert.equal((await call('/api/admin/security/audit', session.token)).status, 200);
  });

  it('records PASSWORD_CHANGED in the audit trail', async () => {
    assert.ok((await auditTypes(aliceId)).includes('PASSWORD_CHANGED'));
  });

  it('never stores the password or a token in the audit trail', async () => {
    const rows = await pool.query('SELECT metadata FROM admin_audit_logs WHERE admin_id = $1', [aliceId]);
    const serialized = JSON.stringify(rows.rows);
    assert.ok(!serialized.includes(TEMP_PASSWORD));
    assert.ok(!serialized.includes(PRIVATE_PASSWORD));
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}/.test(serialized));
    assert.ok(!serialized.includes('$2b$'));
  });
});

describe('accounts are independent', () => {
  it('will not accept one admin password on another admin username', async () => {
    assert.equal((await login(BOB, PRIVATE_PASSWORD)).status, 401);
    assert.equal((await login(ALICE, BOB_PASSWORD)).status, 401);
  });

  it('accepts each admin with their own password', async () => {
    assert.equal((await login(ALICE, PRIVATE_PASSWORD)).status, 200);
    assert.equal((await login(BOB, BOB_PASSWORD)).status, 200);
    await pool.query('UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = ANY($1::int[])', [
      [aliceId, bobId],
    ]);
  });

  it('does not force a password change on an account that does not owe one', async () => {
    const session = await login(BOB, BOB_PASSWORD);
    assert.equal(session.mustChange, false);
    assert.equal((await call('/api/admin/analytics/overview', session.token)).status, 200);
  });
});

describe('operator password reset', () => {
  it('re-arms the first-login requirement and revokes live sessions', async () => {
    const live = await login(ALICE, PRIVATE_PASSWORD);
    assert.equal(live.status, 200);
    assert.equal((await call('/api/contact', live.token)).status, 200);

    // Exactly what `create-admin.js reset-password` performs.
    const reissued = `reissued-vault-${crypto.randomBytes(6).toString('hex')}`;
    await pool.query(
      `UPDATE admins
          SET password_hash = $1, must_change_password = TRUE, password_changed_at = NOW(),
              token_version = token_version + 1, failed_login_attempts = 0, locked_until = NULL
        WHERE id = $2`,
      [await bcrypt.hash(reissued, 12), aliceId]
    );

    assert.equal((await call('/api/contact', live.token)).status, 401, 'the live session must be revoked');
    assert.equal((await login(ALICE, PRIVATE_PASSWORD)).status, 401, 'the old private password must be dead');

    const fresh = await login(ALICE, reissued);
    assert.equal(fresh.status, 200);
    assert.equal(fresh.mustChange, true, 'the reset must force another replacement');
    assert.equal((await call('/api/contact', fresh.token)).status, 403);
  });
});

describe('unauthenticated access is unaffected by any of this', () => {
  it('refuses the lifecycle endpoints without a token', async () => {
    assert.equal((await call('/api/admin/session', null)).status, 401);
    assert.equal((await changePassword(null, 'x', 'y')).status, 401);
  });

  it('leaves the guest catalogue open', async () => {
    for (const route of ['/api/packages', '/api/destinations']) {
      const res = await fetch(`${base}${route}`);
      assert.equal(res.status, 200, `${route} must stay public`);
    }
  });
});

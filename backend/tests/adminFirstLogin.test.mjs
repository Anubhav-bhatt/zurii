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
import baseSchemaModule from '../db/baseSchema.js';
import validatorModule from '../lib/validateAdminPassword.js';

const { getPool } = poolModule;
const { ensureBaseSchema } = baseSchemaModule;
const { validateAdminPassword, validateBootstrapPassword, MIN_LENGTH } = validatorModule;

const RUN = crypto.randomBytes(4).toString('hex');
const ALICE = `zzfl-alice-${RUN}`;
const BOB = `zzfl-bob-${RUN}`;
/** Provisioned the way `create-admin.js add-temporary` does: short bootstrap password. */
const CARA = `zzfl-cara-${RUN}`;
/** Used only for the deactivation tests. */
const DAN = `zzfl-dan-${RUN}`;
/** Policy-compliant, unique per run, in-process only. */
const TEMP_PASSWORD = `temporary-vault-${crypto.randomBytes(6).toString('hex')}`;
const PRIVATE_PASSWORD = `private-vault-${crypto.randomBytes(6).toString('hex')}`;
const BOB_PASSWORD = `bob-private-vault-${crypto.randomBytes(6).toString('hex')}`;
/**
 * Deliberately too short for the permanent policy and long enough for the
 * bootstrap one — the exact shape of the credential an operator reads to a new
 * admin over the phone. The assertions in `before` pin that, so this stops being
 * a magic string if either minimum moves.
 */
const CARA_TEMP = `Harbour@${crypto.randomBytes(2).toString('hex')}`;
const CARA_PRIVATE = `cara-private-vault-${crypto.randomBytes(6).toString('hex')}`;
const DAN_PASSWORD = `dan-private-vault-${crypto.randomBytes(6).toString('hex')}`;

/** Names of throwaway contact leads this run submitted, for cleanup in after(). */
const submittedContacts = [];

const pool = getPool();
let server;
let base;
let aliceId;
let bobId;
let caraId;
let danId;

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
async function createAdmin(username, password, mustChange, active = true) {
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO admins (username, password_hash, must_change_password, active)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [username, hash, mustChange, active]
  );
  return rows[0].id;
}

before(async () => {
  // These fixtures are inserted BEFORE server.js boots, so its own call to
  // ensureBaseSchema has not run yet. Without this the INSERTs below would hit
  // a database missing the newest admins columns and fail with 42703 — the
  // tests would report a schema problem as an authentication bug. Idempotent
  // and non-destructive, so calling it here costs nothing.
  await ensureBaseSchema(pool, () => {});

  // The premise of the bootstrap fixture, asserted rather than assumed.
  assert.equal(validateAdminPassword(CARA_TEMP, CARA).valid, false, 'the temp password must fail the permanent policy');
  assert.equal(validateBootstrapPassword(CARA_TEMP, CARA).valid, true, 'and pass the bootstrap one');

  aliceId = await createAdmin(ALICE, TEMP_PASSWORD, true);
  bobId = await createAdmin(BOB, BOB_PASSWORD, false);
  caraId = await createAdmin(CARA, CARA_TEMP, true);
  danId = await createAdmin(DAN, DAN_PASSWORD, false);

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

  // Throwaway leads created by the submission tests below. Removed here as well
  // as inline, so a failed assertion mid-test cannot leave a row behind in a
  // database that also holds real customer enquiries. Scoped to this run's
  // prefix — it can never match a genuine lead.
  await pool.query('DELETE FROM contacts WHERE name = ANY($1::text[])', [submittedContacts]);
  const strayLeads = await pool.query('SELECT COUNT(*)::int AS n FROM contacts WHERE name = ANY($1::text[])', [
    submittedContacts,
  ]);
  assert.equal(strayLeads.rows[0].n, 0, 'test leads must not survive the run');

  const ids = [aliceId, bobId, caraId, danId];
  const names = [ALICE, BOB, CARA, DAN];
  await pool.query(
    `DELETE FROM admin_audit_logs
      WHERE admin_id = ANY($1::int[])
         OR metadata->>'username' = ANY($2::text[])
         OR metadata->>'attemptedUsername' = ANY($2::text[])`,
    [ids, names]
  );
  await pool.query('DELETE FROM admins WHERE username = ANY($1::text[])', [names]);

  const leftover = await pool.query('SELECT COUNT(*)::int AS n FROM admins WHERE username = ANY($1::text[])', [
    names,
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

/** Like changePassword, but keeps the credentials the endpoint hands back. */
const changePasswordFull = async (token, currentPassword, newPassword) => {
  const res = await fetch(`${base}/api/admin/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await res.json().catch(() => ({}));
  return {
    status: res.status,
    message: body.message,
    token: body.accessToken ?? null,
    mustChange: body.admin?.mustChangePassword,
    refresh: /zurii_refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1] ?? null,
  };
};

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

// ── the journey a bootstrap-provisioned admin actually takes ────────
//
// Alice above starts from a policy-length temporary password. Cara starts from
// a SHORT one, the way `create-admin.js add-temporary` provisions a real first
// admin — which is the case where the relaxed policy could go wrong, so it gets
// walked end to end rather than assumed equivalent.

describe('bootstrap-provisioned admin: short temporary password to permanent', () => {
  let firstSession;

  it('signs in with the short temporary password', async () => {
    firstSession = await login(CARA, CARA_TEMP);
    assert.equal(firstSession.status, 200);
    assert.equal(firstSession.mustChange, true, 'a bootstrap account must owe a change');
  });

  it('reaches nothing but its own session while the temporary password stands', async () => {
    for (const route of ['/api/contact', '/api/admin/analytics/overview', '/api/admin/bookings']) {
      const res = await call(route, firstSession.token);
      assert.equal(res.status, 403, `${route} must be refused`);
      assert.equal(res.code, 'PASSWORD_CHANGE_REQUIRED');
      assert.equal(res.data, undefined);
    }
    assert.equal((await call('/api/admin/session', firstSession.token)).status, 200);
  });

  it('will NOT accept another short password as the permanent one', async () => {
    // The whole point of the isolation: the shorter minimum got this account
    // created, and it must not follow the account into the replacement.
    const alsoShort = 'Seawall@77z';
    assert.ok(alsoShort.length < MIN_LENGTH);
    assert.equal(validateBootstrapPassword(alsoShort, CARA).valid, true, 'accepted by the bootstrap policy');

    const res = await changePassword(firstSession.token, CARA_TEMP, alsoShort);
    assert.equal(res.status, 400, 'but the endpoint must apply the permanent policy');
    assert.equal((await adminRow(caraId)).must_change_password, true, 'and leave the account still owing');
  });

  it('accepts a permanent password and hands back a working session', async () => {
    const changed = await changePasswordFull(firstSession.token, CARA_TEMP, CARA_PRIVATE);
    assert.equal(changed.status, 200);
    assert.equal(changed.message, 'Password updated successfully.');
    assert.ok(changed.token, 'a fresh access token must be issued');
    assert.ok(changed.refresh, 'a fresh refresh cookie must be issued');
    assert.equal(changed.mustChange, false);

    // The point of issuing it: the admin continues into the dashboard without
    // signing in again.
    assert.equal((await call('/api/contact', changed.token)).status, 200);
    assert.equal((await call('/api/admin/analytics/overview', changed.token)).status, 200);

    const refreshed = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${changed.refresh}` },
    });
    assert.equal(refreshed.status, 200, 'the new refresh cookie must work too');
  });

  it('kills the session that made the change, despite issuing a new one', async () => {
    // The new token is not the old one surviving: everything minted before the
    // change is dead, including the token that authorised it.
    assert.equal((await call('/api/admin/session', firstSession.token)).status, 401);

    const stale = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${firstSession.refresh}` },
    });
    assert.equal(stale.status, 401, 'the pre-change refresh cookie must be dead');
  });

  it('makes the short temporary password stop authenticating', async () => {
    assert.equal((await login(CARA, CARA_TEMP)).status, 401);
  });

  it('signs in normally with the permanent password', async () => {
    const session = await login(CARA, CARA_PRIVATE);
    assert.equal(session.status, 200);
    assert.equal(session.mustChange, false);
    assert.equal((await call('/api/contact', session.token)).status, 200);
  });

  it('stores a bcrypt hash and never the password itself', async () => {
    const { rows } = await pool.query('SELECT password_hash, active FROM admins WHERE id = $1', [caraId]);
    assert.match(rows[0].password_hash, /^\$2[aby]\$/, 'must be a bcrypt hash');
    assert.ok(!rows[0].password_hash.includes(CARA_PRIVATE));
    assert.ok(!rows[0].password_hash.includes(CARA_TEMP));
    assert.equal(rows[0].active, true);
  });
});

// ── deactivation ────────────────────────────────────────────────────

describe('a deactivated admin is refused everywhere', () => {
  let liveSession;

  it('works normally before being disabled', async () => {
    liveSession = await login(DAN, DAN_PASSWORD);
    assert.equal(liveSession.status, 200);
    assert.equal((await call('/api/contact', liveSession.token)).status, 200);
  });

  it('loses its live session the moment the account is disabled', async () => {
    // `create-admin.js disable` performs exactly this.
    await pool.query(
      'UPDATE admins SET active = FALSE, token_version = token_version + 1 WHERE id = $1',
      [danId]
    );
    assert.equal((await call('/api/contact', liveSession.token)).status, 401);
    assert.equal((await call('/api/admin/session', liveSession.token)).status, 401);
  });

  it('cannot mint a new token from the refresh cookie it still holds', async () => {
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${liveSession.refresh}` },
    });
    assert.equal(res.status, 401);
  });

  it('cannot sign in again, with the correct password, and is told nothing extra', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: DAN, password: DAN_PASSWORD }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error, 'Invalid username or password.', 'must not reveal that the account is disabled');
    assert.equal(body.accessToken, undefined);
  });

  it('works again once re-enabled', async () => {
    await pool.query('UPDATE admins SET active = TRUE WHERE id = $1', [danId]);
    const session = await login(DAN, DAN_PASSWORD);
    assert.equal(session.status, 200);
    assert.equal((await call('/api/contact', session.token)).status, 200);
  });
});

// ── username uniqueness matches how login queries ───────────────────

describe('admin usernames are unique case-insensitively', () => {
  it('refuses a second account differing only by case', async () => {
    // Login matches WHERE LOWER(username) = $1. Without a matching constraint
    // both rows satisfy the plain unique index, one login matches two rows, and
    // which account authenticates — whose password is checked — is whatever
    // Postgres returns first.
    const collision = BOB.toUpperCase();
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO admins (username, password_hash, must_change_password, active)
           VALUES ($1, $2, FALSE, TRUE)`,
          [collision, '$2b$12$0123456789012345678901234567890123456789012345678901']
        ),
      (err) => err.code === '23505',
      'the database must reject a case-colliding username'
    );

    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admins WHERE LOWER(username) = LOWER($1)', [BOB]);
    assert.equal(rows[0].n, 1, 'exactly one account may answer to a given username');
  });

  it('still allows genuinely different usernames', async () => {
    const name = `zzfl-distinct-${RUN}`;
    const { rows } = await pool.query(
      `INSERT INTO admins (username, password_hash, must_change_password, active)
       VALUES ($1, $2, FALSE, TRUE) RETURNING id`,
      [name, '$2b$12$0123456789012345678901234567890123456789012345678901']
    );
    assert.ok(rows[0].id, 'the constraint must not block unrelated names');
    await pool.query('DELETE FROM admins WHERE id = $1', [rows[0].id]);
  });
});

// ── the generic failure contract ────────────────────────────────────

describe('failed authentication says the same thing every time', () => {
  it('answers identically for an unknown username and a wrong password', async () => {
    const unknown = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: `zzfl-nobody-${RUN}`, password: 'whatever-this-is-not' }),
    });
    const wrong = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOB, password: 'definitely-not-the-password' }),
    });

    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.deepEqual(await unknown.json(), await wrong.json(), 'the two must be indistinguishable');

    await pool.query('UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [bobId]);
  });

  it('never returns a password hash on a successful login', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOB, password: BOB_PASSWORD }),
    });
    const body = await res.json();
    const serialized = JSON.stringify(body);
    assert.equal(res.status, 200);
    assert.ok(!serialized.includes('$2b$'), 'no bcrypt hash may reach the client');
    assert.ok(!serialized.includes('password_hash'));
    assert.ok(!serialized.includes(BOB_PASSWORD), 'nor the password just submitted');
  });
});

// ── the refresh cookie's attributes ─────────────────────────────────
//
// These are the difference between a session that survives and one that dies
// after fifteen minutes, and every one of them fails silently when wrong: the
// browser simply declines to store or send the cookie, and the app reports
// nothing worse than "please log in again". Pinned here because nothing else
// would notice.

describe('the refresh cookie is set with the attributes the session depends on', () => {
  let setCookie;

  it('is issued on login', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOB, password: BOB_PASSWORD }),
    });
    assert.equal(res.status, 200);
    setCookie = res.headers.get('set-cookie') || '';
    assert.match(setCookie, /zurii_refresh_token=/);
  });

  it('is HttpOnly, so a stolen script cannot read it', () => {
    assert.match(setCookie, /HttpOnly/i);
  });

  it('is scoped to the whole app, so every route can renew', () => {
    assert.match(setCookie, /Path=\//i);
  });

  it('carries the configured SameSite, and Secure whenever that is None', () => {
    const sameSite = /SameSite=(\w+)/i.exec(setCookie)?.[1]?.toLowerCase();
    assert.ok(['lax', 'none'].includes(sameSite), `unexpected SameSite: ${sameSite}`);

    // The combination browsers reject outright. Getting this wrong means the
    // cookie is never stored at all — the exact silent failure this suite
    // exists to catch.
    if (sameSite === 'none') {
      assert.match(setCookie, /Secure/i, 'SameSite=None is only accepted alongside Secure');
    }
  });

  it('does not put the refresh token anywhere a script can reach it', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BOB, password: BOB_PASSWORD }),
    });
    const body = await res.json();
    assert.ok(!('refreshToken' in body), 'the refresh token must live only in the HttpOnly cookie');
    assert.ok(body.accessToken, 'the access token, by contrast, is returned for in-memory use');
  });

  it('is cleared on logout with attributes matching the ones it was set with', async () => {
    const session = await login(BOB, BOB_PASSWORD);
    const res = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${session.refresh}` },
    });
    const cleared = res.headers.get('set-cookie') || '';

    // A cookie is deleted by overwriting it with an expired one, and the
    // browser only treats that as the SAME cookie when the attributes line up.
    // A clear that omits them can leave the original in place.
    assert.match(cleared, /zurii_refresh_token=/);
    assert.match(cleared, /Path=\//i, 'the clear must repeat Path');
    assert.match(cleared, /HttpOnly/i, 'the clear must repeat HttpOnly');
    const setSameSite = /SameSite=(\w+)/i.exec(setCookie)?.[1]?.toLowerCase();
    const clearSameSite = /SameSite=(\w+)/i.exec(cleared)?.[1]?.toLowerCase();
    assert.equal(clearSameSite, setSameSite, 'the clear must repeat SameSite');
  });
});

// ── the CRM's two enquiry sources ───────────────────────────────────
//
// Enquiries from the Enquire buttons and the Plan Trip page are written to
// `bookings`, while the contact forms write to `contacts`. The CRM read only
// the second one, so the first was invisible — the row was in PostgreSQL and
// no screen in the product would show it. These pin the contract the dashboard
// now depends on: both sources reachable by one authenticated session, and the
// booking list carrying the fields an operator needs to act on a lead.

describe('the CRM can reach both enquiry sources with one session', () => {
  let token;

  it('authenticates', async () => {
    const session = await login(BOB, BOB_PASSWORD);
    assert.equal(session.status, 200);
    token = session.token;
  });

  it('serves contact leads', async () => {
    const res = await call('/api/contact', token);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'contacts must come back as a list');
  });

  it('serves trip enquiries from the same session', async () => {
    const res = await call('/api/admin/bookings', token);
    assert.equal(res.status, 200, 'the CRM reads this endpoint — it must not need a second login');
    assert.ok(Array.isArray(res.data), 'bookings must come back as a list');
  });

  it('lists the trip context the CRM shows, and no contact details', async () => {
    const { data } = await call('/api/admin/bookings', token);
    if (data.length === 0) return; // nothing to assert against on an empty table

    const row = data[0];
    // Trip context — the reason bookings are not merged into `contacts`, which
    // has nowhere to put any of it.
    for (const field of ['id', 'name', 'packageTitle', 'travelDate', 'travellers', 'departureCity', 'status', 'createdAt']) {
      assert.ok(field in row, `booking rows must preserve ${field}`);
    }
    // Deliberately absent. The analytics dashboard reads this same endpoint for
    // counts and trends; carrying contact details here would put dozens of
    // customers' email and phone into every one of those responses for no use.
    // The CRM fetches them one lead at a time from /bookings/:id instead.
    assert.equal(row.email, undefined, 'the list must not carry email');
    assert.equal(row.phone, undefined, 'the list must not carry phone');
    assert.equal(row.message, undefined, 'the list must not carry the message');
  });

  it('serves contact details one lead at a time, to an authenticated admin only', async () => {
    const { data } = await call('/api/admin/bookings', token);
    if (data.length === 0) return;

    const id = data[0].id;
    const detail = await call(`/api/admin/bookings/${id}`, token);
    assert.equal(detail.status, 200);
    for (const field of ['email', 'phone', 'message']) {
      assert.ok(field in detail.data, `the detail view must expose ${field}`);
    }
    // The same record must stay closed to anyone without a session.
    assert.equal((await call(`/api/admin/bookings/${id}`, null)).status, 401);
  });

  it('never exposes a password hash through either CRM source', async () => {
    for (const route of ['/api/contact', '/api/admin/bookings']) {
      const res = await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.text();
      assert.ok(!body.includes('$2b$'), `${route} must not leak a hash`);
      assert.ok(!body.includes('password_hash'), `${route} must not leak the column`);
    }
  });

  it('refuses both sources without a token', async () => {
    assert.equal((await call('/api/contact', null)).status, 401);
    assert.equal((await call('/api/admin/bookings', null)).status, 401);
  });

  it('refuses both sources to an admin owing a password change', async () => {
    const temp = await login(CARA, CARA_PRIVATE);
    assert.equal(temp.status, 200);
    // Cara has already replaced her temporary password by this point, so she is
    // a normal admin — re-arm the flag to exercise the refusal, then clear it.
    await pool.query('UPDATE admins SET must_change_password = TRUE WHERE id = $1', [caraId]);
    for (const route of ['/api/contact', '/api/admin/bookings']) {
      const res = await call(route, temp.token);
      assert.equal(res.status, 403, `${route} must be refused`);
      assert.equal(res.code, 'PASSWORD_CHANGE_REQUIRED');
      assert.equal(res.data, undefined, `${route} must not leak data`);
    }
    await pool.query('UPDATE admins SET must_change_password = FALSE WHERE id = $1', [caraId]);
  });

  it('reading the CRM does not mutate either table', async () => {
    const before = await pool.query(
      'SELECT (SELECT COUNT(*)::int FROM contacts) AS c, (SELECT COUNT(*)::int FROM bookings) AS b'
    );
    for (let i = 0; i < 3; i += 1) {
      await call('/api/contact', token);
      await call('/api/admin/bookings', token);
    }
    const after = await pool.query(
      'SELECT (SELECT COUNT(*)::int FROM contacts) AS c, (SELECT COUNT(*)::int FROM bookings) AS b'
    );
    assert.deepEqual(after.rows[0], before.rows[0], 'listing leads must never delete or create rows');
  });
});

// ── a submitted enquiry reaching the CRM ────────────────────────────
//
// The round trip the product is FOR: a visitor submits the public form, and the
// operator sees that lead. Every other test in this file authenticates and reads
// — none of them had ever written through POST /api/contact, so the entire
// submission path was untested. A contact form that silently stopped inserting
// would have kept all 219 tests green while the CRM showed nothing.
//
// The lead is created with this run's unique prefix and removed both inline and
// in after(). It is never a real customer's record.

describe('a submitted contact form reaches the CRM', () => {
  const LEAD_NAME = `zzfl-lead-${RUN}`;
  const LEAD_EMAIL = `zzfl-lead-${RUN}@example.invalid`;
  let token;

  it('accepts an anonymous submission from the public form', async () => {
    submittedContacts.push(LEAD_NAME);
    const res = await fetch(`${base}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: LEAD_NAME,
        email: LEAD_EMAIL,
        phone: '9800000000',
        interest: 'Quote Request: Bali',
        message: 'Regression fixture — safe to delete.',
      }),
    });
    assert.ok(res.status === 200 || res.status === 201, `expected a 2xx, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.success, true, 'the visitor must be told it worked');
  });

  it('stores it in contacts, with the defaults the CRM sorts on', async () => {
    const { rows } = await pool.query(
      'SELECT name, email, status, priority, source FROM contacts WHERE name = $1',
      [LEAD_NAME]
    );
    assert.equal(rows.length, 1, 'exactly one row must be inserted');
    assert.equal(rows[0].email, LEAD_EMAIL);
    // Server-assigned, never taken from the body — a caller must not be able to
    // post a lead that is already `completed` and therefore hidden from the
    // default Pending tab.
    assert.equal(rows[0].status, 'pending');
    assert.equal(rows[0].priority, 'normal');
  });

  it('appears in the list the CRM reads', async () => {
    const session = await login(BOB, BOB_PASSWORD);
    token = session.token;
    const res = await call('/api/contact', token);
    assert.equal(res.status, 200);
    const found = res.data.find((c) => c.name === LEAD_NAME);
    assert.ok(found, 'the lead an operator was promised must be in the CRM payload');
    assert.equal(found.email, LEAD_EMAIL, 'with the details needed to reply to it');
    assert.equal(found.phone, '9800000000');
  });

  it('coexists with the trip enquiries rather than replacing them', async () => {
    // The two sources are separate tables and the CRM shows both; submitting to
    // one must not disturb the other.
    const bookings = await call('/api/admin/bookings', token);
    assert.equal(bookings.status, 200);
    assert.ok(Array.isArray(bookings.data));

    const counts = await pool.query(
      'SELECT (SELECT COUNT(*)::int FROM contacts) AS c, (SELECT COUNT(*)::int FROM bookings) AS b'
    );
    assert.ok(counts.rows[0].c >= 1, 'the submitted lead is in contacts');
    assert.equal(counts.rows[0].b, bookings.data.length >= 50 ? counts.rows[0].b : bookings.data.length,
      'the bookings list must reflect the bookings table');
  });

  it('is removed again, leaving the table as it was', async () => {
    await pool.query('DELETE FROM contacts WHERE name = $1', [LEAD_NAME]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM contacts WHERE name = $1', [LEAD_NAME]);
    assert.equal(rows[0].n, 0);
  });
});

// ── surviving a page reload ─────────────────────────────────────────
//
// The exact sequence the browser performs when an admin reloads
// /admin/insights, asserted end to end. The access token lives in module memory
// in services/adminApi.js and is gone after a reload, so the refresh cookie is
// the only thing standing between the operator and the login form.
//
// This is here because the failure mode is invisible to every other test in this
// file: each one passes a token it was handed directly, which is precisely the
// thing a reload does not have. A deployment can satisfy all of them and still
// send the operator back to the login screen on every refresh.

describe('a page reload restores the session from the refresh cookie', () => {
  let session;
  let restored;

  it('signs in and is issued a refresh cookie', async () => {
    session = await login(BOB, BOB_PASSWORD);
    assert.equal(session.status, 200);
    assert.ok(session.refresh, 'login must set the cookie the reload depends on');
  });

  it('mints a new access token from the cookie alone', async () => {
    // bootstrapSession(): no Authorization header, only the cookie.
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${session.refresh}` },
    });
    assert.equal(res.status, 200, 'the reload must not need credentials again');
    const body = await res.json();
    restored = body.accessToken;
    assert.ok(restored, 'a fresh access token must come back');
    assert.equal(body.refreshToken, undefined, 'the refresh token stays in the cookie');
  });

  it('reports who is signed in, and that no password change is owed', async () => {
    // getAdminSession(): what decides 'authenticated' over 'mustChangePassword'.
    const res = await call('/api/admin/session', restored);
    assert.equal(res.status, 200);
    assert.equal(res.data.username, BOB);
    assert.equal(res.data.mustChangePassword, false);
  });

  it('serves both CRM sources with the restored token', async () => {
    assert.equal((await call('/api/contact', restored)).status, 200);
    assert.equal((await call('/api/admin/bookings', restored)).status, 200);
  });

  it('renews transparently when only the access token is dead', async () => {
    // adminFetch's retry path: a rejected token is not a dead session while the
    // cookie is still good.
    assert.equal((await call('/api/contact', 'not.a.valid.token')).status, 401);

    const again = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${session.refresh}` },
    });
    assert.equal(again.status, 200, 'the cookie must survive an expired access token');
    const { accessToken } = await again.json();
    assert.equal((await call('/api/contact', accessToken)).status, 200);
  });

  it('refuses a reload with no cookie, which is what shows the login form', async () => {
    const res = await fetch(`${base}/api/auth/refresh`, { method: 'POST' });
    assert.equal(res.status, 401);
  });

  it('refuses a forged cookie rather than trusting its contents', async () => {
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: 'zurii_refresh_token=not-a-real-token' },
    });
    assert.equal(res.status, 401);
  });

  it('stops restoring anything once the admin logs out', async () => {
    await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${session.refresh}` },
    });
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${session.refresh}` },
    });
    assert.equal(res.status, 401, 'logout must survive a reload');
    assert.equal((await call('/api/contact', restored)).status, 401, 'and revoke the access token');
  });
});

describe('a reload by an admin who still owes a password change', () => {
  let refresh;

  it('signs in and re-arms the flag', async () => {
    const session = await login(CARA, CARA_PRIVATE);
    assert.equal(session.status, 200);
    refresh = session.refresh;
    // Cara replaced her temporary password earlier in this file, so the flag is
    // set directly to exercise the refusal — the same approach the CRM block
    // uses, on this run's own throwaway account.
    await pool.query('UPDATE admins SET must_change_password = TRUE WHERE id = $1', [caraId]);
  });

  it('restores the session instead of refusing it', async () => {
    // The bug this pins: if refresh applied the password-change gate, a reload
    // would 401 and the page would show the LOGIN form to an admin who is
    // authenticated and one screen away from fixing it.
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `zurii_refresh_token=${refresh}` },
    });
    assert.equal(res.status, 200, 'a temporary-password session must survive a reload');
    const { accessToken } = await res.json();

    const session = await call('/api/admin/session', accessToken);
    assert.equal(session.status, 200, 'the session endpoint must stay reachable');
    assert.equal(session.data.mustChangePassword, true, 'and say a change is owed');

    // Which is what puts up the password screen rather than the dashboard.
    const crm = await call('/api/contact', accessToken);
    assert.equal(crm.status, 403);
    assert.equal(crm.code, 'PASSWORD_CHANGE_REQUIRED');
  });

  it('leaves the account as it found it', async () => {
    await pool.query('UPDATE admins SET must_change_password = FALSE WHERE id = $1', [caraId]);
    assert.equal((await adminRow(caraId)).must_change_password, false);
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

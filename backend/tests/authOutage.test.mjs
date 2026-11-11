/**
 * ZT-07: a temporary PostgreSQL outage must not end an admin's session.
 *
 * Boots the real server.js with its DATABASE_URL pointed at a TCP relay in
 * front of zurii_test, signs in, then cuts the relay. While the database is
 * unreachable a valid refresh cookie must get 503 and be left in place, a bad
 * one must still get 401 and be cleared, and the process must survive its idle
 * connections dying. Once the relay is restored the SAME cookie must work.
 *
 * Writes one throwaway admin (and its audit rows) to zurii_test, removed after.
 */
// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import bcrypt from 'bcrypt';

import poolModule from '../db/pool.js';

const { getPool } = poolModule;
const RUN = crypto.randomBytes(4).toString('hex');
const TEST_ADMIN = `zzoutage-${RUN}`;
const TEST_PASSWORD = `Test-Passphrase-${crypto.randomBytes(8).toString('hex')}`;

const pool = getPool();
let server;
let base;
let relay;
let adminId;

/** A TCP relay to PostgreSQL that the test can cut and restore. */
function createRelay(target) {
  let up = true;
  const sockets = new Set();
  const tcp = net.createServer((client) => {
    if (!up) {
      client.destroy();
      return;
    }
    const upstream = net.connect(target.port, target.host);
    sockets.add(client);
    sockets.add(upstream);
    const drop = () => {
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    for (const s of [client, upstream]) {
      s.on('error', drop);
      s.on('close', drop);
    }
    client.pipe(upstream);
    upstream.pipe(client);
  });
  return {
    listen: () => new Promise((resolve) => tcp.listen(0, '127.0.0.1', () => resolve(tcp.address().port))),
    cut() {
      up = false;
      for (const s of sockets) s.destroy();
      sockets.clear();
    },
    restore() {
      up = true;
    },
    close: () =>
      new Promise((resolve) => {
        for (const s of sockets) s.destroy();
        tcp.close(() => resolve());
      }),
  };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  await assertTestDatabase(pool);
  const hash = await bcrypt.hash(TEST_PASSWORD, 10);
  const { rows } = await pool.query('INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id', [
    TEST_ADMIN,
    hash,
  ]);
  adminId = rows[0].id;

  const dbUrl = new URL(process.env.DATABASE_URL);
  relay = createRelay({ host: dbUrl.hostname, port: Number(dbUrl.port || 5432) });
  const relayPort = await relay.listen();
  dbUrl.hostname = '127.0.0.1';
  dbUrl.port = String(relayPort);

  const port = 6100 + Math.floor(Math.random() * 300);
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_URL: dbUrl.toString() },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(`${base}/api/packages`)).status) break;
    } catch {
      // not listening yet
    }
    await pause(250);
  }
});

after(async () => {
  server?.kill('SIGTERM');
  await relay?.close();
  await pool.query(
    `DELETE FROM admin_audit_logs WHERE admin_id = $1 OR metadata->>'username' = $2 OR metadata->>'attemptedUsername' = $2`,
    [adminId, TEST_ADMIN]
  );
  await pool.query('DELETE FROM admins WHERE username = $1', [TEST_ADMIN]);
  const left = await pool.query('SELECT 1 FROM admins WHERE username = $1', [TEST_ADMIN]);
  assert.equal(left.rows.length, 0, 'test admin must not survive the run');
  await pool.end();
});

const refresh = (cookie) =>
  fetch(`${base}/api/auth/refresh`, { method: 'POST', headers: { Cookie: `zurii_refresh_token=${cookie}` } });

const getProtected = (token) =>
  fetch(`${base}/api/admin/analytics/overview`, { headers: { Authorization: `Bearer ${token}` } });

describe('admin session during a database outage (ZT-07)', () => {
  let cookie;
  let token;

  it('signs in while the database is up', async () => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: TEST_ADMIN, password: TEST_PASSWORD }),
    });
    assert.equal(res.status, 200);
    token = (await res.json()).accessToken;
    cookie = /zurii_refresh_token=([^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1];
    assert.ok(token && cookie);
  });

  it('answers 503 and keeps the refresh cookie while PostgreSQL is unreachable', async () => {
    relay.cut();
    const res = await refresh(cookie);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('set-cookie'), null, 'a valid session must not be cleared by an outage');
    assert.ok(res.headers.get('retry-after'));
    assert.equal((await res.json()).code, 'SERVICE_UNAVAILABLE');

    assert.equal((await getProtected(token)).status, 503, 'requireAuth fails closed with 503, not 401');
    const leads = await fetch(`${base}/api/admin/leads`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(leads.status, 503, 'the lead CRM reports the outage, not a logout');
  });

  it('still rejects and clears an invalid refresh token during the outage', async () => {
    const res = await refresh('not-a-valid-token');
    assert.equal(res.status, 401);
    assert.match(res.headers.get('set-cookie') || '', /zurii_refresh_token=;/);
  });

  it('survives its idle database connections being dropped', async () => {
    await pause(300);
    const res = await fetch(`${base}/api/health`);
    assert.ok(res.status > 0, 'the API process must still be answering');
  });

  it('restores the same session once PostgreSQL is back', async () => {
    relay.restore();
    let res;
    for (let i = 0; i < 20; i += 1) {
      res = await refresh(cookie);
      if (res.status === 200) break;
      await pause(250);
    }
    assert.equal(res.status, 200);
    const fresh = (await res.json()).accessToken;
    assert.equal((await getProtected(fresh)).status, 200);
  });
});

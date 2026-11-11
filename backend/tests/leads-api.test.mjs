/**
 * Phase 4 — unified lead management, end to end against the real server.
 *
 * Boots server.js on zurii_test (migrated by the runner, including 0004) and
 * drives /api/admin/leads, the legacy contact routes and the public forms.
 * Bulk data is synthetic: 520 contacts and 60 bookings (40 trip, 20 custom)
 * whose names carry this run's token and whose emails use a run-only domain,
 * dated in 2020 so they never displace the recent rows other test files read.
 * Every list and count below is scoped by that token, so test files running
 * in parallel cannot disturb the numbers. Everything is removed afterwards.
 */
// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import express from 'express';
import jwt from 'jsonwebtoken';

import poolModule from '../db/pool.js';
import createLeadsRouter from '../routes/leads.js';

const { getPool } = poolModule;
const RUN = crypto.randomBytes(4).toString('hex');
const TAG = `zzlead-${RUN}`;
const DOMAIN = `leads-${RUN}.test`;
const pool = getPool();

let server;
let base;
let token;
let token2;
let tempToken;
const admins = {};
const ids = {};
let clientSeq = 0;

const contactCount = 520;
const bookingCount = 60;

before(async () => {
  await assertTestDatabase(pool);

  for (const [key, mustChange] of [['main', false], ['second', false], ['temp', true]]) {
    const username = `${TAG}-${key}`;
    const { rows } = await pool.query(
      `INSERT INTO admins (username, password_hash, must_change_password) VALUES ($1, 'x', $2) RETURNING id`,
      [username, mustChange]
    );
    admins[key] = { id: rows[0].id, username };
  }
  const sign = (a, mustChangePassword = false) =>
    jwt.sign({ id: a.id, username: a.username, tokenVersion: 0, mustChangePassword }, process.env.JWT_SECRET, { expiresIn: '15m' });
  token = sign(admins.main);
  token2 = sign(admins.second);
  tempToken = sign(admins.temp, true);

  // 520 contacts: every 3rd 'Bali', every 4th legacy 'completed', every 10th
  // high priority, and a unified CONTACTED on i = 26 × odd (pending rows only).
  await pool.query(
    `INSERT INTO contacts (name, email, phone, interest, message, status, priority, lead_status, created_at)
     SELECT $1 || ' contact ' || i, 'c' || i || '@' || $2, '+91 66' || lpad(i::text, 8, '0'),
            CASE WHEN i % 3 = 0 THEN 'Bali' ELSE 'General' END,
            'Synthetic message ' || i,
            CASE WHEN i % 4 = 0 THEN 'completed' ELSE 'pending' END,
            CASE WHEN i % 10 = 0 THEN 'high' ELSE 'normal' END,
            CASE WHEN i % 26 = 0 AND i % 4 <> 0 THEN 'CONTACTED' END,
            TIMESTAMP '2020-01-01 00:00' + make_interval(mins => i)
       FROM generate_series(1, $3) i`,
    [TAG, DOMAIN, contactCount]
  );
  // 60 bookings: 1–40 for a package (trip), 41–60 without one (custom);
  // statuses cycle through the five original values.
  await pool.query(
    `INSERT INTO bookings (package_id, name, email, phone, travellers, status, message, created_at)
     SELECT CASE WHEN i <= 40 THEN (SELECT id FROM packages ORDER BY id LIMIT 1) END,
            $1 || ' booking ' || i, 'b' || i || '@' || $2, '+91 55' || lpad(i::text, 8, '0'), 2,
            (ARRAY['NEW','CONTACTED','INTERESTED','CONFIRMED','CLOSED'])[1 + i % 5],
            'Synthetic enquiry ' || i,
            TIMESTAMP '2020-01-02 12:00' + make_interval(mins => i)
       FROM generate_series(1, $3) i`,
    [TAG, DOMAIN, bookingCount]
  );
  const pick = async (table, email) => (await pool.query(`SELECT id FROM ${table} WHERE email = $1`, [email])).rows[0].id;
  ids.contact1 = await pick('contacts', `c1@${DOMAIN}`);
  ids.contact2 = await pick('contacts', `c2@${DOMAIN}`);
  ids.contact3 = await pick('contacts', `c3@${DOMAIN}`);
  ids.trip1 = await pick('bookings', `b1@${DOMAIN}`);
  ids.trip2 = await pick('bookings', `b2@${DOMAIN}`);
  ids.custom41 = await pick('bookings', `b41@${DOMAIN}`);

  const port = 6500 + Math.floor(Math.random() * 400);
  base = `http://127.0.0.1:${port}`;
  server = spawn('node', ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    // One trusted hop, so each public submission can arrive from its own
    // address and the per-client lead limiter does not interfere.
    env: { ...process.env, PORT: String(port), TRUST_PROXY: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).status) break;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
});

after(async () => {
  server?.kill('SIGTERM');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL zurii.lead_history_maintenance = 'on'`);
    const mine = `(SELECT id FROM contacts WHERE email LIKE $1)`;
    const mineB = `(SELECT id FROM bookings WHERE email LIKE $1)`;
    for (const table of ['lead_activity', 'lead_notes']) {
      await client.query(`DELETE FROM ${table} WHERE contact_id IN ${mine} OR booking_id IN ${mineB}`, [`%@${DOMAIN}`]);
    }
    await client.query('DELETE FROM contacts WHERE email LIKE $1', [`%@${DOMAIN}`]);
    await client.query('DELETE FROM bookings WHERE email LIKE $1', [`%@${DOMAIN}`]);
    await client.query(`DELETE FROM admin_audit_logs WHERE admin_id = ANY($1::int[])`, [Object.values(admins).map((a) => a.id)]);
    await client.query('DELETE FROM admins WHERE username LIKE $1', [`${TAG}-%`]);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  const left = await pool.query(
    `SELECT (SELECT COUNT(*) FROM contacts WHERE email LIKE $1)::int + (SELECT COUNT(*) FROM bookings WHERE email LIKE $1)::int AS n`,
    [`%@${DOMAIN}`]
  );
  assert.equal(left.rows[0].n, 0, 'synthetic leads must not survive the run');
  await pool.end();
});

// ── helpers ─────────────────────────────────────────────────────────

async function api(method, url, { auth = token, body, headers = {} } = {}) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json, headers: res.headers };
}

const list = (params) => api('GET', `/api/admin/leads?${new URLSearchParams({ q: TAG, ...params })}`);
const total = async (params) => (await list({ pageSize: '1', ...params })).body.meta.total;
const lead = (source, id) => `${source}-${id}`;

const publicPost = (url, body, key) =>
  api('POST', url, {
    auth: null,
    body,
    headers: { 'X-Forwarded-For': `198.18.${Math.floor(clientSeq / 250)}.${(clientSeq++ % 250) + 1}`, ...(key ? { 'Idempotency-Key': key } : {}) },
  });
const contactBody = (n) => ({ name: `${TAG} public ${n}`, email: `p${n}@${DOMAIN}`, phone: '+91 90000 00051', message: 'Synthetic Phase 4 record.' });
const bookingBody = (n, extra = {}) => ({
  name: `${TAG} enquiry ${n}`, email: `e${n}@${DOMAIN}`, phone: '+91 90000 00052',
  travelDate: '2030-06-01', travellers: 2, departureCity: 'Delhi', message: 'Synthetic Phase 4 record.', ...extra,
});
const rowsFor = async (table, email) => (await pool.query(`SELECT id FROM ${table} WHERE email = $1`, [email])).rows;
const newKey = () => crypto.randomUUID();

// ── access control ──────────────────────────────────────────────────

describe('lead API access control', () => {
  const routes = () => [
    ['GET', '/api/admin/leads'],
    ['GET', '/api/admin/leads/summary'],
    ['GET', `/api/admin/leads/${lead('contact', ids.contact1)}`],
    ['PATCH', `/api/admin/leads/${lead('contact', ids.contact1)}/status`, { status: 'CLOSED' }],
    ['POST', `/api/admin/leads/${lead('contact', ids.contact1)}/notes`, { body: 'x' }],
    ['DELETE', `/api/admin/leads/${lead('contact', ids.contact1)}`],
    ['POST', `/api/admin/leads/${lead('contact', ids.contact1)}/restore`],
  ];

  it('refuses requests without a token or with a forged one', async () => {
    for (const [method, url, body] of routes()) {
      assert.equal((await api(method, url, { auth: null, body })).status, 401, `${method} ${url}`);
      assert.equal((await api(method, url, { auth: 'not.a.token', body })).status, 401, `${method} ${url}`);
    }
  });

  it('refuses an account that still owes a password change', async () => {
    for (const [method, url, body] of routes()) {
      const res = await api(method, url, { auth: tempToken, body });
      assert.equal(res.status, 403, `${method} ${url}`);
      assert.equal(res.body.code, 'PASSWORD_CHANGE_REQUIRED');
    }
    const untouched = await pool.query('SELECT deleted_at, lead_status FROM contacts WHERE id = $1', [ids.contact1]);
    assert.equal(untouched.rows[0].deleted_at, null);
    assert.equal(untouched.rows[0].lead_status, null);
  });
});

// ── visibility and pagination (ZT-02, ZT-06) ────────────────────────

describe('visibility, pagination and counts', () => {
  it('shows every lead: more than 500 contacts and more than 50 bookings', async () => {
    assert.equal(await total({}), contactCount + bookingCount);
    assert.equal(await total({ kind: 'contact' }), contactCount);
    assert.equal(await total({ kind: 'trip' }), 40);
    assert.equal(await total({ kind: 'custom' }), 20);
  });

  it('pages through all 520 contacts with no gaps, repeats or out-of-order rows', async () => {
    const seen = [];
    let previous = Infinity;
    for (let page = 1; page <= 6; page += 1) {
      const res = await list({ kind: 'contact', pageSize: '100', page: String(page) });
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.totalPages, 6);
      assert.equal(res.body.data.length, page < 6 ? 100 : 20);
      for (const item of res.body.data) {
        const t = new Date(item.createdAt).getTime();
        assert.ok(t <= previous, 'newest first');
        previous = t;
        seen.push(item.sourceId);
      }
    }
    assert.equal(new Set(seen).size, contactCount);
    assert.equal((await list({ kind: 'contact', pageSize: '100', page: '7' })).body.data.length, 0);
  });

  it('paginates the combined list across both tables', async () => {
    const page1 = await list({ pageSize: '50', page: '1' });
    const page2 = await list({ pageSize: '50', page: '2' });
    assert.equal(page1.body.meta.total, 580);
    assert.equal(page1.body.meta.totalPages, 12);
    assert.ok(page1.body.data.every((l) => l.source === 'booking'), 'the 50 newest are bookings');
    const sources = new Set(page2.body.data.map((l) => l.source));
    assert.deepEqual([...sources].sort(), ['booking', 'contact'], 'page 2 crosses from bookings into contacts');
    const all = [...page1.body.data, ...page2.body.data].map((l) => l.leadId);
    assert.equal(new Set(all).size, 100);
  });

  it('sorts newest, oldest and by name', async () => {
    const newest = (await list({ sort: 'newest', pageSize: '1' })).body.data[0];
    const oldest = (await list({ sort: 'oldest', pageSize: '1' })).body.data[0];
    assert.equal(newest.name, `${TAG} booking 60`);
    assert.equal(oldest.name, `${TAG} contact 1`);
    const names = (await list({ sort: 'name_asc', pageSize: '5' })).body.data.map((l) => l.name);
    assert.deepEqual(names, [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  });

  it('filters by status, priority, interest and date', async () => {
    assert.equal(await total({ status: 'open' }), 426);
    assert.equal(await total({ status: 'done' }), 154);
    assert.equal(await total({ status: 'CONTACTED' }), 22);
    assert.equal(await total({ status: 'NEW,CLOSED' }), 534);
    assert.equal(await total({ status: 'CANCELLED' }), 0);
    assert.equal(await total({ priority: 'high' }), 52);
    assert.equal(await total({ interest: 'Bali' }), 173);
    assert.equal(await total({ from: '2020-01-02T00:00:00Z', to: '2020-01-02T23:59:59Z' }), 60);
  });

  it('searches by phone digits, email and name — and treats % literally', async () => {
    const byPhone = await api('GET', '/api/admin/leads?q=6600000123');
    assert.deepEqual(byPhone.body.data.map((l) => l.name), [`${TAG} contact 123`]);
    const byEmail = await api('GET', `/api/admin/leads?q=${encodeURIComponent(`b7@${DOMAIN}`)}`);
    assert.deepEqual(byEmail.body.data.map((l) => l.name), [`${TAG} booking 7`]);
    assert.equal(await total({ q: `${TAG} booking 4` }), 11, 'booking 4 and 40–49');
    assert.equal((await api('GET', `/api/admin/leads?q=${encodeURIComponent('zz%lead')}`)).body.meta.total, 0);
  });

  it('counts KPIs over every matching lead, not the page on screen', async () => {
    const res = await api('GET', `/api/admin/leads/summary?${new URLSearchParams({ q: TAG, since: '2020-01-02T00:00:00Z' })}`);
    assert.equal(res.status, 200);
    const s = res.body.data;
    assert.equal(s.total, 580);
    assert.deepEqual(s.byKind, { contact: 520, trip: 40, custom: 20 });
    assert.deepEqual(s.byStatus, { NEW: 392, CONTACTED: 22, INTERESTED: 12, CONFIRMED: 12, CLOSED: 142, CANCELLED: 0 });
    assert.equal(s.open, 426);
    assert.equal(s.done, 154);
    assert.equal(s.receivedSince, 60);
    assert.ok(s.interests.some((i) => i.interest === 'Bali'));
    const global = await api('GET', '/api/admin/leads/summary');
    assert.ok(global.body.data.total >= 580);
  });

  it('rejects malformed queries and lead ids', async () => {
    for (const qs of ['kind=nope', 'status=MAYBE', 'sort=random', 'page=0', 'pageSize=101', 'from=yesterday', 'deleted=all', 'kind=trip&kind=custom']) {
      const res = await api('GET', `/api/admin/leads?${qs}`);
      assert.equal(res.status, 400, qs);
      assert.equal(res.body.code, 'INVALID_INPUT');
    }
    for (const id of ['contact-0', 'contact-abc', 'lead-1', 'booking-99999999999', 'contact-1;DROP']) {
      assert.equal((await api('GET', `/api/admin/leads/${encodeURIComponent(id)}`)).status, 400, id);
    }
    assert.equal((await api('GET', '/api/admin/leads/contact-2147483000')).status, 404);
  });
});

// ── detail, statuses, notes, history ───────────────────────────────

describe('lead detail, statuses, notes and history', () => {
  it('returns the full record with its original ids, package and attribution fields', async () => {
    const res = await api('GET', `/api/admin/leads/${lead('booking', ids.trip1)}`);
    assert.equal(res.status, 200);
    const { lead: l, notes, activity } = res.body.data;
    assert.equal(l.sourceId, ids.trip1);
    assert.equal(l.kind, 'trip');
    assert.equal(l.email, `b1@${DOMAIN}`);
    assert.ok(l.packageSlug, 'package relationship preserved');
    assert.deepEqual(notes, []);
    assert.deepEqual(activity, []);
    const custom = await api('GET', `/api/admin/leads/${lead('booking', ids.custom41)}`);
    assert.equal(custom.body.data.lead.kind, 'custom');
  });

  it('moves a contact through the unified statuses and keeps the legacy column truthful', async () => {
    const url = `/api/admin/leads/${lead('contact', ids.contact1)}/status`;
    let res = await api('PATCH', url, { body: { status: 'CONTACTED', expectedStatus: 'NEW' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.previousStatus, 'NEW');
    assert.equal(res.body.data.changed, true);
    let row = (await pool.query('SELECT status, lead_status FROM contacts WHERE id = $1', [ids.contact1])).rows[0];
    assert.deepEqual(row, { status: 'pending', lead_status: 'CONTACTED' });

    res = await api('PATCH', url, { body: { status: 'CONFIRMED' } });
    assert.equal(res.status, 200);
    row = (await pool.query('SELECT status, lead_status FROM contacts WHERE id = $1', [ids.contact1])).rows[0];
    assert.deepEqual(row, { status: 'completed', lead_status: 'CONFIRMED' });

    res = await api('PATCH', url, { body: { status: 'CONFIRMED' } });
    assert.equal(res.body.data.changed, false, 'setting the same status is a no-op');
  });

  it('accepts CANCELLED for a trip enquiry (new constraint value)', async () => {
    const res = await api('PATCH', `/api/admin/leads/${lead('booking', ids.trip1)}/status`, { body: { status: 'CANCELLED' } });
    assert.equal(res.status, 200);
    const row = (await pool.query('SELECT status FROM bookings WHERE id = $1', [ids.trip1])).rows[0];
    assert.equal(row.status, 'CANCELLED');
  });

  it('records who changed what, in order, and survives a re-read', async () => {
    const { body } = await api('GET', `/api/admin/leads/${lead('contact', ids.contact1)}`);
    assert.equal(body.data.lead.status, 'CONFIRMED');
    assert.deepEqual(
      body.data.activity.map((a) => [a.action, a.fromStatus, a.toStatus, a.actor]),
      [
        ['status_changed', 'NEW', 'CONTACTED', admins.main.username],
        ['status_changed', 'CONTACTED', 'CONFIRMED', admins.main.username],
      ]
    );
  });

  it('rejects unknown statuses and a stale expectedStatus', async () => {
    const url = `/api/admin/leads/${lead('contact', ids.contact2)}/status`;
    assert.equal((await api('PATCH', url, { body: { status: 'WON' } })).status, 400);
    assert.equal((await api('PATCH', url, { body: {} })).status, 400);
    const stale = await api('PATCH', url, { body: { status: 'CLOSED', expectedStatus: 'INTERESTED' } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'STATUS_CONFLICT');
    assert.equal(stale.body.currentStatus, 'NEW');
  });

  it('serialises concurrent updates: one wins, the others are told', async () => {
    const url = `/api/admin/leads/${lead('booking', ids.trip2)}/status`;
    const current = (await api('GET', `/api/admin/leads/${lead('booking', ids.trip2)}`)).body.data.lead.status;
    const targets = ['CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED'].filter((s) => s !== current);
    const results = await Promise.all(
      targets.map((status, i) => api('PATCH', url, { auth: i % 2 ? token2 : token, body: { status, expectedStatus: current } }))
    );
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, targets.length - 1);
    const { body } = await api('GET', `/api/admin/leads/${lead('booking', ids.trip2)}`);
    assert.equal(body.data.activity.length, 1, 'exactly one change recorded');
    assert.equal(body.data.activity[0].fromStatus, current);
  });

  it('adds notes, keeps them in order and stores text verbatim', async () => {
    const url = `/api/admin/leads/${lead('contact', ids.contact3)}/notes`;
    const first = await api('POST', url, { body: { body: 'Called — asked for a Bali quote.' } });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.note.author, admins.main.username);
    await api('POST', url, { auth: token2, body: { body: '<b>not html</b> & second note' } });
    assert.equal((await api('POST', url, { body: { body: '   ' } })).status, 400);
    assert.equal((await api('POST', url, { body: { body: 'x'.repeat(2001) } })).status, 400);

    const { body } = await api('GET', `/api/admin/leads/${lead('contact', ids.contact3)}`);
    assert.deepEqual(body.data.notes.map((n) => [n.body, n.author]), [
      ['Called — asked for a Bali quote.', admins.main.username],
      ['<b>not html</b> & second note', admins.second.username],
    ]);
    assert.deepEqual(body.data.activity.map((a) => a.action), ['note_added', 'note_added']);
    assert.equal(JSON.stringify(body.data.activity).includes('Bali quote'), false, 'note text is not copied into the trail');
  });

  it('keeps notes and history on later pages and list refreshes', async () => {
    const first = await list({ pageSize: '25', page: '1' });
    await list({ pageSize: '25', page: '20' });
    const again = await list({ pageSize: '25', page: '1' });
    assert.deepEqual(again.body.data.map((l) => l.leadId), first.body.data.map((l) => l.leadId));
    const { body } = await api('GET', `/api/admin/leads/${lead('contact', ids.contact3)}`);
    assert.equal(body.data.notes.length, 2);
  });

  it('enforces the append-only history in the database itself', async () => {
    await assert.rejects(pool.query(`UPDATE lead_activity SET admin_username = 'x' WHERE contact_id = $1`, [ids.contact1]), /append-only/);
    await assert.rejects(pool.query('DELETE FROM lead_notes WHERE contact_id = $1', [ids.contact3]), /append-only/);
    await assert.rejects(pool.query('TRUNCATE lead_activity'), /append-only/);
    await assert.rejects(pool.query('DELETE FROM contacts WHERE id = $1', [ids.contact3]), /foreign key|violates/i,
      'a lead with history cannot be hard-deleted by accident');
  });
});

// ── soft delete and recovery (ZT-10) ────────────────────────────────

describe('soft delete and recovery', () => {
  it('hides a deleted lead, records who and why, and restores it', async () => {
    const id = lead('contact', ids.contact2);
    const del = await api('DELETE', `/api/admin/leads/${id}`, { body: { reason: 'Duplicate of an earlier enquiry' } });
    assert.equal(del.status, 200);
    // "contact 2" matches contacts 2, 20–29 and 200–299: 111 before the delete.
    assert.equal(await total({ q: `${TAG} contact 2` }), 110, 'contact 2 is gone from the active list');
    const deleted = await list({ deleted: 'only' });
    assert.deepEqual(deleted.body.data.map((l) => l.leadId), [id]);
    assert.equal((await api('GET', `/api/admin/leads/summary?q=${TAG}`)).body.data.deleted, 1);

    const detail = (await api('GET', `/api/admin/leads/${id}`)).body.data.lead;
    assert.ok(detail.deletedAt);
    assert.equal(detail.deletedBy, admins.main.username);
    assert.equal(detail.deleteReason, 'Duplicate of an earlier enquiry');

    assert.equal((await api('DELETE', `/api/admin/leads/${id}`)).status, 409);
    const blocked = await api('PATCH', `/api/admin/leads/${id}/status`, { body: { status: 'CLOSED' } });
    assert.equal(blocked.body.code, 'LEAD_DELETED');

    assert.equal((await api('POST', `/api/admin/leads/${id}/restore`)).status, 200);
    assert.equal((await api('POST', `/api/admin/leads/${id}/restore`)).status, 409);
    assert.equal(await total({ q: `${TAG} contact 2` }), 111);
    const activity = (await api('GET', `/api/admin/leads/${id}`)).body.data.activity;
    assert.deepEqual(activity.map((a) => a.action).slice(-2), ['deleted', 'restored']);
    assert.equal(activity.at(-2).details.reason, 'Duplicate of an earlier enquiry');
    assert.ok((await pool.query('SELECT 1 FROM contacts WHERE id = $1', [ids.contact2])).rows.length, 'the row was never removed');
  });

  it('rejects a non-text reason', async () => {
    assert.equal((await api('DELETE', `/api/admin/leads/${lead('contact', ids.contact2)}`, { body: { reason: { a: 1 } } })).status, 400);
  });

  it('turns the legacy contact routes into recorded, reversible changes', async () => {
    const complete = await api('PATCH', `/api/contact/${ids.contact2}/complete`);
    assert.equal(complete.status, 200);
    assert.equal(complete.body.data.status, 'completed');
    const reopen = await api('PATCH', `/api/contact/${ids.contact2}/reopen`);
    assert.equal(reopen.body.data.status, 'pending');
    const del = await api('DELETE', `/api/contact/${ids.contact2}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.message, 'Lead deleted successfully');
    const legacyList = await api('GET', '/api/contact?limit=1000');
    assert.equal(legacyList.body.data.some((c) => c.id === ids.contact2), false, 'soft-deleted leads leave the legacy list');
    assert.equal((await api('PATCH', '/api/contact/not-a-number/complete')).status, 404);
    const activity = (await api('GET', `/api/admin/leads/${lead('contact', ids.contact2)}`)).body.data.activity;
    assert.deepEqual(activity.slice(-3).map((a) => [a.action, a.details.via]), [
      ['status_changed', 'legacy-api'], ['status_changed', 'legacy-api'], ['deleted', 'legacy-api'],
    ]);
    assert.equal((await api('POST', `/api/admin/leads/${lead('contact', ids.contact2)}/restore`)).status, 200);
  });
});

// ── duplicate submissions ───────────────────────────────────────────

describe('duplicate submission protection', () => {
  it('replays a repeated contact submission instead of storing it twice', async () => {
    const key = newKey();
    const first = await publicPost('/api/contact', contactBody(1), key);
    const second = await publicPost('/api/contact', contactBody(1), key);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.body.data.id, first.body.data.id);
    assert.equal(second.headers.get('idempotent-replayed'), 'true');
    assert.equal((await rowsFor('contacts', `p1@${DOMAIN}`)).length, 1);
  });

  it('stores exactly one enquiry when the same submission races itself', async () => {
    const key = newKey();
    const results = await Promise.all(Array.from({ length: 6 }, () => publicPost('/api/bookings', bookingBody(1), key)));
    assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.status)));
    assert.equal(new Set(results.map((r) => r.body.data.id)).size, 1);
    assert.equal((await rowsFor('bookings', `e1@${DOMAIN}`)).length, 1);
  });

  it('refuses a reused key with different contents, and a malformed key', async () => {
    const key = newKey();
    await publicPost('/api/bookings', bookingBody(2), key);
    const reused = await publicPost('/api/bookings', bookingBody(2, { travellers: 5 }), key);
    assert.equal(reused.status, 422);
    assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED');
    const bad = await publicPost('/api/contact', contactBody(9), 'short');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'INVALID_IDEMPOTENCY_KEY');
    assert.equal((await rowsFor('contacts', `p9@${DOMAIN}`)).length, 0);
  });

  it('never suppresses genuinely new enquiries', async () => {
    await publicPost('/api/contact', contactBody(3), newKey());
    await publicPost('/api/contact', contactBody(3), newKey());
    await publicPost('/api/contact', contactBody(3));
    await publicPost('/api/contact', contactBody(3));
    assert.equal((await rowsFor('contacts', `p3@${DOMAIN}`)).length, 4, 'new keys, or no key, are new enquiries');
  });

  it('does not consume a key on a rejected submission, and forgets expired keys', async () => {
    const key = newKey();
    const invalid = await publicPost('/api/bookings', { ...bookingBody(4), email: 'not-an-email' }, key);
    assert.equal(invalid.status, 400);
    const valid = await publicPost('/api/bookings', bookingBody(4), key);
    assert.equal(valid.status, 201);
    await pool.query(`UPDATE lead_idempotency_keys SET expires_at = NOW() - interval '1 minute' WHERE idempotency_key = $1`, [key]);
    const afterExpiry = await publicPost('/api/bookings', bookingBody(4), key);
    assert.equal(afterExpiry.status, 201);
    assert.notEqual(afterExpiry.body.data.id, valid.body.data.id);
    assert.equal((await rowsFor('bookings', `e4@${DOMAIN}`)).length, 2);
  });
});

// ── enquiry → CRM, and analytics ────────────────────────────────────

describe('enquiry to CRM', () => {
  it('lists contact, trip and Plan My Trip submissions in the combined and filtered views', async () => {
    const { rows } = await pool.query(`SELECT slug FROM packages WHERE status = 'PUBLISHED' ORDER BY id LIMIT 1`);
    const contactRes = await publicPost('/api/contact', { ...contactBody(20), name: `${TAG} e2e contact` }, newKey());
    const tripRes = await publicPost('/api/bookings', { ...bookingBody(21), name: `${TAG} e2e trip`, packageSlug: rows[0].slug }, newKey());
    const customRes = await publicPost('/api/bookings', { ...bookingBody(22), name: `${TAG} e2e custom` }, newKey());
    for (const r of [contactRes, tripRes, customRes]) assert.equal(r.status, 201);

    const combined = await api('GET', `/api/admin/leads?q=${encodeURIComponent(`${TAG} e2e`)}`);
    assert.deepEqual(combined.body.data.map((l) => [l.kind, l.status]).sort(), [['contact', 'NEW'], ['custom', 'NEW'], ['trip', 'NEW']]);
    for (const [kind, name] of [['contact', 'e2e contact'], ['trip', 'e2e trip'], ['custom', 'e2e custom']]) {
      const filtered = await api('GET', `/api/admin/leads?${new URLSearchParams({ q: `${TAG} e2e`, kind })}`);
      assert.deepEqual(filtered.body.data.map((l) => l.name), [`${TAG} ${name}`]);
    }
    const trip = combined.body.data.find((l) => l.kind === 'trip');
    assert.equal(trip.packageSlug, rows[0].slug);
  });

  it('keeps deleted trip enquiries out of the analytics lead figures, apart from WhatsApp clicks', async () => {
    const res = await publicPost('/api/bookings', { ...bookingBody(30), name: `${TAG} analytics` }, newKey());
    const id = res.body.data.id;
    const recent = async () => (await api('GET', '/api/admin/bookings')).body.data.map((b) => b.id);
    assert.ok((await recent()).includes(id));
    const overview = await api('GET', '/api/admin/analytics/overview?days=1');
    for (const key of ['enquiries', 'contacts', 'whatsappClicks']) assert.equal(typeof overview.body.data[key], 'number', key);

    let matched = false;
    for (let attempt = 0; attempt < 3 && !matched; attempt += 1) {
      const before = (await api('GET', '/api/admin/analytics/overview?days=1')).body.data.enquiries;
      await api('DELETE', `/api/admin/leads/${lead('booking', id)}`);
      const afterDelete = (await api('GET', '/api/admin/analytics/overview?days=1')).body.data.enquiries;
      matched = afterDelete === before - 1;
      if (!matched) await api('POST', `/api/admin/leads/${lead('booking', id)}/restore`);
    }
    assert.ok(matched, 'a soft-deleted enquiry leaves the persisted-lead count');
    assert.equal((await recent()).includes(id), false);
  });
});

// ── failures ────────────────────────────────────────────────────────

describe('database failures', () => {
  const run = async (pool) => {
    const app = express();
    app.use(express.json());
    app.use('/leads', createLeadsRouter(pool, { requireAuth: (req, res, next) => { req.admin = { id: 1, username: 'x' }; next(); } }));
    const srv = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
      const url = `http://127.0.0.1:${srv.address().port}/leads`;
      const listRes = await fetch(url);
      const statusRes = await fetch(`${url}/contact-1/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'CLOSED' }) });
      return { list: listRes.status, listBody: await listRes.json(), status: statusRes.status };
    } finally {
      srv.close();
    }
  };

  it('answers 503 when PostgreSQL is unreachable', async () => {
    const down = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
    const failing = { query: async () => { throw down; }, connect: async () => { throw down; } };
    const res = await run(failing);
    assert.equal(res.list, 503);
    assert.equal(res.listBody.code, 'SERVICE_UNAVAILABLE');
    assert.equal(res.status, 503);
  });

  it('answers a generic 500, without details, for other database errors', async () => {
    const broken = Object.assign(new Error('column "secret_value" does not exist'), { code: '42703' });
    const res = await run({ query: async () => { throw broken; }, connect: async () => { throw broken; } });
    assert.equal(res.list, 500);
    assert.equal(JSON.stringify(res.listBody).includes('secret_value'), false);
  });
});

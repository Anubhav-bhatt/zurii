/**
 * Phase 6 — lead attribution (ZT-16) and the campaign report.
 *
 * Through the real server on zurii_test (migrated by the runner, through 0005):
 *   - each form stores its own visitor's attribution, field by field validated
 *   - malformed or personal attribution is dropped, never failing the lead
 *   - no attribution → nothing stored ("not captured"), never guessed
 *   - Plan My Trip records the chosen destination
 *   - an idempotent retry stores one row
 *   - the campaign report: authenticated, no-store, correct per-campaign counts,
 *     paginated, and leads/WhatsApp/confirmed kept apart
 *
 * Every row carries this run's email domain and campaign tag and is removed afterwards.
 */
// First import: refuses to run unless started by `npm test` against the verified zurii_test database.
import { assertTestDatabase } from './helpers/testDatabaseGuard.mjs';
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import jwt from 'jsonwebtoken';

import poolModule from '../db/pool.js';
import attributionModule from '../lib/attribution.js';

const { getPool } = poolModule;
const { parseAttribution, classifyChannel } = attributionModule;
const RUN = crypto.randomBytes(4).toString('hex');
const DOMAIN = `attr-${RUN}.test`;
const CAMPAIGN = `zzcamp-${RUN}`;
const pool = getPool();

let child;
let base;
let token;
let adminId;
let packageSlug;
let seq = 0;

before(async () => {
  await assertTestDatabase(pool);
  const { rows } = await pool.query(
    `INSERT INTO admins (username, password_hash, must_change_password) VALUES ($1, 'x', false) RETURNING id`, [`zzattr-${RUN}`]
  );
  adminId = rows[0].id;
  token = jwt.sign({ id: adminId, username: `zzattr-${RUN}`, tokenVersion: 0, mustChangePassword: false }, process.env.JWT_SECRET, { expiresIn: '15m' });
  packageSlug = (await pool.query(`SELECT slug FROM packages WHERE status = 'PUBLISHED' ORDER BY slug LIMIT 1`)).rows[0].slug;

  const port = 6400 + Math.floor(Math.random() * 90);
  base = `http://127.0.0.1:${port}`;
  child = spawn('node', ['server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port), TRUST_PROXY: '1' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`${base}/api/health`)).status) break; } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
});

after(async () => {
  child?.kill('SIGTERM');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL zurii.lead_history_maintenance = 'on'`);
    await client.query(`DELETE FROM lead_activity WHERE contact_id IN (SELECT id FROM contacts WHERE email LIKE $1)
                          OR booking_id IN (SELECT id FROM bookings WHERE email LIKE $1)`, [`%@${DOMAIN}`]);
    await client.query('DELETE FROM contacts WHERE email LIKE $1', [`%@${DOMAIN}`]);
    await client.query('DELETE FROM bookings WHERE email LIKE $1', [`%@${DOMAIN}`]);
    await client.query('DELETE FROM admin_audit_logs WHERE admin_id = $1', [adminId]);
    await client.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  await pool.end();
});

/** Each submission from its own address, so the per-client lead limiter never interferes. */
const post = (url, body, headers = {}) => {
  seq += 1;
  return fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `198.18.${Math.floor(seq / 250)}.${seq % 250 + 1}`, ...headers },
    body: JSON.stringify(body),
  });
};
const contact = (who, extra = {}) => ({ name: `Attr ${who}`, email: `${who}@${DOMAIN}`, phone: '+91 90000 11122', message: 'Synthetic attribution test.', ...extra });
const booking = (who, extra = {}) => ({ name: `Attr ${who}`, email: `${who}@${DOMAIN}`, phone: '+91 90000 11123', travellers: 2, message: 'Synthetic attribution test.', ...extra });
const row = async (table, who) => (await pool.query(`SELECT * FROM ${table} WHERE email = $1`, [`${who}@${DOMAIN}`])).rows;

describe('attribution parsing', () => {
  it('classifies channels from the strongest signal down', () => {
    const c = (a) => classifyChannel({ ...a });
    assert.equal(c({ clickIdType: 'gclid', referrerHost: 'www.google.com' }), 'paid_search', 'auto-tagged Google Ads is not organic');
    assert.equal(c({ utmMedium: 'CPC', utmSource: 'google' }), 'paid_search');
    assert.equal(c({ utmMedium: 'paid_social', utmSource: 'facebook' }), 'paid_social');
    assert.equal(c({ utmMedium: 'email' }), 'email');
    assert.equal(c({ utmSource: 'partner-site' }), 'other_campaign');
    assert.equal(c({ clickIdType: 'fbclid' }), 'social');
    assert.equal(c({ referrerHost: 'www.bing.com' }), 'organic_search');
    assert.equal(c({ referrerHost: 'l.instagram.com' }), 'social');
    assert.equal(c({ referrerHost: 'blog.example.org' }), 'referral');
    assert.equal(c({}), 'direct');
  });

  it('drops malformed and personal values field by field, and never throws', () => {
    const a = parseAttribution({
      submissionSource: 'evil', destinationSlug: '../etc',
      attribution: {
        utmSource: '  Google  ', utmMedium: 7, utmCampaign: 'x'.repeat(500), utmContent: 'jane@example.com', utmTerm: 'call 98765 43210',
        referrerHost: 'https://evil.example/path', landingPage: '/trip/bali?email=a@b.co', clickIdType: 'msclkid',
      },
    });
    assert.equal(a.utmSource, 'Google');
    assert.equal(a.utmMedium, null);
    assert.equal(a.utmCampaign.length, 100);
    assert.equal(a.utmContent, null, 'email dropped');
    assert.equal(a.utmTerm, null, 'phone number dropped');
    assert.equal(a.referrerHost, null);
    assert.equal(a.landingPage, '/trip/bali', 'query string dropped');
    assert.equal(a.clickIdType, null);
    assert.equal(a.submissionSource, null);
    assert.equal(a.destinationSlug, null);
    assert.equal(parseAttribution(null).captured, false);
    assert.equal(parseAttribution({ attribution: 'x' }).captured, false);
  });
});

describe('leads store their own attribution', () => {
  it('contact form: UTM tags, referrer host, landing page, form and channel', async () => {
    const res = await post('/api/contact', contact('c1', {
      submissionSource: 'contact_page',
      attribution: { utmSource: 'newsletter', utmMedium: 'email', utmCampaign: CAMPAIGN, referrerHost: 'mail.example.com', landingPage: '/destination/kashmir' },
    }));
    assert.equal(res.status, 201);
    const [r] = await row('contacts', 'c1');
    assert.deepEqual(
      [r.utm_source, r.utm_medium, r.utm_campaign, r.referrer_host, r.landing_page, r.submission_source, r.attribution_channel, r.click_id_type],
      ['newsletter', 'email', CAMPAIGN, 'mail.example.com', '/destination/kashmir', 'contact_page', 'email', null]
    );
  });

  it('trip enquiry from an auto-tagged Google Ads click is paid search, and no click id value is kept', async () => {
    const res = await post('/api/bookings', booking('b1', {
      packageSlug, submissionSource: 'trip_enquiry',
      attribution: { clickIdType: 'gclid', referrerHost: 'www.google.com', landingPage: `/trip/${packageSlug}`, gclid: 'Cj0KCQ-secret' },
    }));
    assert.equal(res.status, 201);
    const [r] = await row('bookings', 'b1');
    assert.equal(r.attribution_channel, 'paid_search');
    assert.equal(r.click_id_type, 'gclid');
    assert.equal(r.submission_source, 'trip_enquiry');
    assert.ok(!JSON.stringify(r).includes('Cj0KCQ-secret'));
  });

  it('Plan My Trip records the chosen destination and organic search', async () => {
    const res = await post('/api/bookings', booking('b2', {
      destinationSlug: 'kashmir', submissionSource: 'plan_my_trip',
      attribution: { referrerHost: 'www.google.com', landingPage: '/', utmCampaign: CAMPAIGN, utmSource: 'google', utmMedium: 'organic' },
    }));
    assert.equal(res.status, 201);
    const [r] = await row('bookings', 'b2');
    const kashmir = (await pool.query(`SELECT id FROM destinations WHERE slug = 'kashmir'`)).rows[0]?.id ?? null;
    assert.equal(r.destination_id, kashmir);
    assert.equal(r.package_id, null);
    assert.equal(r.submission_source, 'plan_my_trip');
  });

  it('bad attribution never costs the lead', async () => {
    const res = await post('/api/bookings', booking('b3', { destinationSlug: 'no-such-place', submissionSource: 42, attribution: { utmSource: { $gt: '' }, landingPage: 'javascript:alert(1)' } }));
    assert.equal(res.status, 201);
    const [r] = await row('bookings', 'b3');
    assert.deepEqual([r.utm_source, r.landing_page, r.destination_id, r.submission_source, r.attribution_channel], [null, null, null, null, 'direct']);
  });

  it('a lead sent without attribution stores none ("not captured")', async () => {
    assert.equal((await post('/api/contact', contact('c2'))).status, 201);
    const [r] = await row('contacts', 'c2');
    assert.deepEqual([r.attribution_channel, r.utm_source, r.submission_source], [null, null, null]);
  });

  it('an idempotent retry with the same key stores one lead', async () => {
    const key = `attr-${RUN}-retry-key-0001`;
    const body = contact('c3', { submissionSource: 'contact_page', attribution: { utmCampaign: CAMPAIGN, utmSource: 'facebook', utmMedium: 'paid_social' } });
    const first = await post('/api/contact', body, { 'Idempotency-Key': key });
    const second = await post('/api/contact', body, { 'Idempotency-Key': key });
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(second.headers.get('idempotent-replayed'), 'true');
    assert.equal((await row('contacts', 'c3')).length, 1);
  });

  it('the CRM lead detail shows where the lead came from', async () => {
    const [r] = await row('contacts', 'c1');
    const res = await fetch(`${base}/api/admin/leads/contact-${r.id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.lead.attribution.channel, 'email');
    assert.equal(data.lead.attribution.utmCampaign, CAMPAIGN);
    assert.equal(data.lead.attribution.submissionSource, 'contact_page');
  });
});

describe('campaign report', () => {
  const report = (query = '') => fetch(`${base}/api/admin/analytics/campaigns?days=7${query}`, { headers: { Authorization: `Bearer ${token}` } });

  it('requires an admin and is never cached', async () => {
    assert.equal((await fetch(`${base}/api/admin/analytics/campaigns`)).status, 401);
    const res = await report();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });

  it('counts this run\'s campaign per source and medium, and keeps the figures apart', async () => {
    const { data } = await (await report('&limit=50')).json();
    const mine = data.campaigns.rows.filter((r) => r.campaign === CAMPAIGN);
    const by = Object.fromEntries(mine.map((r) => [`${r.source}/${r.medium}`, r.leads]));
    assert.deepEqual(by, { 'newsletter/email': 1, 'google/organic': 1, 'facebook/paid_social': 1 });
    for (const key of ['sessions', 'events', 'whatsappClicks', 'leads', 'attributedLeads', 'confirmedLeads']) {
      assert.equal(typeof data.totals[key], 'number', key);
    }
    assert.equal(data.totals.salesTracked, false);
    assert.ok(data.totals.leads >= 6 && data.totals.attributedLeads >= 5);
    assert.ok(data.byForm.some((f) => f.form === 'plan_my_trip' && f.leads >= 1));
    assert.ok(data.byTrip.some((t) => t.kind === 'destination' && t.slug === 'kashmir'));
    assert.ok(data.bySource.some((s) => s.source === 'newsletter'));
    assert.equal(data.trend.length, 7);
    assert.ok(data.trend.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)));
  });

  it('paginates campaigns on the server', async () => {
    const all = (await (await report('&limit=50')).json()).data.campaigns;
    const one = (await (await report('&limit=1&offset=1')).json()).data.campaigns;
    assert.equal(one.rows.length, Math.min(1, Math.max(all.total - 1, 0)));
    assert.equal(one.total, all.total);
    assert.equal(one.limit, 1);
    assert.equal(one.offset, 1);
  });
});

// Phase 4: CRM helpers, the lead query builder and per-submission idempotency keys.
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  DONE_STATUSES,
  LEAD_STATUSES,
  OPEN_STATUSES,
  STATUS_LABELS,
  STATUS_STYLES,
  cleanInterest,
  dayEndIso,
  dayStartIso,
  describeActivity,
  isDone,
  leadSubject,
  mailtoHref,
  quickRange,
  whatsappHref,
  whatsappNumber,
} from '../src/components/admin/leads/leadFormat.js';
import { buildLeadQuery } from '../src/services/leadQuery.js';
import { createSubmissionKeys, newIdempotencyKey } from '../src/services/submissionKey.js';

describe('status model', () => {
  it('matches the backend: six statuses, split into open and done', () => {
    assert.deepEqual(LEAD_STATUSES, ['NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED']);
    assert.deepEqual([...OPEN_STATUSES, ...DONE_STATUSES].sort(), [...LEAD_STATUSES].sort());
    for (const s of LEAD_STATUSES) {
      assert.ok(STATUS_LABELS[s] && STATUS_STYLES[s], s);
    }
    assert.equal(isDone('CANCELLED'), true);
    assert.equal(isDone('INTERESTED'), false);
  });
});

describe('lead display helpers', () => {
  it('keeps the interest tidying the CRM always did', () => {
    assert.equal(cleanInterest('Quote Request: Bali'), 'Bali');
    assert.equal(cleanInterest('Plan Your Dream Trip now'), 'Landing Lead');
    assert.equal(cleanInterest(null), 'General');
  });

  it('names what a lead is about', () => {
    assert.equal(leadSubject({ kind: 'trip', packageTitle: 'Bali Escape' }), 'Bali Escape');
    assert.equal(leadSubject({ kind: 'custom' }), 'Custom trip');
    assert.equal(leadSubject({ kind: 'contact', interest: 'Quote Request: Paris' }), 'Paris');
  });

  it('builds WhatsApp links with a country code for 10-digit numbers', () => {
    assert.equal(whatsappNumber('98765 43210'), '919876543210');
    assert.equal(whatsappNumber('+91 98765 43210'), '919876543210');
    assert.equal(whatsappNumber(''), null);
    assert.equal(whatsappHref({ phone: '9876543210' }), 'https://wa.me/919876543210');
    const greeting = whatsappHref({ phone: '9876543210', name: 'Asha', kind: 'trip', packageTitle: 'Bali' }, { withGreeting: true });
    assert.match(greeting, /^https:\/\/wa\.me\/919876543210\?text=Hello%20Asha!/);
  });

  it('encodes the email address so it cannot inject mail headers', () => {
    const href = mailtoHref({ email: 'a@b.co?bcc=evil@x.y', kind: 'contact', interest: null });
    assert.ok(href.startsWith('mailto:a%40b.co%3Fbcc%3Devil%40x.y?subject='));
    assert.equal(mailtoHref({ email: '' }), null);
  });

  it('describes history entries', () => {
    assert.equal(describeActivity({ action: 'status_changed', fromStatus: 'NEW', toStatus: 'CONTACTED' }), 'Status New → Contacted');
    assert.equal(describeActivity({ action: 'deleted', details: { reason: 'spam' } }), 'Deleted — spam');
    assert.equal(describeActivity({ action: 'restored', details: { via: 'legacy-api' } }), 'Restored (older admin screen)');
  });

  it('turns local calendar days into instants for the server', () => {
    const start = new Date(dayStartIso('2026-03-05'));
    const end = new Date(dayEndIso('2026-03-05'));
    assert.deepEqual([start.getFullYear(), start.getMonth(), start.getDate(), start.getHours()], [2026, 2, 5, 0]);
    assert.deepEqual([end.getDate(), end.getHours(), end.getMinutes()], [5, 23, 59]);
    assert.equal(dayStartIso(''), '');
  });

  it('computes the quick date ranges in local time', () => {
    const now = new Date(2026, 4, 15, 10, 0);
    assert.deepEqual(quickRange('today', now), { from: '2026-05-15', to: '2026-05-15' });
    assert.deepEqual(quickRange('7d', now), { from: '2026-05-08', to: '2026-05-15' });
    assert.deepEqual(quickRange('last-month', now), { from: '2026-04-01', to: '2026-04-30' });
    assert.deepEqual(quickRange('all', now), { from: '', to: '' });
  });
});

describe('lead query builder', () => {
  it('sends only what differs from the defaults', () => {
    assert.equal(buildLeadQuery({ kind: 'all', status: 'all', priority: 'all', deleted: 'exclude', sort: 'newest', page: 1 }), '');
    const q = new URLSearchParams(buildLeadQuery({ kind: 'trip', status: 'open', q: '  bali  ', page: 3, pageSize: 25, deleted: 'only' }).slice(1));
    assert.deepEqual(Object.fromEntries(q), { kind: 'trip', status: 'open', q: 'bali', deleted: 'only', page: '3', pageSize: '25' });
  });

  it('encodes search text safely', () => {
    assert.equal(buildLeadQuery({ q: 'a&b=c #1' }), '?q=a%26b%3Dc+%231');
  });
});

describe('submission keys (duplicate protection)', () => {
  it('generates RFC 4122 v4 keys with or without randomUUID', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert.match(newIdempotencyKey(), uuid);
    const noRandomUUID = { getRandomValues: (bytes) => bytes.fill(7) };
    assert.match(newIdempotencyKey(noRandomUUID), uuid);
  });

  it('reuses one key while the contents are unchanged, and starts a new one after success or an edit', () => {
    let n = 0;
    const keys = createSubmissionKeys(() => `key-${(n += 1)}`);
    const payload = { name: 'Asha', phone: '98765 43210', message: 'Bali in May' };
    assert.equal(keys.keyFor(payload), 'key-1');
    assert.equal(keys.keyFor({ message: 'Bali in May', phone: '98765 43210', name: 'Asha' }), 'key-1', 'retry: same key');
    assert.equal(keys.keyFor({ ...payload, message: 'Bali in June' }), 'key-2', 'edited: new enquiry');
    keys.succeeded();
    assert.equal(keys.keyFor({ ...payload, message: 'Bali in June' }), 'key-3', 'after success: new enquiry');
  });
});

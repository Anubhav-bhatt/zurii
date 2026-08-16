/**
 * Security regression tests.
 *
 * Each case here corresponds to a finding from the security audit, so a future
 * refactor that reopens one of them fails the suite rather than shipping.
 *
 * These run against the app's real middleware stack (helmet, the CORS
 * allowlist, the limiters) using supertest-free plain `fetch` against an
 * ephemeral server, so they exercise the same code path a browser would.
 */
import { strict as assert } from 'node:assert';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';

import security from '../middleware/security.js';
import validateEventModule from '../lib/validateEvent.js';

const { corsOptions, helmetOptions, corsOrigin } = security;
const { validateEvent } = validateEventModule;

// middleware/auth.js captures JWT_SECRET at module load. ESM hoists every static
// import above the before() hook, so importing it at the top would freeze the
// secret as undefined and every token — valid or not — would be rejected. It is
// therefore imported dynamically, after the env var is set.
//
// Worth noting for the audit: that load-time capture makes requireAuth
// fail-closed when JWT_SECRET is missing, and server.js exits at boot in the
// same case. Both are the safe direction.
let requireAuth;

/**
 * requireAuth now reads `admins.token_version` to enforce revocation, so it
 * needs a pool. A stub keeps this suite free of a database: it answers the one
 * query the middleware makes, with a token_version that matches the tokens
 * signed below. Revocation itself is covered against the real database in
 * tests/adminSecurity.test.mjs.
 */
const STUB_TOKEN_VERSION = 0;
const stubPool = {
  query: async (sql, params) => {
    if (/FROM admins WHERE id/.test(sql)) {
      return params[0] === 1
        ? { rows: [{ id: 1, username: 'stub-admin', token_version: STUB_TOKEN_VERSION }] }
        : { rows: [] };
    }
    // Audit inserts: accepted and discarded.
    return { rows: [] };
  },
};

/**
 * A miniature app wired with the same security middleware as server.js and one
 * protected route, so the tests never depend on a live database.
 */
function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet(helmetOptions));
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '32kb' }));
  // Wrapped so the route resolves requireAuth at request time, after before()
  // has assigned it.
  app.get('/protected', (req, res, next) => requireAuth(req, res, next), (req, res) =>
    res.json({ success: true, data: { secret: 'admin-only' } })
  );
  app.get('/public', (req, res) => res.json({ success: true, data: [] }));
  return app;
}

let server;
let base;

before(async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-security-suite';
  const { createRequireAuth } = (await import('../middleware/auth.js')).default;
  requireAuth = createRequireAuth(stubPool);
  await new Promise((resolve) => {
    server = buildApp().listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => server?.close());

describe('authorization', () => {
  it('rejects a protected route with no Authorization header', async () => {
    const res = await fetch(`${base}/protected`);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.data, undefined, 'a 401 must not carry protected data');
  });

  it('rejects a non-Bearer scheme', async () => {
    const res = await fetch(`${base}/protected`, { headers: { Authorization: 'Basic YWRtaW46YWRtaW4=' } });
    assert.equal(res.status, 401);
  });

  it('rejects an alg:none forged token', async () => {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 1, username: 'admin' })}.`;
    const res = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${forged}` } });
    assert.equal(res.status, 401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign({ id: 1, username: 'admin' }, 'not-the-real-secret');
    const res = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 401);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ id: 1, username: 'admin' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const res = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 401);
    assert.equal((await res.json()).code, 'TOKEN_EXPIRED');
  });

  it('accepts a validly signed token', async () => {
    // tokenVersion must match the stub pool's row, or revocation rejects it.
    const token = jwt.sign(
      { id: 1, username: 'admin', tokenVersion: STUB_TOKEN_VERSION },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await fetch(`${base}/protected`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
  });
});

describe('CORS allowlist', () => {
  it('does not reflect an arbitrary origin', async () => {
    const res = await fetch(`${base}/public`, { headers: { Origin: 'https://evil.example.com' } });
    assert.notEqual(res.headers.get('access-control-allow-origin'), 'https://evil.example.com');
  });

  it('allows a localhost dev origin', async () => {
    const res = await fetch(`${base}/public`, { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  it('allows requests with no Origin (same-origin / server-to-server)', (t, done) => {
    corsOrigin(undefined, (err, allowed) => {
      assert.equal(err, null);
      assert.equal(allowed, true);
      done();
    });
  });

  it('honours ALLOWED_ORIGINS for a production origin', (t, done) => {
    const previous = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://zurii.example';
    corsOrigin('https://zurii.example', (err, allowed) => {
      process.env.ALLOWED_ORIGINS = previous;
      assert.equal(allowed, true);
      done();
    });
  });

  // The way this is actually mistyped in a dashboard. An Origin header is
  // scheme + host + port and never carries a trailing slash, but the address
  // bar shows one and copying the URL gives you one — and the config validator
  // accepts it, because `new URL('https://x/').pathname` is '/' and the no-path
  // rule is satisfied. Before the entries were canonicalised, that single
  // character blocked every browser request while the server booted healthy and
  // answered curl with 200: a production outage with nothing in the logs.
  const equivalent = [
    ['a trailing slash', 'https://zurii.example/'],
    ['an uppercase host', 'https://ZURII.example'],
    ['a redundant default port', 'https://zurii.example:443'],
  ];

  for (const [label, configured] of equivalent) {
    it(`matches a browser Origin when configured with ${label}`, (t, done) => {
      const previous = process.env.ALLOWED_ORIGINS;
      process.env.ALLOWED_ORIGINS = configured;
      corsOrigin('https://zurii.example', (err, allowed) => {
        process.env.ALLOWED_ORIGINS = previous;
        assert.equal(err, null);
        assert.equal(allowed, true, `${configured} must match the origin a browser sends`);
        done();
      });
    });
  }

  it('still refuses a genuinely different origin after canonicalisation', (t, done) => {
    const previous = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = 'https://zurii.example/';
    // Normalising must not become "close enough is fine": a different host, a
    // different scheme and a non-default port all remain separate origins.
    const checks = ['https://evil.example', 'http://zurii.example', 'https://zurii.example:8443'];
    let remaining = checks.length;
    for (const origin of checks) {
      corsOrigin(origin, (err, allowed) => {
        assert.equal(allowed, false, `${origin} must stay refused`);
        remaining -= 1;
        if (remaining === 0) {
          process.env.ALLOWED_ORIGINS = previous;
          done();
        }
      });
    }
  });
});

describe('security headers', () => {
  it('does not advertise Express', async () => {
    const res = await fetch(`${base}/public`);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('sets a restrictive CSP and anti-framing on API responses', async () => {
    const res = await fetch(`${base}/public`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header must be present');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('referrer-policy'));
  });
});

describe('analytics event validation (public, untrusted input)', () => {
  it('rejects an event type outside the allowlist', () => {
    assert.equal(validateEvent({ visitorId: 'abcdefgh1234', type: 'evil_event' }).valid, false);
  });

  it('rejects a visitor id that is not the expected shape', () => {
    for (const id of ['../../etc/passwd', "' OR 1=1--", 'short', '<script>alert(1)</script>']) {
      assert.equal(validateEvent({ visitorId: id, type: 'package_view' }).valid, false, `should reject ${id}`);
    }
  });

  it('rejects metadata over the size cap', () => {
    const result = validateEvent({ visitorId: 'abcdefgh1234', type: 'package_view', meta: { blob: 'x'.repeat(5000) } });
    assert.equal(result.valid, false);
  });

  it('accepts a well-formed event', () => {
    assert.equal(validateEvent({ visitorId: 'abcdefgh1234', type: 'package_view', entitySlug: 'bali-romantic-escape' }).valid, true);
  });
});

describe('rate limiters are configured for the abuse-sensitive routes', () => {
  it('exports a login limiter, a lead limiter and a refresh limiter', () => {
    for (const name of ['loginLimiter', 'leadLimiter', 'refreshLimiter']) {
      assert.equal(typeof security[name], 'function', `${name} must be middleware`);
    }
  });

  it('returns 429 with a JSON body once the ceiling is crossed', async () => {
    const app = express();
    app.use(express.json());
    // A one-request ceiling keeps the test fast and deterministic.
    const rateLimit = (await import('express-rate-limit')).default;
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 1,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ success: false, error: 'Too many requests.' }),
    });
    app.post('/limited', limiter, (req, res) => res.status(201).json({ success: true }));

    const srv = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const url = `http://127.0.0.1:${srv.address().port}/limited`;
    const first = await fetch(url, { method: 'POST' });
    const second = await fetch(url, { method: 'POST' });
    srv.close();

    assert.equal(first.status, 201);
    assert.equal(second.status, 429);
    assert.equal((await second.json()).success, false);
  });
});

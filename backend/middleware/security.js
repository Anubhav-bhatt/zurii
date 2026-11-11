/**
 * Cross-cutting security middleware: CORS origin policy, response headers and
 * the abuse limiters for the endpoints anonymous visitors can reach.
 *
 * Everything here is deliberately proportional to Zurii V1 — no WAF, no Redis,
 * no CAPTCHA. The guest-first contract is preserved: browsing, searching,
 * wishlist, enquiries and contact all stay open to anonymous visitors.
 */

const rateLimit = require('express-rate-limit');
// Normalizes an IPv6 address to its /56 prefix (the library default — a typical
// residential delegation). Keying on the raw address would let one IPv6 client
// rotate through billions of addresses in its own prefix and walk straight past
// a per-IP limit; express-rate-limit refuses to start with a custom
// keyGenerator that ignores this. IPv4 addresses are used as they are.
const { ipKeyGenerator } = require('express-rate-limit');
const { log } = require('../lib/logger');
const { routeOf } = require('./requestLog');

// ── CORS ────────────────────────────────────────────────────────────
//
// This used to be `cors({ origin: true, credentials: true })`. `origin: true`
// reflects whatever Origin the caller sends, so every website on the internet
// received `Access-Control-Allow-Origin: <their own origin>` *together with*
// `Access-Control-Allow-Credentials: true` — a verified misconfiguration
// (probed with Origin: https://evil.example.com, which was reflected verbatim).
//
// Today the only credentialed route is POST /api/auth/refresh, and the refresh
// cookie is SameSite=Lax, so a browser will not attach it to a cross-site POST
// — that is what stopped this from being an immediate admin-token theft. But
// that leaves one browser default as the only thing between an attacker page
// and an admin access token: change SameSite, add a sibling subdomain, or move
// any auth to a cookie, and it becomes account takeover. An allowlist removes
// the dependency entirely.
//
// Configure with ALLOWED_ORIGINS (comma-separated) in production. Local dev
// ports are always allowed so `npm run dev` needs no configuration.
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173', // vite preview
  'http://localhost:3000',
  'http://localhost:8080', // docker compose default WEB_PORT
  'http://127.0.0.1:8080',
];

/**
 * The effective allowlist.
 *
 * DEV_ORIGINS are folded in only OUTSIDE production. They used to be added
 * unconditionally, which meant a production deployment permanently trusted
 * http://localhost:5173 and five sibling ports: any page an admin could be
 * induced to load from one of those origins — a locally running dev server, a
 * malicious app bound to that port — was granted credentialed access to the
 * live API. In production the allowlist is exactly what ALLOWED_ORIGINS says,
 * which config/env.js requires to be set there for precisely this reason.
 */
/**
 * Reduce a configured entry to the exact string a browser puts in `Origin`.
 *
 * An Origin header is scheme + host + port and nothing else — never a trailing
 * slash. But `https://zurii.vercel.app/` is what a person naturally writes,
 * because it is what the address bar shows and what copying the URL gives you.
 * The comparison below is a Set lookup on the exact string, so that one
 * character used to be the difference between a working deployment and a site
 * where every request is blocked.
 *
 * It failed in the worst possible way: the config validator accepts it, since
 * `new URL('https://x/').pathname` is `'/'` and the no-path rule is satisfied;
 * the server boots reporting healthy; the API answers 200 to curl; and only a
 * real browser refuses, with a CORS error naming an origin that looks
 * identical to the configured one. Nothing in the logs says which character is
 * wrong.
 *
 * `new URL(o).origin` normalises all of it — trailing slash, an accidental
 * path, uppercase in the host, a redundant :443 — to the canonical form.
 * Malformed values are left as-is for the Set to simply not match, because
 * config/env.js has already rejected them at startup.
 */
function canonicalOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return value;
  }
}

function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map(canonicalOrigin);
  if (process.env.NODE_ENV === 'production') return new Set(configured);
  return new Set([...configured, ...DEV_ORIGINS]);
}

/**
 * cors `origin` callback.
 *
 * A request with no Origin header (same-origin fetch, curl, a health probe,
 * server-to-server) is allowed: CORS exists to restrain *browsers acting on
 * behalf of another site*, and rejecting origin-less requests would break the
 * nginx-proxied same-origin deployment where the browser sends no Origin.
 */
function corsOrigin(origin, callback) {
  if (!origin) return callback(null, true);
  if (allowedOrigins().has(origin)) return callback(null, true);
  // Not an error object: an error here becomes a 500. Refusing the CORS headers
  // is enough — the browser then blocks the caller from reading the response.
  return callback(null, false);
}

const corsOptions = {
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  // Idempotency-Key: duplicate-submission protection on the public lead forms
  // (lib/idempotency.js), needed when the frontend calls the API cross-origin.
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  credentials: true,
  maxAge: 600,
};

// ── Response headers ────────────────────────────────────────────────
//
// This is a JSON API: it serves no HTML, so the CSP here only has to make a
// stray HTML response inert, not accommodate the React app (nginx serves that
// and owns its own headers). `default-src 'none'` plus `frame-ancestors 'none'`
// is therefore both the strictest and the safest choice — it cannot break
// Zurii's images or API calls, because the API renders no documents.
const helmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'none'"],
    },
  },
  // Cross-origin *reads* of public catalogue JSON are legitimate (and CORS
  // already governs credentialed access), so COEP/CORP are left off rather
  // than breaking the API for no gain.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  // HSTS is only meaningful over TLS and is actively harmful to pin from a
  // plain-HTTP dev server, so it is enabled by NODE_ENV=production only.
  hsts:
    process.env.NODE_ENV === 'production'
      ? { maxAge: 15552000, includeSubDomains: true, preload: false }
      : false,
};

// ── Abuse limiters ──────────────────────────────────────────────────
//
// express-rate-limit's in-memory store is the right size for a single-process
// V1: no Redis, and a restart clearing the counters is acceptable for these
// thresholds. If the app is ever scaled to multiple backend replicas these
// become per-replica, which is documented in DEPLOYMENT.md.
//
// Every limiter keys on clientKey(req). req.ip honours X-Forwarded-For only for
// the number of proxy hops TRUST_PROXY declares (server.js), so a header a
// visitor sends cannot choose their bucket; whether that hop count is right for
// a deployment is a production check (DEPLOYMENT.md, "Client IP and rate
// limits"). If it is wrong, unrelated visitors share the proxy's bucket.

/** Bucket key for a client: its IPv4 address, or its IPv6 /56 prefix. */
const clientKey = (req) => (req.ip ? ipKeyGenerator(req.ip) : 'unknown');

/** Refusals per limiter since this process started (reported in each log line). */
const rateLimitCounts = new Map();

/**
 * One 429 shape for every limiter: JSON body, Retry-After and RateLimit
 * headers — and one structured `rate_limited` log line per refusal, so a
 * refused login or enquiry is never silent to the operator. A burst of lead
 * refusals during a campaign means visitors share an address (carrier NAT, or
 * a proxy that hides client IPs — see DEPLOYMENT.md). No IP, username or form
 * data is logged.
 */
const limitJson = (message, limiter) => ({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    const count = (rateLimitCounts.get(limiter) ?? 0) + 1;
    rateLimitCounts.set(limiter, count);
    log.warn('rate_limited', { reqId: req.id, limiter, route: routeOf(req), count });
    return res.status(429).json({ success: false, error: message, code: 'RATE_LIMITED' });
  },
});

/**
 * Sign-in policy (ZT-08 / ZT-09). Every attempt costs one bcrypt-12 comparison
 * (~0.2 s of CPU, measured locally), whether or not the username exists.
 *
 *   lockThreshold / lockMinutes   the account lock in PostgreSQL (server.js):
 *                                 5 consecutive failures lock the account for
 *                                 15 minutes, from any number of networks.
 *   perAccountPerClient           failures one client may make against one
 *                                 username per window. Deliberately BELOW
 *                                 lockThreshold: a single client cannot trip
 *                                 the account lock on its own, so keeping an
 *                                 admin locked out now needs several networks
 *                                 rather than five requests every 15 minutes.
 *   perClient                     failures one client may make across ALL
 *                                 usernames per window, so rotating usernames
 *                                 no longer buys unlimited bcrypt work.
 *
 * Only failures count (skipSuccessfulRequests), so an admin who signs in
 * normally never approaches either ceiling.
 */
const LOGIN_POLICY = Object.freeze({
  windowMinutes: 15,
  perAccountPerClient: 4,
  perClient: 20,
  lockThreshold: 5,
  lockMinutes: 15,
});

/** Public enquiry forms: submissions per client per window (bookings + contact). */
const LEAD_POLICY = Object.freeze({ windowMinutes: 10, perClient: 30 });

const normalizedUsername = (req) =>
  typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase().slice(0, 64) : '';

function createLoginClientLimiter() {
  return rateLimit({
    windowMs: LOGIN_POLICY.windowMinutes * 60 * 1000,
    limit: LOGIN_POLICY.perClient,
    skipSuccessfulRequests: true,
    keyGenerator: clientKey,
    ...limitJson('Too many failed login attempts. Please try again in a few minutes.', 'login_client'),
  });
}

function createLoginAccountLimiter() {
  return rateLimit({
    windowMs: LOGIN_POLICY.windowMinutes * 60 * 1000,
    limit: LOGIN_POLICY.perAccountPerClient,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${clientKey(req)}|${normalizedUsername(req)}`,
    ...limitJson('Too many failed login attempts. Please try again in a few minutes.', 'login_account'),
  });
}

/**
 * Public lead forms (enquiries + contact), one shared bucket per client.
 *
 * Sized for advertising traffic rather than for a single household: mobile
 * carriers put many unrelated visitors behind one IPv4 address (carrier-grade
 * NAT), and a false 429 costs a real lead. 30 per 10 minutes still stops
 * scripted flooding, and the 429 message points to WhatsApp so a blocked
 * visitor is never left without a way to reach the team.
 */
function createLeadLimiter() {
  return rateLimit({
    windowMs: LEAD_POLICY.windowMinutes * 60 * 1000,
    limit: LEAD_POLICY.perClient,
    keyGenerator: clientKey,
    ...limitJson('Too many submissions from this network. Please try again shortly, or reach us on WhatsApp.', 'lead'),
  });
}

const loginClientLimiter = createLoginClientLimiter();
const loginLimiter = createLoginAccountLimiter();
const leadLimiter = createLeadLimiter();

/**
 * Token refresh. Cheap, but it mints access tokens, so it should not be an
 * unbounded oracle for anyone holding a cookie.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  keyGenerator: clientKey,
  ...limitJson('Too many refresh attempts. Please log in again.', 'refresh'),
});

module.exports = {
  corsOptions,
  corsOrigin,
  helmetOptions,
  clientKey,
  LOGIN_POLICY,
  LEAD_POLICY,
  createLoginClientLimiter,
  createLoginAccountLimiter,
  createLeadLimiter,
  loginClientLimiter,
  loginLimiter,
  leadLimiter,
  refreshLimiter,
  DEV_ORIGINS,
};

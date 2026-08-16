/**
 * Cross-cutting security middleware: CORS origin policy, response headers and
 * the abuse limiters for the endpoints anonymous visitors can reach.
 *
 * Everything here is deliberately proportional to Zurii V1 — no WAF, no Redis,
 * no CAPTCHA. The guest-first contract is preserved: browsing, searching,
 * wishlist, enquiries and contact all stay open to anonymous visitors.
 */

const rateLimit = require('express-rate-limit');
// Normalizes an IPv6 address to its /64 subnet. Keying on the raw address would
// let one IPv6 client rotate through billions of addresses in its own prefix and
// walk straight past a per-IP limit; express-rate-limit refuses to start with a
// custom keyGenerator that ignores this.
const { ipKeyGenerator } = require('express-rate-limit');

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
  allowedHeaders: ['Content-Type', 'Authorization'],
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
// become per-replica, which is documented in the security report.

const limitJson = (message) => ({
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, error: message }),
});

/**
 * Admin login. Verified vulnerable before this: eight consecutive failed
 * logins all returned 401 with no throttling, so an offline-speed online
 * guessing attack was possible against a known username.
 *
 * Keyed on IP + username so one attacker cannot lock out every admin by
 * hammering a single IP, and a distributed attack on one account still hits
 * the per-account ceiling. Successful logins are not counted, so an admin who
 * signs in normally is never throttled.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.toLowerCase().slice(0, 64) : '';
    return `${ipKeyGenerator(req.ip)}|${username}`;
  },
  ...limitJson('Too many failed login attempts. Please try again in a few minutes.'),
});

/**
 * Public lead forms (enquiries + contact). Verified unprotected before this:
 * twelve rapid submissions were all accepted with 201.
 *
 * The ceiling is deliberately generous — a real household comparing trips may
 * legitimately send several enquiries, and a false 429 costs a real lead. It
 * only stops scripted flooding.
 */
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  ...limitJson('Too many submissions from this network. Please try again shortly, or reach us on WhatsApp.'),
});

/**
 * Token refresh. Cheap, but it mints access tokens, so it should not be an
 * unbounded oracle for anyone holding a cookie.
 */
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  ...limitJson('Too many refresh attempts. Please log in again.'),
});

module.exports = {
  corsOptions,
  corsOrigin,
  helmetOptions,
  loginLimiter,
  leadLimiter,
  refreshLimiter,
  DEV_ORIGINS,
};

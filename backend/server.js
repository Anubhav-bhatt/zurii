require('dotenv').config();

// Configuration is validated BEFORE anything else is required.
//
// Order matters: middleware/auth.js captures JWT_SECRET at module load, and
// db/pool.js reads DATABASE_URL. Validating first means a misconfigured
// deployment fails with one clear list of problems instead of surfacing later
// as an undefined signing key or an unparseable connection string.
const { loadConfig } = require('./config/env');

let config;
try {
  config = loadConfig();
} catch (err) {
  // The message names variables and rules only — never values. See config/env.js.
  console.error(err.message);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { getPool, buildConfig, isUnverifiedTls } = require('./db/pool');
const { ensureBaseSchema } = require('./db/baseSchema');
const { requireAuth, requireAuthAllowPasswordChange } = require('./middleware/auth');
const createTravelRouter = require('./routes/travel');
const createBookingsRouter = require('./routes/bookings');
const createAnalyticsRouter = require('./routes/analytics');
const createAdminAnalyticsRouter = require('./routes/adminAnalytics');
const createHealthRouter = require('./routes/health');
const { extractAttribution } = require('./lib/validateEvent');
const {
  corsOptions,
  helmetOptions,
  loginLimiter,
  leadLimiter,
  refreshLimiter,
} = require('./middleware/security');
const { AUDIT_EVENTS, FAILURE_REASONS, recordAuditEvent } = require('./lib/adminAudit');
const { validateAdminPassword } = require('./lib/validateAdminPassword');

// ── Account-level login throttle ────────────────────────────────────
//
// Layer 2 behind the in-memory IP+username limiter. That limiter is fast and
// keeps the database out of the hot path, but its counters live in the process:
// a restart, a crash or a deploy handed an attacker a brand-new guessing budget.
// These counters live in `admins`, so they survive all three.
//
// The lock is temporary by design — never permanent — so a locked-out admin
// always recovers without operator intervention.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const app = express();

// Behind a reverse proxy (nginx, a container ingress), req.ip is the proxy's
// address for every visitor, so the analytics rate limit would throttle the
// whole site as one caller. Opt-in via env (TRUST_PROXY=1 → one hop) because
// trusting X-Forwarded-For on a directly-exposed server lets callers spoof
// their bucket key instead.
if (config.trustProxy !== null) {
  app.set('trust proxy', config.trustProxy);
}
const port = config.port;

// JWT Configuration. Both secrets are guaranteed present, long enough and
// distinct by loadConfig() above, so there is no re-check here.
const JWT_SECRET = config.jwtSecret;
const JWT_REFRESH_SECRET = config.jwtRefreshSecret;
const ACCESS_TOKEN_EXPIRY = '15m';   // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';   // 7 days

// Middleware
//
// Fingerprinting: Express advertises itself in X-Powered-By on every response.
// It tells an attacker which stack to target and buys us nothing.
app.disable('x-powered-by');

// Security response headers (CSP, Referrer-Policy, nosniff, frame-ancestors,
// HSTS in production). See middleware/security.js for why the CSP is this
// strict — this process serves JSON only.
app.use(helmet(helmetOptions));

// CORS is an explicit allowlist (ALLOWED_ORIGINS + localhost dev ports), not
// origin reflection. See middleware/security.js.
app.use(cors(corsOptions));
// Every payload here is a small form. Capping the body keeps an oversized or
// hostile request from being buffered into memory before validation sees it.
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());

// Database. Presence and shape of DATABASE_URL were checked by loadConfig().
// Connection/TLS handling lives in db/pool.js so the migration scripts share it.
const pool = getPool();

// One warning, at startup, when production encrypts the database connection
// but does not authenticate the server. That configuration stops passive
// capture yet cannot detect an interceptor, and it is the default when
// DATABASE_SSL is unset — so it is easy to reach without deciding to. Naming
// the variable that fixes it is the whole point; nothing about the connection
// itself is logged.
if (config.isProduction && isUnverifiedTls(buildConfig())) {
  console.warn(
    '⚠ PostgreSQL TLS is not verifying the server certificate. Set DATABASE_SSL=verify ' +
    '(with DATABASE_CA_CERT if your provider issues its own CA) to authenticate the database.'
  );
}

// ══════════════════════════════════════════
// DATABASE INITIALIZATION
// ══════════════════════════════════════════

const initDB = async () => {
  try {
    // contacts + admins, and every column added to them since the first
    // release. Extracted to db/baseSchema.js so docker-entrypoint.sh can create
    // these tables BEFORE the migrations that depend on them — see the header
    // there for the restart loop this ordering bug caused on a fresh database.
    // Idempotent, so running it here as well costs nothing and keeps a
    // directly-started server (npm start) self-healing.
    await ensureBaseSchema(pool);

    // Seed admin accounts from the environment, never from source.
    // Format: ADMIN_SEED="alice:s3cret,bob:otherpass"
    //
    // Credentials previously lived in this file, which meant they were readable
    // by anyone with access to the repository. Existing accounts are left
    // untouched — rotate with `node create-admin.js reset <user> <newpass>`.
    //
    // This path is BOOTSTRAP ONLY and optional. create-admin.js is the
    // documented way to create an admin, because it prompts without echo and
    // keeps the password out of the environment entirely; ADMIN_SEED has to
    // hold the password in a variable that every process on the host can read
    // via /proc, and in whatever file or secret store supplied it.
    const seed = config.adminSeed.trim();

    if (!seed) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
      if (rows[0].n === 0) {
        console.warn(
          '⚠ No admin accounts exist and ADMIN_SEED is unset — the admin panel ' +
          'is unreachable. Set ADMIN_SEED, or run: node create-admin.js add <user> <pass>'
        );
      }
    } else {
      for (const entry of seed.split(',')) {
        // Split on the FIRST colon only, so passwords may contain colons.
        const separator = entry.indexOf(':');
        const username = separator === -1 ? '' : entry.slice(0, separator).trim();
        const password = separator === -1 ? '' : entry.slice(separator + 1);

        if (!username || !password) {
          console.warn(`⚠ Skipping malformed ADMIN_SEED entry (expected user:password)`);
          continue;
        }

        // The same policy the CLI enforces. Without this check ADMIN_SEED was a
        // way around it entirely: `ADMIN_SEED=admin:admin` created an admin whose
        // password was "admin", and the placeholder this repo shipped in
        // .env.example would have been accepted verbatim. A weak seed is skipped
        // loudly rather than silently created — and never echoed.
        const policy = validateAdminPassword(password, username);
        if (!policy.valid) {
          console.warn(`⚠ Refusing to seed admin "${username}": ${policy.error}`);
          console.warn('  Fix ADMIN_SEED and restart, or create the account with:');
          console.warn(`  node create-admin.js add ${username}`);
          continue;
        }

        const exists = await pool.query('SELECT id FROM admins WHERE username = $1', [username]);
        if (exists.rows.length === 0) {
          const hash = await bcrypt.hash(password, 12);
          // must_change_password = TRUE, matching `create-admin.js add`.
          //
          // This used to be omitted, so the column defaulted to FALSE and a
          // seeded account kept its bootstrap password indefinitely — the one
          // password most likely to be shared, pasted into a deploy config and
          // committed by accident. The two creation paths now behave
          // identically: whatever an operator types is temporary, and the
          // account can reach nothing but the password-change endpoint until
          // it is replaced (see middleware/auth.js).
          await pool.query(
            'INSERT INTO admins (username, password_hash, must_change_password) VALUES ($1, $2, TRUE)',
            [username, hash]
          );
          console.log(`  → Seeded admin: ${username} (must change password at first login)`);
        }
      }
    }

    console.log("✓ Admin accounts ready.");
  } catch (err) {
    // Rethrown, not swallowed.
    //
    // This used to log and continue, and initDB() was never awaited — so a
    // backend whose database was unreachable, or whose credentials were wrong,
    // still reached app.listen() and reported itself up. Every request then
    // failed with a 500 while the container looked healthy, which is the
    // hardest kind of deployment failure to diagnose. Startup now stops here
    // and start() below exits non-zero, so the orchestrator reports a failed
    // container and the operator reads the reason on the first attempt.
    //
    // `err.message` from pg is a driver message ("password authentication
    // failed for user ...", "connection refused"), which is diagnostic without
    // being a credential. The connection string is never included — see the
    // sanitising in start().
    throw err;
  }
};

// ══════════════════════════════════════════
// HELPER: Generate Tokens
// ══════════════════════════════════════════

// Both tokens carry `tokenVersion`, the admin's current revocation counter.
// requireAuth and /api/auth/refresh compare it against the database row, so
// incrementing that integer (logout, password change) invalidates every token
// the admin holds. The payload stays free of anything sensitive: an id, a
// username and a counter — no hash, no secret, no personal data.
const generateAccessToken = (admin) => {
  return jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      tokenVersion: admin.token_version ?? 0,
      // A convenience claim so the client can route to the password screen
      // without an extra round trip. NOT a security boundary — requireAuth
      // re-reads the column on every request, because an operator can reset a
      // password after this token was minted.
      mustChangePassword: Boolean(admin.must_change_password),
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (admin) => {
  return jwt.sign(
    {
      id: admin.id,
      username: admin.username,
      tokenVersion: admin.token_version ?? 0,
      // A convenience claim so the client can route to the password screen
      // without an extra round trip. NOT a security boundary — requireAuth
      // re-reads the column on every request, because an operator can reset a
      // password after this token was minted.
      mustChangePassword: Boolean(admin.must_change_password),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

// ══════════════════════════════════════════
// AUTH ROUTES (Public)
// ══════════════════════════════════════════

// A real bcrypt hash (of a random string nobody holds) used to burn the same
// CPU time on an unknown username as on a real one.
//
// Without it the endpoint was a username oracle: a missing username returned in
// ~7ms because no hash was ever compared, while a real username cost ~198ms of
// bcrypt work. The error text was already identical, but the 190ms gap told an
// attacker exactly which admin names exist — the expensive half of guessing.
// Cost 12 matches create-admin.js so the timings line up.
const DUMMY_HASH = bcrypt.hashSync(require('crypto').randomBytes(32).toString('hex'), 12);

// POST /api/auth/login
// Rate limited (see middleware/security.js): 10 failed attempts per
// IP+username per 15 minutes. Successful logins are not counted.
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body ?? {};

    // Type-checked, not just falsy-checked: an array or object here would reach
    // the query builder as a non-scalar and produce a 500 rather than a 400.
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      recordAuditEvent(pool, {
        eventType: AUDIT_EVENTS.LOGIN_FAILURE,
        success: false,
        req,
        metadata: { reason: FAILURE_REASONS.MISSING_CREDENTIALS, source: 'api' },
      });
      return res.status(400).json({
        success: false,
        error: 'Username and password are required.'
      });
    }

    // Find admin by username (case-insensitive & trimmed)
    const normalizedUsername = username.trim().toLowerCase();
    const result = await pool.query(
      'SELECT * FROM admins WHERE LOWER(username) = $1',
      [normalizedUsername]
    );

    const admin = result.rows[0] ?? null;

    // Locked accounts still pay for a bcrypt comparison before being turned
    // away. Returning early would answer in ~1ms while a real attempt costs
    // ~200ms, and that gap is itself an oracle: it reveals both that the
    // username exists and that it is currently locked.
    const lockedUntil = admin?.locked_until ? new Date(admin.locked_until) : null;
    const isLocked = lockedUntil !== null && lockedUntil.getTime() > Date.now();

    // Always run one bcrypt comparison, even when the username is unknown, so
    // both outcomes take the same time. The dummy hash can never match.
    const passwordMatch = await bcrypt.compare(password, admin?.password_hash ?? DUMMY_HASH);

    if (isLocked) {
      // Same body as a wrong password: the response must not reveal that this
      // username exists, nor that it is throttled. The reason is recorded in the
      // audit trail instead, where only an authenticated admin can read it.
      recordAuditEvent(pool, {
        adminId: admin.id,
        eventType: AUDIT_EVENTS.LOGIN_FAILURE,
        success: false,
        req,
        metadata: {
          reason: FAILURE_REASONS.ACCOUNT_LOCKED,
          username: admin.username,
          lockedUntil,
          source: 'api',
        },
      });
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    // One response for both "no such admin" and "wrong password": never
    // disclose which admin usernames are valid.
    if (!admin || !passwordMatch) {
      if (admin) {
        // Counted and locked in a single statement so two simultaneous attempts
        // cannot both read the same count and each write count+1 — a
        // read-then-write in JavaScript would let an attacker run parallel
        // requests to keep the counter below the threshold indefinitely.
        //
        // The CASE restarts the count when a previous lock has already expired,
        // making this a rolling window rather than a permanent tally that
        // re-locks the account on its very next attempt, forever.
        const throttle = await pool.query(
          `UPDATE admins
              SET failed_login_attempts =
                    CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW()
                         THEN 1 ELSE failed_login_attempts + 1 END,
                  locked_until =
                    CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW()
                                    THEN 1 ELSE failed_login_attempts + 1 END) >= $2
                         THEN NOW() + ($3 || ' minutes')::interval
                         ELSE NULL END
            WHERE id = $1
            RETURNING failed_login_attempts, locked_until`,
          [admin.id, MAX_FAILED_LOGINS, String(LOCK_MINUTES)]
        );
        const state = throttle.rows[0] ?? {};
        recordAuditEvent(pool, {
          adminId: admin.id,
          eventType: AUDIT_EVENTS.LOGIN_FAILURE,
          success: false,
          req,
          metadata: {
            reason: FAILURE_REASONS.BAD_PASSWORD,
            username: admin.username,
            failedAttempts: state.failed_login_attempts,
            lockedUntil: state.locked_until ? new Date(state.locked_until) : null,
            source: 'api',
          },
        });

        // A second, distinct row at the moment the lock is applied, so "this
        // account was locked out" is one query rather than a count of failures.
        if (state.locked_until) {
          recordAuditEvent(pool, {
            adminId: admin.id,
            eventType: AUDIT_EVENTS.LOGIN_LOCKED,
            success: false,
            req,
            metadata: {
              reason: FAILURE_REASONS.ACCOUNT_LOCKED,
              username: admin.username,
              failedAttempts: state.failed_login_attempts,
              lockedUntil: new Date(state.locked_until),
              source: 'api',
            },
          });
        }
      } else {
        // No row to count against — an unknown username cannot be locked out,
        // which is also why the in-memory IP+username limiter still matters.
        recordAuditEvent(pool, {
          eventType: AUDIT_EVENTS.LOGIN_FAILURE,
          success: false,
          req,
          metadata: {
            reason: FAILURE_REASONS.UNKNOWN_USERNAME,
            attemptedUsername: username,
            source: 'api',
          },
        });
      }

      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.'
      });
    }

    // Success clears the throttle so a legitimate admin who mistyped twice is
    // not carrying those failures into their next session.
    if (admin.failed_login_attempts > 0 || admin.locked_until) {
      await pool.query(
        'UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
        [admin.id]
      );
    }

    recordAuditEvent(pool, {
      adminId: admin.id,
      eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
      success: true,
      req,
      metadata: { username: admin.username, source: 'api' },
    });

    // Generate tokens
    const accessToken = generateAccessToken(admin);
    const refreshToken = generateRefreshToken(admin);

    // Set refresh token as HttpOnly cookie
    res.cookie('zurii_refresh_token', refreshToken, {
      httpOnly: true,       // Not accessible via JavaScript
      secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in ms
      path: '/',
    });

    res.status(200).json({
      success: true,
      accessToken,
      admin: {
        id: admin.id,
        username: admin.username,
        // Tells the client to show the password screen instead of the dashboard.
        // The server enforces it regardless of what the client does with this.
        mustChangePassword: Boolean(admin.must_change_password),
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, error: 'Login failed. Server error.' });
  }
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.zurii_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        error: 'No refresh token. Please log in again.' 
      });
    }

    // Verify the refresh token
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Confirm admin still exists in DB
    const result = await pool.query(
      'SELECT id, username, token_version, must_change_password FROM admins WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0) {
      res.clearCookie('zurii_refresh_token', { path: '/' });
      return res.status(401).json({
        success: false,
        error: 'Admin account no longer exists.'
      });
    }

    const admin = result.rows[0];

    // The revocation check that makes logout mean something. Without it this
    // endpoint would happily mint a fresh 15-minute access token from a refresh
    // cookie captured before logout, for the remainder of its seven days —
    // reopening the exact hole the token_version counter exists to close.
    //
    // A cookie predating the upgrade carries no tokenVersion claim and is
    // refused for the same reason requireAuth refuses one: it cannot be revoked.
    // The cookie is cleared so the client stops retrying with it.
    if (typeof decoded.tokenVersion !== 'number' || decoded.tokenVersion !== admin.token_version) {
      recordAuditEvent(pool, {
        adminId: admin.id,
        eventType: AUDIT_EVENTS.TOKEN_REJECTED,
        success: false,
        req,
        metadata: {
          reason: FAILURE_REASONS.TOKEN_VERSION_MISMATCH,
          username: admin.username,
          route: '/api/auth/refresh',
        },
      });
      res.clearCookie('zurii_refresh_token', { path: '/' });
      return res.status(401).json({
        success: false,
        error: 'Session expired. Please log in again.'
      });
    }

    // Issue new access token
    const accessToken = generateAccessToken(admin);

    res.status(200).json({
      success: true,
      accessToken,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    });
  } catch (err) {
    // If refresh token is expired or invalid, clear the cookie
    res.clearCookie('zurii_refresh_token', { path: '/' });
    return res.status(401).json({ 
      success: false, 
      error: 'Session expired. Please log in again.' 
    });
  }
});

// POST /api/auth/logout
//
// Logout now revokes server-side as well as clearing the cookie. It used to only
// clear the cookie, which meant a captured access or refresh token kept working
// until it expired — logging out protected nobody but the person logging out.
//
// The admin is identified from the refresh cookie first, because that is all the
// existing admin clients send (services/adminApi.js and AdminInsights.jsx both
// post with `credentials: 'include'` and no Authorization header). The Bearer
// token is accepted as a fallback so an API caller can log out too.
//
// Semantics for this V1: logout ends EVERY session for that admin, on every
// device. That is a deliberate simplification — per-device sessions would need a
// session table, which is exactly the infrastructure this design avoids.
//
// It always answers 200. A logout that fails is worse than useless: the client
// has already discarded its token, so an error would only strand the UI.
app.post('/api/auth/logout', async (req, res) => {
  let adminId = null;
  let username = null;

  const fromCookie = req.cookies?.zurii_refresh_token;
  if (fromCookie) {
    try {
      const decoded = jwt.verify(fromCookie, JWT_REFRESH_SECRET);
      if (Number.isInteger(decoded.id)) adminId = decoded.id;
    } catch {
      // Expired or forged cookie: nothing to revoke, still clear it below.
    }
  }

  if (adminId === null) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.slice(7), JWT_SECRET);
        if (Number.isInteger(decoded.id)) adminId = decoded.id;
      } catch {
        // Same: an unverifiable token grants no revocation.
      }
    }
  }

  if (adminId !== null) {
    try {
      const { rows } = await pool.query(
        'UPDATE admins SET token_version = token_version + 1 WHERE id = $1 RETURNING username',
        [adminId]
      );
      username = rows[0]?.username ?? null;
      if (username) {
        recordAuditEvent(pool, {
          adminId,
          eventType: AUDIT_EVENTS.LOGOUT,
          success: true,
          req,
          metadata: { username, source: 'api' },
        });
      }
    } catch (err) {
      // Logged, not surfaced: the cookie is still cleared below.
      console.error('Logout revocation failed:', err.message);
    }
  }

  res.clearCookie('zurii_refresh_token', { path: '/' });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ══════════════════════════════════════════
// PUBLIC ROUTES (No auth required)
// ══════════════════════════════════════════

// Liveness + readiness. Registered before everything else so a probe still
// answers while the rest of the app is busy, and deliberately outside any
// limiter — throttling a healthcheck makes an orchestrator kill a container
// that was only being polled too often. Neither route reveals configuration.
app.use('/api', createHealthRouter(pool));

// Travel content: destinations + packages, read from PostgreSQL.
// Schema and data come from scripts/migrateTravelSchema.mjs + migrateTravelData.mjs.
app.use('/api', createTravelRouter(pool));

// Trip enquiries: POST /api/bookings. Schema from scripts/migrateBookingsSchema.mjs.
app.use('/api', createBookingsRouter(pool));

// Anonymous analytics: POST /api/analytics/events. Schema from
// scripts/migrateAnalyticsSchema.mjs. Fire-and-forget, rate-limited per IP.
app.use('/api/analytics', createAnalyticsRouter(pool));

// Column maxima for contacts, so an over-long field becomes a 400 rather than a
// Postgres 22001 surfaced as a generic 500.
// These MUST match the column widths in initDB, which now enforces them with
// ALTER TABLE. A limit wider than its column turns a validation pass into a
// Postgres 22001 and loses the lead behind a 500.
const CONTACT_LIMITS = { name: 255, email: 255, phone: 50, interest: 255, callback: 50 };

// `message` is TEXT (unbounded). The 32kb body cap already bounds it, but an
// explicit ceiling keeps a 30kb "message" out of the CRM and out of the row.
const CONTACT_MESSAGE_MAX = 5000;

// POST /api/contact — Visitors submit contact/inquiry forms
// Rate limited (20 per 10 min per IP) purely as anti-flood; the endpoint stays
// public and anonymous by design.
app.post('/api/contact', leadLimiter, async (req, res) => {
  try {
    // `status`, `priority` and `source` are deliberately NOT read from the body.
    //
    // They used to be, which let any unauthenticated caller post a lead that was
    // already `status: 'completed'` — invisible in the admin's default Pending
    // tab — or `priority: 'high'`, which the admin list sorts to the top. Both
    // are spam/lead-hiding vectors. They now come from the column defaults
    // ('pending', 'normal', 'Website'), matching how routes/bookings.js refuses
    // the same fields.
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

    const fields = {};

    // NORMALISE ONCE, THEN VALIDATE AND INSERT THE SAME VALUE.
    //
    // The previous version validated `text(value)` — which silently turned an
    // array, an object or a boolean into '' — and then inserted the RAW body
    // value. The two disagreed, in the direction that matters: a structured
    // `interest` passed the 255-character check as an empty string and was then
    // handed to pg, which serialises an object to JSON and an array to a
    // Postgres array literal. So the column received text no validation had
    // looked at, of a length no validation had bounded. Parameterisation meant
    // it was never injectable, but the value could still overflow the column
    // (22001) or store nonsense in the CRM.
    //
    // Now every field goes through `normalise` once. Its output is what gets
    // length-checked and what gets bound, so the two can no longer diverge.
    //
    // Strings and finite numbers are accepted (a phone number typed into a
    // JSON client can legitimately arrive unquoted, and lib/validateBooking.js
    // makes the same allowance). Arrays, objects, booleans and null are
    // rejected as a field error rather than coerced — a caller sending one has
    // a broken client, and telling them so beats silently storing ''.
    const normalise = (value, field) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      fields[field] = 'Please enter a valid value.';
      return '';
    };

    const clean = {
      name: normalise(body.name, 'name'),
      email: normalise(body.email, 'email'),
      phone: normalise(body.phone, 'phone'),
      interest: normalise(body.interest, 'interest'),
      message: normalise(body.message, 'message'),
      callback: normalise(body.callback, 'callback'),
    };

    // These three are NOT NULL in the schema; without this check an empty body
    // binds NULL and Postgres raises 23502, which the catch below reports as a
    // 500 the visitor cannot act on. Skipped where normalise already objected,
    // so one bad field yields one message rather than two contradictory ones.
    if (!fields.name && !clean.name) fields.name = 'Please enter your name.';
    if (!fields.email && !clean.email) fields.email = 'Please enter your email address.';
    if (!fields.phone && !clean.phone) fields.phone = 'Please enter your phone number.';

    for (const [field, max] of Object.entries(CONTACT_LIMITS)) {
      if (!fields[field] && clean[field].length > max) {
        fields[field] = `Please keep this under ${max} characters.`;
      }
    }

    if (!fields.message && clean.message.length > CONTACT_MESSAGE_MAX) {
      fields.message = `Please keep this under ${CONTACT_MESSAGE_MAX} characters.`;
    }

    if (Object.keys(fields).length > 0) {
      return res.status(400).json({ success: false, error: 'Please check the highlighted fields.', fields });
    }

    // Written as server-side literals, not read from the body and not left to
    // the column defaults: this database defaults `status` to 'new' while the
    // CREATE TABLE above declares 'pending', so relying on the default would
    // make a new lead's status depend on which environment it landed in. The
    // admin CRM treats anything that is not 'completed' as pending, so both
    // work — but a lead should not mean different things on different hosts.
    // Anonymous analytics attribution: shape-valid ids ride along, anything
    // malformed is silently dropped to null — a bad analytics id must never
    // fail a lead submission.
    const { visitorId, sessionId } = extractAttribution(req.body);

    const result = await pool.query(
      `INSERT INTO contacts (name, email, phone, interest, message, callback, status, priority, source,
                             visitor_id, session_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', 'normal', 'Website', $7, $8)
       RETURNING id, status, created_at`,
      // Exactly the values that were validated above. The optional three are
      // stored as NULL rather than '' when empty, so "not supplied" stays
      // distinguishable from "supplied blank" in the CRM.
      [clean.name, clean.email, clean.phone,
       clean.interest || null, clean.message || null, clean.callback || null,
       visitorId, sessionId]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Insert Error:", err);
    // 22001 = value too long for a column. That means validation and the schema
    // disagree, which is our bug — but the visitor can still act on "this field
    // is too long", whereas a 500 just loses their enquiry. Never echo the
    // Postgres message: it names columns and types.
    if (err.code === '22001') {
      return res.status(400).json({
        success: false,
        error: 'One of the fields is too long. Please shorten it and try again.',
      });
    }
    res.status(500).json({ success: false, error: 'Database insertion failed' });
  }
});

// ══════════════════════════════════════════
// PROTECTED ROUTES (Auth required)
// ══════════════════════════════════════════

// ── Account lifecycle: session state + password change ──────────────
//
// REGISTRATION ORDER MATTERS. These must come before the /api/admin router
// below, because that router calls `router.use(requireAuth)` for every request
// whose path enters its mount point — including one it has no route for. A
// request to /api/admin/change-password would therefore hit the STRICT
// requireAuth and be refused with PASSWORD_CHANGE_REQUIRED before ever reaching
// this handler, making the password change impossible for exactly the accounts
// that need it. Registered first, these win the match.
//
// Both use requireAuthAllowPasswordChange: a valid session with a temporary
// password reaches these two routes and nothing else.

// GET /api/admin/session — who am I, and do I still owe a password change?
app.get('/api/admin/session', requireAuthAllowPasswordChange, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      id: req.admin.id,
      username: req.admin.username,
      mustChangePassword: Boolean(req.admin.mustChangePassword),
    },
  });
});

// POST /api/admin/change-password
//
// Serves both the forced first-login replacement and a routine rotation later —
// one endpoint, one policy, one revocation path.
//
// The current password is required even though the caller already holds a valid
// session. A session alone must never be enough: a borrowed laptop, a stolen
// token or an XSS-obtained token would otherwise let an attacker lock the real
// admin out of their own account by changing the password to one only they know.
app.post('/api/admin/change-password', requireAuthAllowPasswordChange, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'Current password and new password are required.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // FOR UPDATE: two concurrent change-password calls must not both read the
    // same hash and each write their own new one, leaving the loser's password
    // silently discarded while its owner is told it succeeded.
    const { rows } = await client.query(
      'SELECT id, username, password_hash FROM admins WHERE id = $1 FOR UPDATE',
      [req.admin.id]
    );
    const admin = rows[0];
    if (!admin) {
      await client.query('ROLLBACK');
      return res.status(401).json({ success: false, error: 'Invalid authentication token.' });
    }

    const currentMatches = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!currentMatches) {
      await client.query('ROLLBACK');
      recordAuditEvent(pool, {
        adminId: admin.id,
        eventType: AUDIT_EVENTS.LOGIN_FAILURE,
        success: false,
        req,
        metadata: {
          reason: FAILURE_REASONS.BAD_PASSWORD,
          username: admin.username,
          route: '/api/admin/change-password',
          source: 'api',
        },
      });
      // Deliberately not counted toward the login lockout: this caller is
      // already authenticated, and letting it lock the account would turn a
      // mistyped field into a 15-minute outage for the person using it.
      return res.status(400).json({
        success: false,
        error: 'Your current password is incorrect.',
        fields: { currentPassword: 'This does not match your current password.' },
      });
    }

    const policy = validateAdminPassword(newPassword, admin.username);
    if (!policy.valid) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: policy.error, fields: { newPassword: policy.error } });
    }

    // Compared with bcrypt rather than by string equality, so "unchanged" is
    // detected even when the two strings differ only in ways bcrypt ignores.
    if (await bcrypt.compare(newPassword, admin.password_hash)) {
      await client.query('ROLLBACK');
      const message = 'Your new password must be different from your current one.';
      return res.status(400).json({ success: false, error: message, fields: { newPassword: message } });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    // One statement: the new hash, the cleared first-login flag, and the version
    // bump that kills every existing session — including the temporary-password
    // session making this very request. There is no window in which the old
    // password still works or an old token is still valid.
    await client.query(
      `UPDATE admins
          SET password_hash = $1,
              must_change_password = FALSE,
              password_changed_at = NOW(),
              token_version = token_version + 1,
              failed_login_attempts = 0,
              locked_until = NULL
        WHERE id = $2`,
      [newHash, admin.id]
    );

    await client.query('COMMIT');

    recordAuditEvent(pool, {
      adminId: admin.id,
      eventType: AUDIT_EVENTS.PASSWORD_CHANGED,
      success: true,
      req,
      metadata: { username: admin.username, source: 'api', mustChangePassword: false },
    });

    // The refresh cookie belongs to a now-revoked token version; clearing it
    // stops the client retrying with something guaranteed to fail.
    res.clearCookie('zurii_refresh_token', { path: '/' });

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please sign in again.',
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection is already broken; the outer error is the useful one.
    }
    console.error('Change Password Error:', err);
    return res.status(500).json({ success: false, error: 'Could not change the password. Please try again.' });
  } finally {
    client.release();
  }
});

// Admin analytics dashboards + lead journeys. The router applies requireAuth
// to every route itself, so nothing under /api/admin is ever public.
app.use('/api/admin', createAdminAnalyticsRouter(pool));

// GET /api/contact — Fetch all leads (Admin only)
app.get('/api/contact', requireAuth, async (req, res) => {
  try {
    const { status } = req.query;
    // Bounded read. This query had no LIMIT, so it returned every contact ever
    // submitted — the whole table into Node's memory and down to the browser,
    // where the CRM paginates client-side. Fine at 20 leads, a slow page and a
    // memory spike at 200k, and reachable by any authenticated admin session.
    //
    // The response keeps the plain `data` array the existing CRM expects (it
    // does its own filtering, counting and paging over the full set) and adds
    // `meta` so it can tell when it is looking at a truncated view.
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 500, 1), 1000);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);

    const where = [];
    const values = [];
    // Parameterized, and only used when it is actually a string: an array here
    // would otherwise reach the driver as a non-scalar.
    if (typeof status === 'string' && status) {
      values.push(status);
      where.push(`status = $${values.length}`);
    }
    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM contacts${whereSql}`, values);

    values.push(limit, offset);
    const result = await pool.query(
      `SELECT * FROM contacts${whereSql}
        ORDER BY
          CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const total = countResult.rows[0]?.total ?? result.rows.length;
    res.status(200).json({
      success: true,
      data: result.rows,
      meta: { total, limit, offset, returned: result.rows.length, truncated: offset + result.rows.length < total },
    });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ success: false, error: 'Failed to fetch contacts' });
  }
});

// PATCH /api/contact/:id/complete — Mark lead as completed (Admin only)
app.patch('/api/contact/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      UPDATE contacts 
      SET status = 'completed' 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Complete Error:", err);
    res.status(500).json({ success: false, error: 'Failed to complete contact' });
  }
});

// PATCH /api/contact/:id/reopen — Reopen a completed lead (Admin only)
app.patch('/api/contact/:id/reopen', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      UPDATE contacts 
      SET status = 'pending' 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("Reopen Error:", err);
    res.status(500).json({ success: false, error: 'Failed to reopen contact' });
  }
});

// DELETE /api/contact/:id — Delete a lead (Admin only)
app.delete('/api/contact/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const query = `
      DELETE FROM contacts 
      WHERE id = $1 
      RETURNING *;
    `;
    const result = await pool.query(query, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }
    res.status(200).json({ success: true, message: 'Lead deleted successfully', data: result.rows[0] });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ success: false, error: 'Failed to delete contact' });
  }
});

// ══════════════════════════════════════════
// ERROR HANDLER
// ══════════════════════════════════════════

// Registered last so it catches what the routes never see — chiefly failures
// raised by express.json() before any handler runs.
//
// Without this, a body over the 32kb cap or a malformed JSON payload falls
// through to Express's default handler, which answers with an HTML page. Outside
// production that page contains the stack trace and absolute server file paths,
// on a public endpoint. Every response from here uses the same
// `{ success, error }` envelope as the rest of the API.
//
// The 4-arity signature is what marks this as error middleware to Express;
// `next` must stay even though it is unused.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'That request is too large.' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'That request body is not valid JSON.' });
  }

  // Log for the operator, tell the client nothing about internals.
  console.error('Unhandled Error:', err);
  res.status(500).json({ success: false, error: 'Something went wrong.' });
});

// ══════════════════════════════════════════
// START SERVER
// ══════════════════════════════════════════

/**
 * Bring the schema up to date, then listen. In that order, and only in that
 * order: accepting traffic before the tables the handlers query exist would
 * serve 500s for the first seconds of every deploy.
 *
 * Any failure exits non-zero. Under Docker's `restart: unless-stopped` that
 * still produces a restart loop — deliberately. A loop with a clear, repeated
 * reason in the logs is a correct signal that the deployment is broken; the
 * alternative, a process that stays up while unable to serve, hides it.
 */
async function start() {
  try {
    await initDB();
  } catch (err) {
    // Only the driver's message, never the error object: a pg error can carry
    // the full connection configuration on properties that a bare
    // `console.error(err)` would print, credentials included.
    console.error(`Database initialization failed: ${err.message}`);
    if (err.code) console.error(`  PostgreSQL error code: ${err.code}`);
    console.error(
      '  Check DATABASE_URL (host, database, user, password) and that PostgreSQL is\n' +
      '  reachable from this container. Inside Docker, `localhost` means the container\n' +
      '  itself — use the Compose service name. Run `npm run check:env` to verify config.'
    );
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });

  // Without this the container is SIGKILLed after Docker's 10s grace period on
  // every deploy, cutting in-flight requests. tini forwards the signal (see
  // the Dockerfile); this is the half that acts on it.
  const shutdown = (signal) => {
    console.log(`${signal} received — shutting down.`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    // A client holding a keep-alive connection open must not be able to
    // postpone shutdown indefinitely.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();

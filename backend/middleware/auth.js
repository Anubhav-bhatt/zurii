const jwt = require('jsonwebtoken');

const { getPool } = require('../db/pool');
const { AUDIT_EVENTS, FAILURE_REASONS, recordAuditEvent } = require('../lib/adminAudit');

const JWT_SECRET = process.env.JWT_SECRET;

/** One message for every rejection: never disclose which check failed. */
const GENERIC_REJECTION = 'Invalid authentication token.';

/**
 * Build the admin auth middleware.
 *
 * Verification is three steps, not one:
 *
 *   1. the signature and expiry, as before;
 *   2. the token's `tokenVersion` against `admins.token_version`;
 *   3. `admins.must_change_password` — an account still holding an
 *      operator-issued temporary password authenticates successfully but may
 *      reach nothing except the password-change and session endpoints.
 *
 * Step 3 lives here rather than in each route because that is what makes it
 * real: every protected surface in the app — the analytics router, the contact
 * CRM, every future admin route — already passes through this function, so a
 * temporary credential cannot reach business data through a route someone
 * forgot to guard. Hiding navigation in React would not stop a direct API call.
 *
 * @param {import('pg').Pool} [pool] injectable for tests; defaults to the app pool.
 * @param {object} [options]
 * @param {boolean} [options.allowMustChangePassword] set on the password-change
 *   and session routes only — the two things such an account must be able to do.
 *
 * Step 2 is what makes logout and password changes real. Previously a JWT was
 * valid until it expired no matter what happened server-side — logout only
 * cleared the browser cookie, so a copied access token kept working for its
 * full 15 minutes and a copied refresh cookie for seven days, with no way to
 * revoke either short of rotating the signing secret for everyone. Bumping the
 * integer in the row now kills every token that admin holds.
 *
 * The extra database read per admin request is deliberate. There are a handful
 * of admins and a low request rate, so a cache would add invalidation bugs to
 * save a sub-millisecond indexed primary-key lookup — and a stale cache here
 * means revocation silently stops working, which is the whole feature.
 *
 * @param {import('pg').Pool} [pool] injectable for tests; defaults to the app pool.
 */
function createRequireAuth(pool, options = {}) {
  const allowMustChangePassword = options.allowMustChangePassword === true;

  return async function requireAuth(req, res, next) {
    const db = pool ?? getPool();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please log in.'
      });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        // Distinguished because the client uses it to trigger a silent refresh
        // rather than bouncing the admin to the login screen. An expired token
        // is normal operation, not a security event, so it is not audited.
        return res.status(401).json({
          success: false,
          error: 'Session expired. Please refresh your token.',
          code: 'TOKEN_EXPIRED'
        });
      }
      recordAuditEvent(db, {
        eventType: AUDIT_EVENTS.TOKEN_REJECTED,
        success: false,
        req,
        metadata: { reason: FAILURE_REASONS.TOKEN_INVALID, route: req.originalUrl },
      });
      return res.status(401).json({ success: false, error: GENERIC_REJECTION });
    }

    // A token minted before token_version existed cannot be revoked, so it is
    // refused rather than trusted. The cost is that admins holding a
    // pre-upgrade session log in once more; the alternative is a seven-day
    // window in which logout does nothing. Fail closed.
    if (typeof decoded.tokenVersion !== 'number' || !Number.isInteger(decoded.id)) {
      recordAuditEvent(db, {
        adminId: Number.isInteger(decoded.id) ? decoded.id : null,
        eventType: AUDIT_EVENTS.TOKEN_REJECTED,
        success: false,
        req,
        metadata: { reason: FAILURE_REASONS.TOKEN_INVALID, route: req.originalUrl },
      });
      return res.status(401).json({ success: false, error: GENERIC_REJECTION });
    }

    try {
      const { rows } = await db.query(
        'SELECT id, username, token_version, must_change_password, active FROM admins WHERE id = $1',
        [decoded.id]
      );
      const admin = rows[0];

      // Deleting an admin now ends their access immediately, rather than when
      // their last token happened to expire.
      if (!admin) {
        recordAuditEvent(db, {
          eventType: AUDIT_EVENTS.TOKEN_REJECTED,
          success: false,
          req,
          metadata: { reason: FAILURE_REASONS.ADMIN_GONE, route: req.originalUrl },
        });
        return res.status(401).json({ success: false, error: GENERIC_REJECTION });
      }

      // Checked before token_version, and on EVERY request rather than only at
      // login: deactivating an admin has to end the sessions they already hold,
      // not merely stop the next sign-in. Otherwise revoking someone's access
      // would leave them working for the remaining life of their access token,
      // with a refresh cookie good for another seven days.
      //
      // No dedicated response code, unlike PASSWORD_CHANGE_REQUIRED: there is
      // nothing the client can usefully do about it, and the generic rejection
      // avoids confirming to a token-holder that the account merely sleeps.
      if (admin.active === false) {
        recordAuditEvent(db, {
          adminId: admin.id,
          eventType: AUDIT_EVENTS.TOKEN_REJECTED,
          success: false,
          req,
          metadata: {
            reason: FAILURE_REASONS.ACCOUNT_DISABLED,
            username: admin.username,
            route: req.originalUrl,
          },
        });
        return res.status(401).json({ success: false, error: GENERIC_REJECTION });
      }

      if (admin.token_version !== decoded.tokenVersion) {
        recordAuditEvent(db, {
          adminId: admin.id,
          eventType: AUDIT_EVENTS.TOKEN_REJECTED,
          success: false,
          req,
          metadata: {
            reason: FAILURE_REASONS.TOKEN_VERSION_MISMATCH,
            username: admin.username,
            route: req.originalUrl,
          },
        });
        return res.status(401).json({ success: false, error: GENERIC_REJECTION });
      }

      // The database is the authority, not the token claim: an operator can
      // reset a password mid-session, and the already-issued token would still
      // carry mustChangePassword:false.
      if (admin.must_change_password && !allowMustChangePassword) {
        recordAuditEvent(db, {
          adminId: admin.id,
          eventType: AUDIT_EVENTS.TOKEN_REJECTED,
          success: false,
          req,
          metadata: {
            reason: FAILURE_REASONS.PASSWORD_CHANGE_REQUIRED,
            username: admin.username,
            route: req.originalUrl,
          },
        });
        // 403, not 401: the credential is valid and refreshing will not help.
        // The code lets the client route straight to the password screen instead
        // of bouncing the admin back to a login form that would just succeed.
        return res.status(403).json({
          success: false,
          error: 'Password change required before continuing.',
          code: 'PASSWORD_CHANGE_REQUIRED',
        });
      }

      req.admin = {
        ...decoded,
        id: admin.id,
        username: admin.username,
        mustChangePassword: admin.must_change_password,
      };
      return next();
    } catch (err) {
      // A database outage must not be mistaken for a valid session: fail closed.
      console.error('Auth lookup failed:', err.message);
      return res.status(401).json({ success: false, error: GENERIC_REJECTION });
    }
  };
}

/**
 * Default middleware bound to the application pool, so existing call sites
 * (`const { requireAuth } = require('./middleware/auth')`) are unchanged. This
 * is the strict one: it refuses an account that still holds a temporary
 * password.
 */
const requireAuth = createRequireAuth();

/**
 * The narrow exception, for the only two routes an admin with a temporary
 * password needs: reading their own session state, and replacing the password.
 * Everything else must use `requireAuth`.
 */
const requireAuthAllowPasswordChange = createRequireAuth(undefined, { allowMustChangePassword: true });

module.exports = { requireAuth, requireAuthAllowPasswordChange, createRequireAuth };

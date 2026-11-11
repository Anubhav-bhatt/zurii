/**
 * One way for a route to report a failure it did not expect.
 *
 * The operator gets a structured `handler_error` line (request id, context,
 * error class/code/scrubbed message — never the error object, whose query
 * parameters hold customer data). The visitor gets a plain sentence:
 *
 *   PostgreSQL unreachable or timing out → 503 + Retry-After, code SERVICE_UNAVAILABLE
 *   anything else                        → 500
 *
 * Neither response names the database, a table or an error code.
 */
const { log, classifyDbError, errorFields } = require('./logger');

const UNAVAILABLE = 'This is temporarily unavailable. Please try again in a moment.';
const FAILED = 'Something went wrong on our side. Please try again.';

function sendServerError(req, res, err, { context, message = FAILED, unavailableMessage = UNAVAILABLE, retryAfter = 30 } = {}) {
  const dbClass = classifyDbError(err);
  const unavailable = dbClass === 'db_unavailable' || dbClass === 'db_timeout';
  log.error('handler_error', {
    reqId: req.id,
    context,
    ...errorFields(err, { withStack: !unavailable }),
  });
  if (unavailable) {
    res.set('Retry-After', String(retryAfter));
    return res.status(503).json({ success: false, error: unavailableMessage, code: 'SERVICE_UNAVAILABLE' });
  }
  return res.status(500).json({ success: false, error: message });
}

module.exports = { sendServerError };

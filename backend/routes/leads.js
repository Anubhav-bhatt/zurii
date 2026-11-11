/**
 * Admin lead management API (Phase 4) — one interface over contacts and
 * bookings. Mounted at /api/admin/leads; every route requires a full admin
 * session (requireAuth: valid token, current token_version, active account,
 * no outstanding password change).
 *
 *   GET    /                 paginated, filtered, sorted list
 *   GET    /summary          counts over all active leads (KPIs, tab badges)
 *   GET    /:leadId          full detail + notes + activity
 *   PATCH  /:leadId/status   { status, expectedStatus? }
 *   POST   /:leadId/notes    { body }
 *   DELETE /:leadId          { reason? }   soft delete
 *   POST   /:leadId/restore                undo a soft delete
 *
 * Envelope as elsewhere: { success, data, meta? } or { success: false, error, code? }.
 * Personal data appears only in these admin responses, never in logs.
 */
const express = require('express');
const {
  LeadInputError,
  createLeadService,
  parseLeadId,
  parseListQuery,
  parseSummaryQuery,
  parseNoteBody,
  parseStatusBody,
  parseDeleteBody,
} = require('../lib/leads');

const { log, errorFields, isDatabaseUnavailable } = require('../lib/logger');

function fail(res, err, label) {
  if (err instanceof LeadInputError) {
    return res.status(400).json({ success: false, error: err.message, code: 'INVALID_INPUT', field: err.field });
  }
  if (isDatabaseUnavailable(err)) {
    log.error('handler_error', { reqId: res.req?.id, context: label, ...errorFields(err) });
    res.set('Retry-After', '5');
    return res.status(503).json({ success: false, error: 'Service temporarily unavailable. Please try again shortly.', code: 'SERVICE_UNAVAILABLE' });
  }
  // Scrubbed fields only: a pg error object can carry query text and values.
  log.error('handler_error', { reqId: res.req?.id, context: label, ...errorFields(err, { withStack: true }) });
  return res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
}

const notFound = (res) => res.status(404).json({ success: false, error: 'Lead not found.', code: 'LEAD_NOT_FOUND' });

module.exports = function createLeadsRouter(pool, { requireAuth } = {}) {
  const router = express.Router();
  const leads = createLeadService(pool);
  router.use(requireAuth ?? require('../middleware/auth').requireAuth);

  const admin = (req) => ({ id: req.admin?.id ?? null, username: req.admin?.username ?? 'unknown' });

  /** Resolve :leadId once, for every route that takes it. */
  router.param('leadId', (req, res, next, value) => {
    const ref = parseLeadId(value);
    if (!ref) return res.status(400).json({ success: false, error: 'Invalid lead id.', code: 'INVALID_LEAD_ID' });
    req.leadRef = ref;
    return next();
  });

  router.get('/', async (req, res) => {
    try {
      const filters = parseListQuery(req.query);
      const { items, total, totalPages } = await leads.list(filters);
      return res.status(200).json({
        success: true,
        data: items,
        meta: {
          page: filters.page,
          pageSize: filters.pageSize,
          total,
          totalPages,
          sort: filters.sort,
          filters: {
            kind: filters.kind,
            status: filters.status,
            priority: filters.priority,
            q: filters.q,
            interest: filters.interest,
            from: filters.from,
            to: filters.to,
            deleted: filters.deleted,
          },
        },
      });
    } catch (err) {
      return fail(res, err, 'Lead list');
    }
  });

  router.get('/summary', async (req, res) => {
    try {
      const data = await leads.summary(parseSummaryQuery(req.query));
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return fail(res, err, 'Lead summary');
    }
  });

  router.get('/:leadId', async (req, res) => {
    try {
      const found = await leads.get(req.leadRef);
      if (!found) return notFound(res);
      return res.status(200).json({ success: true, data: found });
    } catch (err) {
      return fail(res, err, 'Lead detail');
    }
  });

  router.patch('/:leadId/status', async (req, res) => {
    try {
      const { status, expectedStatus } = parseStatusBody(req.body);
      const result = await leads.changeStatus(req.leadRef, { status, expectedStatus, admin: admin(req) });
      if (result.outcome === 'not_found') return notFound(res);
      if (result.outcome === 'deleted') {
        return res.status(409).json({ success: false, error: 'This lead is deleted. Restore it first.', code: 'LEAD_DELETED' });
      }
      if (result.outcome === 'conflict') {
        return res.status(409).json({
          success: false,
          error: 'Someone else changed this lead. Its status is now shown.',
          code: 'STATUS_CONFLICT',
          currentStatus: result.current,
        });
      }
      return res.status(200).json({
        success: true,
        data: {
          leadId: `${req.leadRef.source}-${req.leadRef.id}`,
          status: result.current,
          previousStatus: result.previous ?? result.current,
          changed: result.outcome === 'changed',
          activity: result.activity ?? null,
        },
      });
    } catch (err) {
      return fail(res, err, 'Lead status');
    }
  });

  router.post('/:leadId/notes', async (req, res) => {
    try {
      const body = parseNoteBody(req.body);
      const result = await leads.addNote(req.leadRef, { body, admin: admin(req) });
      if (result.outcome === 'not_found') return notFound(res);
      return res.status(201).json({ success: true, data: { note: result.note, activity: result.activity } });
    } catch (err) {
      return fail(res, err, 'Lead note');
    }
  });

  router.delete('/:leadId', async (req, res) => {
    try {
      const reason = parseDeleteBody(req.body);
      const result = await leads.softDelete(req.leadRef, { reason, admin: admin(req) });
      if (result.outcome === 'not_found') return notFound(res);
      if (result.outcome === 'already_deleted') {
        return res.status(409).json({ success: false, error: 'This lead is already deleted.', code: 'ALREADY_DELETED' });
      }
      return res.status(200).json({
        success: true,
        data: { leadId: `${req.leadRef.source}-${req.leadRef.id}`, deletedAt: result.deletedAt, activity: result.activity },
      });
    } catch (err) {
      return fail(res, err, 'Lead delete');
    }
  });

  router.post('/:leadId/restore', async (req, res) => {
    try {
      const result = await leads.restore(req.leadRef, { admin: admin(req) });
      if (result.outcome === 'not_found') return notFound(res);
      if (result.outcome === 'not_deleted') {
        return res.status(409).json({ success: false, error: 'This lead is not deleted.', code: 'NOT_DELETED' });
      }
      return res.status(200).json({
        success: true,
        data: { leadId: `${req.leadRef.source}-${req.leadRef.id}`, activity: result.activity },
      });
    } catch (err) {
      return fail(res, err, 'Lead restore');
    }
  });

  return router;
};

module.exports.isDatabaseUnavailable = isDatabaseUnavailable;

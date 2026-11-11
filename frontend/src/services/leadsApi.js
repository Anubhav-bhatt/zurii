/**
 * The one client for the admin lead API (/api/admin/leads — backend/routes/leads.js).
 * Every CRM screen goes through these functions; they return the normalised
 * shapes below and throw the AdminApiError / AdminAuthError family from
 * adminApi.js, so session handling stays in one place.
 *
 *   listLeads(filters)        → { items, page, pageSize, total, totalPages }
 *   getLeadSummary(scope)     → { total, byKind, byStatus, open, done, receivedSince, deleted, interests }
 *   getLead(leadId)           → { lead, notes, activity }
 *   updateLeadStatus(id, s, expected) → { leadId, status, previousStatus, changed, activity }
 *   addLeadNote(id, body)     → { note, activity }
 *   deleteLead(id, reason)    → { leadId, deletedAt, activity }
 *   restoreLead(id)           → { leadId, activity }
 */
import { adminFetch } from './adminApi';
import { API_TIMEOUT_MS } from './apiClient';
import { buildLeadQuery } from './leadQuery';

export { buildLeadQuery };

const BASE = '/api/admin/leads';

/** The caller's abort plus the app-wide timeout (AbortSignal.any where the browser has it). */
const timeout = (signal) => {
  const limit = AbortSignal.timeout(API_TIMEOUT_MS);
  if (!signal) return limit;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, limit]) : signal;
};
const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

export async function listLeads(filters, { signal } = {}) {
  const { data, meta } = await adminFetch(`${BASE}${buildLeadQuery(filters)}`, { signal: timeout(signal), envelope: true });
  return {
    items: Array.isArray(data) ? data : [],
    page: meta?.page ?? 1,
    pageSize: meta?.pageSize ?? filters?.pageSize ?? 25,
    total: meta?.total ?? 0,
    totalPages: meta?.totalPages ?? 1,
  };
}

export function getLeadSummary(scope = {}, { signal } = {}) {
  const { q, interest, priority, from, to, since } = scope;
  return adminFetch(`${BASE}/summary${buildLeadQuery({ q, interest, priority, from, to, since })}`, { signal: timeout(signal) });
}

export function getLead(leadId, { signal } = {}) {
  return adminFetch(`${BASE}/${encodeURIComponent(leadId)}`, { signal: timeout(signal) });
}

export function updateLeadStatus(leadId, status, expectedStatus) {
  return adminFetch(`${BASE}/${encodeURIComponent(leadId)}/status`, json('PATCH', { status, expectedStatus }));
}

export function addLeadNote(leadId, body) {
  return adminFetch(`${BASE}/${encodeURIComponent(leadId)}/notes`, json('POST', { body }));
}

export function deleteLead(leadId, reason) {
  return adminFetch(`${BASE}/${encodeURIComponent(leadId)}`, json('DELETE', reason ? { reason } : {}));
}

export function restoreLead(leadId) {
  return adminFetch(`${BASE}/${encodeURIComponent(leadId)}/restore`, json('POST', {}));
}

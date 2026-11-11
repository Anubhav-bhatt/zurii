/**
 * Query string for GET /api/admin/leads and /summary. Pure, so it is
 * unit-tested in Node (frontend/tests/leadQuery.test.mjs). Defaults are left
 * out, so the URL only carries what the admin actually filtered on.
 */
export function buildLeadQuery(filters = {}) {
  const params = new URLSearchParams();
  const set = (key, value, fallback) => {
    if (value !== undefined && value !== null && value !== '' && value !== fallback) params.set(key, String(value));
  };
  set('kind', filters.kind, 'all');
  set('status', filters.status, 'all');
  set('priority', filters.priority, 'all');
  set('q', typeof filters.q === 'string' ? filters.q.trim() : filters.q);
  set('interest', filters.interest);
  set('from', filters.from);
  set('to', filters.to);
  set('deleted', filters.deleted, 'exclude');
  set('sort', filters.sort, 'newest');
  set('page', filters.page, 1);
  set('pageSize', filters.pageSize);
  set('since', filters.since);
  const text = params.toString();
  return text ? `?${text}` : '';
}

/**
 * Unified lead management (Phase 4) over the two tables the public forms
 * write: `contacts` (Contact Us) and `bookings` (trip enquiries and Plan My
 * Trip). Nothing is merged or renamed; this module projects both onto one
 * model, and every mutation goes through it so each change is recorded.
 *
 * LEAD IDS are `<source>-<id>`: `contact-12`, `booking-34`. The source is the
 * table, so an id is never ambiguous and the original database id survives.
 *
 * KINDS: `contact` (contacts), `trip` (a booking for a package), `custom` (a
 * booking without one — Plan My Trip). A trip enquiry whose package was later
 * deleted (package_id is ON DELETE SET NULL) reads as `custom`.
 *
 * STATUS MODEL — one vocabulary for every lead (docs/LEAD_MANAGEMENT.md):
 *
 *   NEW         not yet handled
 *   CONTACTED   the team has reached the customer
 *   INTERESTED  the customer is engaged / evaluating
 *   CONFIRMED   the trip is booked
 *   CLOSED      handled, nothing further to do
 *   CANCELLED   the customer withdrew or the lead was lost
 *
 *   bookings.status already uses these names (CANCELLED added by 0004).
 *   contacts keep their legacy `status` (pending/completed — and 'new' on
 *   databases whose column default was 'new'); the unified value lives in
 *   contacts.lead_status, and until an admin sets one it is derived:
 *   'completed' → CLOSED, anything else → NEW. Writing a unified status also
 *   writes the matching legacy value (CONFIRMED/CLOSED/CANCELLED → completed,
 *   the rest → pending), so code that still reads `status` stays truthful.
 *
 * All SQL is parameterised; identifiers that vary are chosen from fixed
 * strings in this file, never from input.
 */

const { attributionOf } = require('./attribution');

const LEAD_STATUSES = Object.freeze(['NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED']);
const OPEN_STATUSES = Object.freeze(['NEW', 'CONTACTED', 'INTERESTED']);
const DONE_STATUSES = Object.freeze(['CONFIRMED', 'CLOSED', 'CANCELLED']);
const LEAD_KINDS = Object.freeze(['contact', 'trip', 'custom']);
const SORTS = Object.freeze({
  newest: 'created_at DESC, source DESC, id DESC',
  oldest: 'created_at ASC, source ASC, id ASC',
  name_asc: 'lower(name) ASC, created_at DESC, id DESC',
  name_desc: 'lower(name) DESC, created_at DESC, id DESC',
});
const NOTE_MAX = 2000;
const REASON_MAX = 500;
const SEARCH_MAX = 100;
const PAGE_SIZE_MAX = 100;

const contactStatusSql = (alias) =>
  `COALESCE(${alias}.lead_status, CASE WHEN ${alias}.status = 'completed' THEN 'CLOSED' ELSE 'NEW' END)`;

const legacyContactStatus = (status) => (DONE_STATUSES.includes(status) ? 'completed' : 'pending');

/** Both tables, one shape. */
const LEADS_SQL = `
  SELECT 'contact'::text AS source, c.id, 'contact'::text AS kind,
         c.name::text AS name, c.email::text AS email, c.phone::text AS phone,
         ${contactStatusSql('c')}::text AS status,
         COALESCE(c.priority, 'normal')::text AS priority, c.interest::text AS interest,
         c.message, NULL::text AS package_title, NULL::text AS package_slug,
         c.created_at, c.deleted_at
    FROM contacts c
  UNION ALL
  SELECT 'booking'::text, b.id, CASE WHEN b.package_id IS NULL THEN 'custom' ELSE 'trip' END,
         b.name::text, b.email::text, b.phone::text, b.status::text,
         'normal'::text, NULL::text, b.message, p.title::text, p.slug::text,
         b.created_at, b.deleted_at
    FROM bookings b
    LEFT JOIN packages p ON p.id = b.package_id`;

// ── ids ─────────────────────────────────────────────────────────────

function parseLeadId(value) {
  const match = /^(contact|booking)-([1-9]\d{0,9})$/.exec(typeof value === 'string' ? value : '');
  if (!match) return null;
  const id = Number(match[2]);
  return id <= 2147483647 ? { source: match[1], id } : null;
}

const formatLeadId = (source, id) => `${source}-${id}`;
const TABLE = { contact: 'contacts', booking: 'bookings' };
const FK = { contact: 'contact_id', booking: 'booking_id' };

// ── input validation ────────────────────────────────────────────────

class LeadInputError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'LeadInputError';
    this.field = field;
  }
}

const one = (query, name) => {
  const value = query[name];
  if (Array.isArray(value)) throw new LeadInputError(`Give ${name} once.`, name);
  return typeof value === 'string' ? value.trim() : undefined;
};

const instant = (value, name) => {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new LeadInputError(`${name} must be a date or date-time.`, name);
  return new Date(time).toISOString();
};

/** Validate the list query string. Unknown parameters are ignored. */
function parseListQuery(query = {}) {
  const kind = one(query, 'kind') || 'all';
  if (kind !== 'all' && !LEAD_KINDS.includes(kind)) throw new LeadInputError('Unknown kind.', 'kind');

  const statusParam = one(query, 'status') || 'all';
  let statuses = null;
  if (statusParam === 'open') statuses = [...OPEN_STATUSES];
  else if (statusParam === 'done') statuses = [...DONE_STATUSES];
  else if (statusParam !== 'all') {
    statuses = statusParam.split(',').map((s) => s.trim().toUpperCase());
    if (!statuses.length || statuses.some((s) => !LEAD_STATUSES.includes(s))) {
      throw new LeadInputError('Unknown status.', 'status');
    }
  }

  const priority = one(query, 'priority') || 'all';
  if (!['all', 'high', 'normal'].includes(priority)) throw new LeadInputError('Unknown priority.', 'priority');

  const q = one(query, 'q') || '';
  if (q.length > SEARCH_MAX) throw new LeadInputError(`Keep the search under ${SEARCH_MAX} characters.`, 'q');

  const interest = one(query, 'interest') || '';
  if (interest.length > 255) throw new LeadInputError('Interest is too long.', 'interest');

  const deleted = one(query, 'deleted') || 'exclude';
  if (!['exclude', 'only'].includes(deleted)) throw new LeadInputError('Unknown deleted filter.', 'deleted');

  const sort = one(query, 'sort') || 'newest';
  if (!SORTS[sort]) throw new LeadInputError('Unknown sort.', 'sort');

  const intParam = (name, fallback, max) => {
    const raw = one(query, name);
    if (raw === undefined || raw === '') return fallback;
    if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1 || Number(raw) > max) {
      throw new LeadInputError(`${name} must be a whole number from 1 to ${max}.`, name);
    }
    return Number(raw);
  };

  return {
    kind,
    status: statusParam,
    statuses,
    priority,
    q,
    interest,
    from: instant(one(query, 'from'), 'from'),
    to: instant(one(query, 'to'), 'to'),
    deleted,
    sort,
    page: intParam('page', 1, 100000),
    pageSize: intParam('pageSize', 25, PAGE_SIZE_MAX),
  };
}

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

function buildWhere(f, { values = [], deletedClause = true } = {}) {
  const add = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  const where = deletedClause ? [f.deleted === 'only' ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL'] : ['TRUE'];
  if (f.kind && f.kind !== 'all') where.push(`kind = ${add(f.kind)}`);
  if (f.statuses) where.push(`status = ANY(${add(f.statuses)}::text[])`);
  if (f.priority === 'high') where.push(`priority = 'high'`);
  if (f.priority === 'normal') where.push(`priority <> 'high'`);
  if (f.interest) where.push(`interest = ${add(f.interest)}`);
  if (f.from) where.push(`created_at >= ${add(f.from)}::timestamptz`);
  if (f.to) where.push(`created_at <= ${add(f.to)}::timestamptz`);
  if (f.q) {
    const like = add(`%${escapeLike(f.q)}%`);
    const parts = ['name', 'email', 'interest', 'package_title', 'message'].map((col) => `${col} ILIKE ${like}`);
    const digits = f.q.replace(/\D/g, '');
    if (digits.length >= 3) parts.push(`regexp_replace(phone, '\\D', '', 'g') LIKE ${add(`%${digits}%`)}`);
    where.push(`(${parts.join(' OR ')})`);
  }
  return { sql: where.join(' AND '), values };
}

// ── serialisation ───────────────────────────────────────────────────

const toSummary = (row) => ({
  leadId: formatLeadId(row.source, row.id),
  source: row.source,
  sourceId: row.id,
  kind: row.kind,
  name: row.name,
  email: row.email,
  phone: row.phone,
  status: row.status,
  priority: row.priority,
  interest: row.interest,
  packageTitle: row.package_title,
  packageSlug: row.package_slug,
  messagePreview: row.message ? String(row.message).slice(0, 200) : null,
  createdAt: row.created_at,
  deletedAt: row.deleted_at,
});

const toNote = (row) => ({ id: Number(row.id), body: row.body, author: row.admin_username, createdAt: row.created_at });

const toActivity = (row) => ({
  id: Number(row.id),
  action: row.action,
  fromStatus: row.from_status,
  toStatus: row.to_status,
  details: row.details ?? {},
  actor: row.admin_username,
  createdAt: row.created_at,
});

// ── service ─────────────────────────────────────────────────────────

function createLeadService(pool) {
  async function inTransaction(work) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query(result?.rollback ? 'ROLLBACK' : 'COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /** Lock the lead row and read what every mutation needs to decide. */
  async function lockLead(client, ref) {
    const sql = ref.source === 'contact'
      ? `SELECT ${contactStatusSql('c')} AS status, c.deleted_at FROM contacts c WHERE c.id = $1 FOR UPDATE`
      : 'SELECT b.status, b.deleted_at FROM bookings b WHERE b.id = $1 FOR UPDATE';
    const { rows } = await client.query(sql, [ref.id]);
    return rows[0] ?? null;
  }

  async function recordActivity(client, ref, { action, from = null, to = null, details = {}, admin }) {
    const { rows } = await client.query(
      `INSERT INTO lead_activity (${FK[ref.source]}, action, from_status, to_status, details, admin_id, admin_username)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, action, from_status, to_status, details, admin_username, created_at`,
      [ref.id, action, from, to, details, admin?.id ?? null, admin?.username ?? 'system']
    );
    return toActivity(rows[0]);
  }

  return {
    async list(filters) {
      const { sql, values } = buildWhere(filters);
      const offset = (filters.page - 1) * filters.pageSize;
      const [count, page] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS total FROM (${LEADS_SQL}) leads WHERE ${sql}`, values),
        pool.query(
          `SELECT * FROM (${LEADS_SQL}) leads WHERE ${sql}
            ORDER BY ${SORTS[filters.sort]}
            LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
          [...values, filters.pageSize, offset]
        ),
      ]);
      const total = count.rows[0].total;
      return {
        items: page.rows.map(toSummary),
        total,
        totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      };
    },

    /**
     * Counts over ALL active leads — never just the page on screen. Optional
     * scope (q, interest, priority, from, to) narrows them the way the list is
     * narrowed; kind and status are what is being counted, so they are not
     * filters here.
     */
    async summary({ since = null, ...scope } = {}) {
      const values = [since];
      const { sql: scopeSql } = buildWhere({ ...scope, kind: 'all', statuses: null }, { values, deletedClause: false });
      const [counts, interests] = await Promise.all([
        pool.query(
          `SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS total,
                  COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'contact')::int AS contact,
                  COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'trip')::int AS trip,
                  COUNT(*) FILTER (WHERE deleted_at IS NULL AND kind = 'custom')::int AS custom,
                  ${LEAD_STATUSES.map((s) => `COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = '${s}')::int AS "${s}"`).join(',\n                  ')},
                  COUNT(*) FILTER (WHERE deleted_at IS NULL
                                     AND created_at >= COALESCE($1::timestamptz, date_trunc('day', NOW())))::int AS received_since,
                  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
             FROM (${LEADS_SQL}) leads
            WHERE ${scopeSql}`,
          values
        ),
        pool.query(
          `SELECT interest, COUNT(*)::int AS count FROM contacts
            WHERE deleted_at IS NULL AND interest IS NOT NULL AND interest <> ''
            GROUP BY interest ORDER BY count DESC, interest LIMIT 50`
        ),
      ]);
      const row = counts.rows[0];
      const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, row[s]]));
      return {
        total: row.total,
        byKind: { contact: row.contact, trip: row.trip, custom: row.custom },
        byStatus,
        open: OPEN_STATUSES.reduce((n, s) => n + byStatus[s], 0),
        done: DONE_STATUSES.reduce((n, s) => n + byStatus[s], 0),
        receivedSince: row.received_since,
        deleted: row.deleted,
        interests: interests.rows,
      };
    },

    async get(ref) {
      const leadSql = ref.source === 'contact'
        ? `SELECT c.*, ${contactStatusSql('c')} AS unified_status, a.username AS deleted_by_username
             FROM contacts c LEFT JOIN admins a ON a.id = c.deleted_by WHERE c.id = $1`
        : `SELECT b.*, to_char(b.travel_date, 'YYYY-MM-DD') AS travel_date_text,
                  p.title AS package_title, p.slug AS package_slug, a.username AS deleted_by_username,
                  d.name AS destination_name, d.slug AS destination_slug
             FROM bookings b
             LEFT JOIN packages p ON p.id = b.package_id
             LEFT JOIN destinations d ON d.id = b.destination_id
             LEFT JOIN admins a ON a.id = b.deleted_by
            WHERE b.id = $1`;
      const { rows } = await pool.query(leadSql, [ref.id]);
      const row = rows[0];
      if (!row) return null;

      const [notes, activity] = await Promise.all([
        pool.query(
          `SELECT id, body, admin_username, created_at FROM lead_notes WHERE ${FK[ref.source]} = $1 ORDER BY created_at, id`,
          [ref.id]
        ),
        pool.query(
          `SELECT id, action, from_status, to_status, details, admin_username, created_at
             FROM lead_activity WHERE ${FK[ref.source]} = $1 ORDER BY created_at, id`,
          [ref.id]
        ),
      ]);

      const isContact = ref.source === 'contact';
      const lead = {
        leadId: formatLeadId(ref.source, row.id),
        source: ref.source,
        sourceId: row.id,
        kind: isContact ? 'contact' : row.package_id === null ? 'custom' : 'trip',
        name: row.name,
        email: row.email,
        phone: row.phone,
        status: isContact ? row.unified_status : row.status,
        legacyStatus: isContact ? row.status : null,
        priority: isContact ? row.priority ?? 'normal' : 'normal',
        interest: isContact ? row.interest : null,
        callback: isContact ? row.callback : null,
        message: row.message,
        origin: row.source,
        packageTitle: isContact ? null : row.package_title,
        packageSlug: isContact ? null : row.package_slug,
        travelDate: isContact ? null : row.travel_date_text,
        travellers: isContact ? null : row.travellers,
        departureCity: isContact ? null : row.departure_city,
        // The destination chosen on Plan My Trip (migration 0005); package
        // enquiries reach theirs through the package.
        destinationName: isContact ? null : row.destination_name ?? null,
        destinationSlug: isContact ? null : row.destination_slug ?? null,
        // Where the lead came from, as captured by the visitor's own browser
        // (lib/attribution.js). null for leads saved before migration 0005.
        attribution: attributionOf(row),
        // The single free-text note bookings carried before Phase 4. Shown as is,
        // never copied or rewritten.
        legacyNote: isContact ? null : row.admin_notes,
        visitorId: row.visitor_id,
        sessionId: row.session_id,
        createdAt: row.created_at,
        updatedAt: isContact ? null : row.updated_at,
        deletedAt: row.deleted_at,
        deletedBy: row.deleted_by_username ?? null,
        deleteReason: row.delete_reason,
      };
      return { lead, notes: notes.rows.map(toNote), activity: activity.rows.map(toActivity) };
    },

    /**
     * Outcomes: changed | unchanged | not_found | deleted | conflict. The row
     * is locked for the decision, so two admins changing one lead at once are
     * serialised: with expectedStatus the second is told (conflict) instead of
     * silently overwriting; without it, the trail still records the true
     * from → to of each change.
     */
    async changeStatus(ref, { status, expectedStatus = null, admin, via = 'crm' }) {
      return inTransaction(async (client) => {
        const current = await lockLead(client, ref);
        if (!current) return { outcome: 'not_found', rollback: true };
        if (current.deleted_at) return { outcome: 'deleted', rollback: true };
        if (expectedStatus && expectedStatus !== current.status) {
          return { outcome: 'conflict', current: current.status, rollback: true };
        }
        if (current.status === status) return { outcome: 'unchanged', current: status };

        if (ref.source === 'contact') {
          await client.query('UPDATE contacts SET lead_status = $2, status = $3 WHERE id = $1', [
            ref.id,
            status,
            legacyContactStatus(status),
          ]);
        } else {
          await client.query('UPDATE bookings SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
            ref.id,
            status,
          ]);
        }
        const activity = await recordActivity(client, ref, {
          action: 'status_changed',
          from: current.status,
          to: status,
          details: via === 'crm' ? {} : { via },
          admin,
        });
        return { outcome: 'changed', previous: current.status, current: status, activity };
      });
    },

    async addNote(ref, { body, admin }) {
      return inTransaction(async (client) => {
        if (!(await lockLead(client, ref))) return { outcome: 'not_found', rollback: true };
        const { rows } = await client.query(
          `INSERT INTO lead_notes (${FK[ref.source]}, body, admin_id, admin_username)
           VALUES ($1, $2, $3, $4) RETURNING id, body, admin_username, created_at`,
          [ref.id, body, admin?.id ?? null, admin?.username ?? 'system']
        );
        const note = toNote(rows[0]);
        const activity = await recordActivity(client, ref, { action: 'note_added', details: { noteId: note.id }, admin });
        return { outcome: 'added', note, activity };
      });
    },

    async softDelete(ref, { reason = null, admin, via = 'crm' }) {
      return inTransaction(async (client) => {
        const current = await lockLead(client, ref);
        if (!current) return { outcome: 'not_found', rollback: true };
        if (current.deleted_at) return { outcome: 'already_deleted', rollback: true };
        const { rows } = await client.query(
          `UPDATE ${TABLE[ref.source]} SET deleted_at = NOW(), deleted_by = $2, delete_reason = $3
            WHERE id = $1 RETURNING deleted_at`,
          [ref.id, admin?.id ?? null, reason]
        );
        const details = {};
        if (reason) details.reason = reason;
        if (via !== 'crm') details.via = via;
        const activity = await recordActivity(client, ref, { action: 'deleted', from: current.status, details, admin });
        return { outcome: 'deleted', deletedAt: rows[0].deleted_at, activity };
      });
    },

    async restore(ref, { admin }) {
      return inTransaction(async (client) => {
        const current = await lockLead(client, ref);
        if (!current) return { outcome: 'not_found', rollback: true };
        if (!current.deleted_at) return { outcome: 'not_deleted', rollback: true };
        await client.query(
          `UPDATE ${TABLE[ref.source]} SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL WHERE id = $1`,
          [ref.id]
        );
        const activity = await recordActivity(client, ref, {
          action: 'restored',
          to: current.status,
          details: { deletedAt: current.deleted_at },
          admin,
        });
        return { outcome: 'restored', activity };
      });
    },
  };
}

/** Summary query: the list's scope filters plus `since` for "received since". */
function parseSummaryQuery(query = {}) {
  const { q, interest, priority, from, to } = parseListQuery({
    q: query.q, interest: query.interest, priority: query.priority, from: query.from, to: query.to,
  });
  return { q, interest, priority, from, to, since: instant(one(query, 'since'), 'since') };
}

/** Input for the note and delete endpoints. */
function parseNoteBody(body) {
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!text) throw new LeadInputError('Write a note first.', 'body');
  if (text.length > NOTE_MAX) throw new LeadInputError(`Keep notes under ${NOTE_MAX} characters.`, 'body');
  return text;
}

function parseStatusBody(body) {
  const status = typeof body?.status === 'string' ? body.status.trim().toUpperCase() : '';
  if (!LEAD_STATUSES.includes(status)) throw new LeadInputError('Unknown status.', 'status');
  let expectedStatus = null;
  if (body.expectedStatus !== undefined && body.expectedStatus !== null) {
    expectedStatus = typeof body.expectedStatus === 'string' ? body.expectedStatus.trim().toUpperCase() : '';
    if (!LEAD_STATUSES.includes(expectedStatus)) throw new LeadInputError('Unknown expectedStatus.', 'expectedStatus');
  }
  return { status, expectedStatus };
}

function parseDeleteBody(body) {
  if (body?.reason === undefined || body.reason === null || body.reason === '') return null;
  if (typeof body.reason !== 'string') throw new LeadInputError('reason must be text.', 'reason');
  const reason = body.reason.trim();
  if (reason.length > REASON_MAX) throw new LeadInputError(`Keep the reason under ${REASON_MAX} characters.`, 'reason');
  return reason || null;
}

module.exports = {
  LEAD_STATUSES,
  OPEN_STATUSES,
  DONE_STATUSES,
  LEAD_KINDS,
  LeadInputError,
  createLeadService,
  parseLeadId,
  formatLeadId,
  parseListQuery,
  parseSummaryQuery,
  parseNoteBody,
  parseStatusBody,
  parseDeleteBody,
  legacyContactStatus,
};

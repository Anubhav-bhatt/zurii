import { Fragment, useMemo, useState } from 'react';

import { adminFetch } from '../../services/adminApi';

/**
 * "All Enquiries" — every customer enquiry, from both tables, in one list.
 *
 * WHY THIS EXISTS ON TOP OF THE TWO SOURCE TABS
 *
 * The CRM previously opened on Contact Leads. That is one of two tables, and the
 * moment it happens to be empty the dashboard says "No Inquiries Found" with
 * every KPI reading zero — while trip enquiries sit one tab over, uncounted. It
 * is the original bug wearing a different hat: the operator is not told "look in
 * the other tab", they are told there are no enquiries.
 *
 * So the default view is now the union, and an empty screen here means the
 * database really is empty. The two source tabs stay exactly as they were: this
 * one answers "what has come in?", and they answer "let me work this lead".
 *
 * NORMALISED FOR READING, NOT FOR WRITING. Rows are projected onto the common
 * fields the two models genuinely share — who, when, what status, which source —
 * and each keeps its own status vocabulary rather than being mapped onto a
 * shared one they do not have (`pending`/`completed` for a contact lead, the
 * booking flow's NEW/CONTACTED/CONFIRMED/CANCELLED for a trip enquiry).
 * Pretending they are one lifecycle is what would force the tables together.
 *
 * DELIBERATELY READ-ONLY. Status actions live on the source tabs, where they
 * apply to a single model and the backend supports them — bookings have no PATCH
 * or DELETE at all. Contacting the customer works for both, so that is what is
 * offered here. Nothing in this component writes.
 *
 * Contact leads carry email and phone in the list the CRM already loaded. Trip
 * enquiries do not, on purpose — the analytics dashboard reads that same
 * endpoint, so it stays free of personal data — and they are fetched one lead at
 * a time when an operator opens one.
 */

const digitsOnly = (value) => String(value ?? '').replace(/[^\d]/g, '');

/** IN numbers are stored locally; wa.me needs a country code. */
const whatsappNumber = (phone) => {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
};

const formatDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const relativeTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  const days = Math.floor(mins / 1440);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

/** The same tidy-up the contacts table applies to `interest`. */
const cleanInterest = (interest) => {
  if (!interest) return 'General';
  if (interest.startsWith('Quote Request: ')) return interest.replace('Quote Request: ', '');
  if (interest.startsWith('Plan Your Dream Trip')) return 'Landing Lead';
  return interest;
};

const TYPE_STYLES = {
  contact: 'text-violet-700 bg-violet-50 border-violet-100',
  booking: 'text-sky-700 bg-sky-50 border-sky-100',
};

const STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  NEW: 'bg-violet-50 text-violet-700 border-violet-100',
  CONTACTED: 'bg-blue-50 text-blue-700 border-blue-100',
  CONFIRMED: 'bg-green-50 text-green-700 border-green-100',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

/** Project a contact row onto the shared reading model. */
function normalizeContact(row) {
  return {
    key: `contact-${row.id}`,
    id: row.id,
    type: 'contact',
    typeLabel: 'Contact Lead',
    customerName: row.name || '—',
    email: row.email || null,
    phone: row.phone || null,
    createdAt: row.created_at,
    status: row.status === 'completed' ? 'completed' : 'pending',
    source: cleanInterest(row.interest),
    message: row.message || null,
    priority: row.priority === 'high' ? 'high' : 'normal',
    // Contact leads carry no trip fields; the column stays empty rather than
    // being filled with a plausible-looking guess.
    trip: null,
  };
}

/** The same, for a booking list row. */
function normalizeBooking(row) {
  return {
    key: `booking-${row.id}`,
    id: row.id,
    type: 'booking',
    typeLabel: 'Trip Enquiry',
    customerName: row.name || '—',
    // Not in the list payload — fetched on open. `undefined` rather than null so
    // the row can tell "not loaded yet" from "the customer left it blank".
    email: undefined,
    phone: undefined,
    createdAt: row.createdAt,
    status: row.status || 'NEW',
    source: 'Enquire / Plan My Trip',
    message: undefined,
    priority: 'normal',
    trip: {
      packageTitle: row.packageTitle || 'Custom / unspecified',
      departureCity: row.departureCity || null,
      travelDate: row.travelDate || null,
      travellers: row.travellers ?? null,
    },
  };
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'contact', label: 'Contact Leads' },
  { key: 'booking', label: 'Trip Enquiries' },
];

export default function AllEnquiries({
  contacts = [],
  tripEnquiries = [],
  loading = false,
  contactError = '',
  tripError = '',
  onRefresh,
  onOpenSource,
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  /** id → { loading, error, data } for trip enquiries whose details were opened. */
  const [details, setDetails] = useState({});

  const rows = useMemo(() => {
    const merged = [...contacts.map(normalizeContact), ...tripEnquiries.map(normalizeBooking)];
    // One chronological stream, because "what has come in?" is a question about
    // time, not about which table the row happens to live in.
    return merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [contacts, tripEnquiries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (!q) return true;
      // Searches every field the row actually holds. A trip enquiry's email and
      // phone are not here because the list does not carry them; its package and
      // departure city are, which is how an operator looks one up.
      const blob = [
        row.customerName,
        row.email,
        row.phone,
        row.typeLabel,
        row.source,
        row.status,
        row.message,
        row.trip?.packageTitle,
        row.trip?.departureCity,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [rows, search, typeFilter]);

  const openRow = async (row) => {
    if (expanded === row.key) {
      setExpanded(null);
      return;
    }
    setExpanded(row.key);
    // Only trip enquiries need a request; a contact lead is already fully loaded.
    if (row.type !== 'booking' || details[row.id]?.data) return;

    setDetails((prev) => ({ ...prev, [row.id]: { loading: true, error: '', data: null } }));
    try {
      const data = await adminFetch(`/api/admin/bookings/${row.id}`, {
        signal: AbortSignal.timeout(30000),
      });
      setDetails((prev) => ({ ...prev, [row.id]: { loading: false, error: '', data } }));
    } catch (err) {
      setDetails((prev) => ({
        ...prev,
        [row.id]: { loading: false, error: err.message || 'Could not load this enquiry.', data: null },
      }));
    }
  };

  const counts = useMemo(
    () => ({
      contact: rows.filter((r) => r.type === 'contact').length,
      booking: rows.filter((r) => r.type === 'booking').length,
    }),
    [rows]
  );

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/50 shadow-xs overflow-hidden">
      <div className="p-5 md:p-6 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">All Enquiries</h2>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            Every enquiry from both sources · {counts.contact} contact {counts.contact === 1 ? 'lead' : 'leads'}
            {' · '}
            {counts.booking} trip {counts.booking === 1 ? 'enquiry' : 'enquiries'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, package…"
              className="w-64 border border-zinc-200 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all font-medium"
            />
            <svg className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setTypeFilter(f.key)}
            aria-pressed={typeFilter === f.key}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              typeFilter === f.key ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* One source failing must not hide the other's rows, so the warning sits
          above the list rather than replacing it. */}
      {(contactError || tripError) && (
        <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          {contactError && <p>Contact leads: {contactError}</p>}
          {tripError && <p>Trip enquiries: {tripError}</p>}
          <p className="font-medium mt-1 text-amber-700">
            Rows from the other source are still listed below.
          </p>
        </div>
      )}

      {loading && rows.length === 0 && (
        <div className="p-10 text-center text-xs font-medium text-zinc-400">Loading enquiries…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="p-12 text-center">
          <span className="text-4xl block mb-3">📭</span>
          <p className="text-sm font-semibold text-zinc-600">
            {rows.length === 0 ? 'No enquiries yet.' : 'No enquiries match that search.'}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1 font-medium max-w-md mx-auto leading-relaxed">
            {rows.length === 0
              ? 'This covers both sources — the contact forms and the Enquire / Plan My Trip forms. An empty list here means nothing has been submitted.'
              : 'Clear the search or switch the filter above.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60">
                {['Type', 'Customer', 'Details', 'Status', 'Received', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isOpen = expanded === row.key;
                const detail = row.type === 'booking' ? details[row.id] : null;
                // A contact lead is its own detail; a trip enquiry's arrives separately.
                const contactInfo = row.type === 'contact' ? row : detail?.data;
                const wa = whatsappNumber(contactInfo?.phone);
                return (
                  // Keyed Fragment: `<>` cannot take a key, and an open row
                  // renders two siblings.
                  <Fragment key={row.key}>
                    <tr className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <span className={`text-[9px] font-bold uppercase tracking-wider border rounded px-1.5 py-0.5 whitespace-nowrap ${TYPE_STYLES[row.type]}`}>
                          {row.typeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-zinc-900">{row.customerName}</p>
                          {row.priority === 'high' && (
                            <span className="text-[8px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              Quote
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 font-medium mt-0.5">{row.source}</p>
                      </td>
                      <td className="px-4 py-3 align-top max-w-xs">
                        {row.trip ? (
                          <>
                            <p className="text-xs font-semibold text-zinc-800 truncate">{row.trip.packageTitle}</p>
                            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
                              {[
                                row.trip.departureCity && `from ${row.trip.departureCity}`,
                                formatDate(row.trip.travelDate),
                                row.trip.travellers != null && `${row.trip.travellers} travelling`,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No trip details given'}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-zinc-600 truncate">{row.message || '—'}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_STYLES[row.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                        {relativeTime(row.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openRow(row)}
                          aria-expanded={isOpen}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                        >
                          {isOpen ? 'Close' : 'Open'}
                        </button>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-zinc-50 bg-zinc-50/40">
                        <td colSpan={6} className="px-4 py-4">
                          {detail?.loading && (
                            <p className="text-xs font-medium text-zinc-400">Loading contact details…</p>
                          )}
                          {detail?.error && <p className="text-xs font-semibold text-red-600">{detail.error}</p>}

                          {contactInfo && (
                            <div className="flex flex-col gap-3 max-w-3xl">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {contactInfo.email && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</p>
                                    <p className="text-xs text-zinc-800 font-medium break-all">{contactInfo.email}</p>
                                  </div>
                                )}
                                {contactInfo.phone && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Phone</p>
                                    <p className="text-xs text-zinc-800 font-medium tabular-nums">{contactInfo.phone}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Received</p>
                                  <p className="text-xs text-zinc-800 font-medium">{formatDate(row.createdAt) || '—'}</p>
                                </div>
                              </div>

                              {contactInfo.message && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
                                    Customer message
                                  </p>
                                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">{contactInfo.message}</p>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {contactInfo.phone && (
                                  <a
                                    href={`tel:${digitsOnly(contactInfo.phone)}`}
                                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                                  >
                                    Call
                                  </a>
                                )}
                                {wa && (
                                  <a
                                    href={`https://wa.me/${wa}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700 hover:bg-green-100"
                                  >
                                    WhatsApp
                                  </a>
                                )}
                                {contactInfo.email && (
                                  <a
                                    href={`mailto:${contactInfo.email}`}
                                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                                  >
                                    Email
                                  </a>
                                )}
                                {/* Status actions belong to the source tab, which
                                    owns that model's lifecycle. */}
                                <button
                                  type="button"
                                  onClick={() => onOpenSource?.(row.type === 'contact' ? 'contacts' : 'bookings')}
                                  className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-100"
                                >
                                  {row.type === 'contact' ? 'Manage in Contact Leads →' : 'Open Trip Enquiries →'}
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="px-5 py-3 border-t border-zinc-100 text-[11px] font-medium text-zinc-400">
          Showing {filtered.length} of {rows.length} {rows.length === 1 ? 'enquiry' : 'enquiries'}
          {' · '}read-only view; status actions live on the source tabs
        </div>
      )}
    </div>
  );
}

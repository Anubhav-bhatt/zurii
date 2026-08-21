import { Fragment, useMemo, useState } from 'react';

import { adminFetch } from '../../services/adminApi';
import { API_TIMEOUT_MS } from '../../services/apiClient';

/**
 * The Trip Enquiries tab of the CRM — enquiries submitted through EnquiryForm
 * (the Enquire buttons and the Plan Trip page), which are stored in `bookings`.
 *
 * WHY THIS IS A SEPARATE COMPONENT AND NOT A SECOND ROW TYPE IN THE LEAD TABLE
 *
 * `contacts` and `bookings` are different data models, not two shapes of one
 * thing. A contact lead carries interest/priority/callback and moves through a
 * pending→completed lifecycle the CRM drives. A trip enquiry carries a package,
 * a travel date, a traveller count and a departure city, and its status is
 * written by the booking flow. Normalising them into one list means either
 * discarding the trip fields or padding every contact row with empty columns,
 * and it means the existing complete/reopen/delete actions have to grow a
 * branch for rows they cannot act on.
 *
 * Keeping them side by side as tabs leaves the contacts CRM — its filters,
 * pagination, optimistic updates and drawer — exactly as it was, which is the
 * whole reason enquiries went missing in the first place: nobody had to touch
 * that code, so nobody noticed it only ever read one table.
 *
 * READ-ONLY, DELIBERATELY. There is no PATCH or DELETE for bookings on the
 * backend, so this offers no status actions. Faking them by writing to a column
 * the booking flow does not read would produce a CRM that says an enquiry was
 * handled while the rest of the system disagrees. Contacting the customer is
 * what an operator can actually do from here, so that is what is offered.
 *
 * The rows arrive as a prop rather than being fetched here. The page needs the
 * count before this tab is ever opened — an empty badge is exactly how these
 * enquiries stayed invisible — and fetching in both places would issue the same
 * request twice. So the page owns the data and this owns how it looks.
 *
 * CONTACT DETAILS ARE FETCHED PER LEAD, ON OPEN. The list endpoint deliberately
 * carries no email, phone or message: the analytics dashboard reads the same
 * endpoint for counts and trends, so widening it would put dozens of customers'
 * contact details into every response that page makes, for no use at all.
 * Opening one lead fetches one detail record, which is the same data under the
 * same authorisation with a fraction of the exposure.
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

const STATUS_STYLES = {
  NEW: 'bg-violet-50 text-violet-700 border-violet-100',
  CONTACTED: 'bg-blue-50 text-blue-700 border-blue-100',
  CONFIRMED: 'bg-green-50 text-green-700 border-green-100',
  CANCELLED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
};

export default function TripEnquiries({ enquiries = [], loading = false, error = '', onRefresh }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  /** id → { loading, error, data } for leads whose details have been opened. */
  const [details, setDetails] = useState({});

  const openLead = async (id) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (details[id]?.data) return; // already fetched this session

    setDetails((prev) => ({ ...prev, [id]: { loading: true, error: '', data: null } }));
    try {
      const data = await adminFetch(`/api/admin/bookings/${id}`, {
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
      setDetails((prev) => ({ ...prev, [id]: { loading: false, error: '', data } }));
    } catch (err) {
      setDetails((prev) => ({
        ...prev,
        [id]: { loading: false, error: err.message || 'Could not load this enquiry.', data: null },
      }));
    }
  };

  // Searches what the list actually holds. Email and phone are not searchable
  // here because the list does not carry them — see the note above. Name,
  // package, departure city and status cover how an operator looks for a lead.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enquiries;
    return enquiries.filter((e) =>
      [e.name, e.packageTitle, e.departureCity, e.status]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }, [enquiries, search]);

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/50 shadow-xs overflow-hidden">
      <div className="p-5 md:p-6 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Trip Enquiries</h2>
          <p className="text-[11px] text-zinc-400 font-medium mt-0.5">
            Submitted through Enquire buttons and Plan&nbsp;My&nbsp;Trip · stored in <code>bookings</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, package, city…"
              className="w-56 border border-zinc-200 rounded-xl pl-8 pr-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 transition-all font-medium"
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

      {error && (
        <div className="m-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">
          {error}
        </div>
      )}

      {loading && enquiries.length === 0 && (
        <div className="p-10 text-center text-xs font-medium text-zinc-400">Loading trip enquiries…</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="p-10 text-center">
          <p className="text-sm font-semibold text-zinc-600">
            {enquiries.length === 0 ? 'No trip enquiries yet.' : 'No enquiries match that search.'}
          </p>
          <p className="text-[11px] text-zinc-400 mt-1 font-medium">
            {enquiries.length === 0
              ? 'They appear here the moment someone submits the Enquire or Plan My Trip form.'
              : 'Clear the search to see all of them.'}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60">
                {['Customer', 'Trip', 'Travel date', 'Travellers', 'Status', 'Received', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isOpen = expanded === e.id;
                const detail = details[e.id];
                const contact = detail?.data;
                const wa = whatsappNumber(contact?.phone);
                return (
                  // A keyed Fragment, not `<>`: the shorthand cannot take a key,
                  // and each enquiry renders two sibling rows when its note is open.
                  <Fragment key={e.id}>
                    <tr className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-violet-700 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                            Trip Enquiry
                          </span>
                        </div>
                        <p className="text-xs font-bold text-zinc-900 mt-1.5">{e.name || '—'}</p>
                        <p className="text-[11px] text-zinc-400 font-medium">Open to see contact details</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs font-semibold text-zinc-800">{e.packageTitle || 'Custom / unspecified'}</p>
                        {e.departureCity && (
                          <p className="text-[11px] text-zinc-500 font-medium mt-0.5">from {e.departureCity}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-xs font-medium text-zinc-700 whitespace-nowrap">
                        {formatDate(e.travelDate) || '—'}
                      </td>
                      <td className="px-4 py-3 align-top text-xs font-medium text-zinc-700 tabular-nums">
                        {e.travellers ?? '—'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`text-[10px] font-bold uppercase tracking-wide border rounded-full px-2 py-0.5 whitespace-nowrap ${STATUS_STYLES[e.status] || 'bg-zinc-100 text-zinc-600 border-zinc-200'}`}>
                          {e.status || 'NEW'}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top text-[11px] font-medium text-zinc-500 whitespace-nowrap">
                        {relativeTime(e.createdAt)}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openLead(e.id)}
                          aria-expanded={isOpen}
                          className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                        >
                          {isOpen ? 'Close' : 'Open'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-zinc-50 bg-zinc-50/40">
                        <td colSpan={7} className="px-4 py-4">
                          {detail?.loading && (
                            <p className="text-xs font-medium text-zinc-400">Loading contact details…</p>
                          )}
                          {detail?.error && (
                            <p className="text-xs font-semibold text-red-600">{detail.error}</p>
                          )}
                          {contact && (
                            <div className="flex flex-col gap-3 max-w-3xl">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {contact.email && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Email</p>
                                    <p className="text-xs text-zinc-800 font-medium break-all">{contact.email}</p>
                                  </div>
                                )}
                                {contact.phone && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Phone</p>
                                    <p className="text-xs text-zinc-800 font-medium tabular-nums">{contact.phone}</p>
                                  </div>
                                )}
                                {contact.source && (
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Source</p>
                                    <p className="text-xs text-zinc-800 font-medium">{contact.source}</p>
                                  </div>
                                )}
                              </div>

                              {contact.message && (
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-1">
                                    Customer message
                                  </p>
                                  <p className="text-xs text-zinc-700 whitespace-pre-wrap">{contact.message}</p>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5 flex-wrap">
                                {contact.phone && (
                                  <a
                                    href={`tel:${digitsOnly(contact.phone)}`}
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
                                {contact.email && (
                                  <a
                                    href={`mailto:${contact.email}`}
                                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-bold text-zinc-600 hover:bg-zinc-50"
                                  >
                                    Email
                                  </a>
                                )}
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
          Showing {filtered.length} of {enquiries.length} trip {enquiries.length === 1 ? 'enquiry' : 'enquiries'}
          {' · '}status is set by the booking flow and is read-only here
        </div>
      )}
    </div>
  );
}

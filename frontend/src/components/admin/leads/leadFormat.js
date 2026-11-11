/**
 * Labels, styles and small formatters shared by the lead CRM. Pure functions —
 * no React — so they are unit-tested in Node (frontend/tests/leadFormat.test.mjs).
 */

/** The unified status model (backend/lib/leads.js, docs/LEAD_MANAGEMENT.md). */
export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'CONFIRMED', 'CLOSED', 'CANCELLED'];
export const OPEN_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED'];
export const DONE_STATUSES = ['CONFIRMED', 'CLOSED', 'CANCELLED'];

export const STATUS_LABELS = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  INTERESTED: 'Interested',
  CONFIRMED: 'Confirmed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

export const STATUS_STYLES = {
  NEW: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  CONTACTED: 'bg-blue-50 text-blue-700 border-blue-200',
  INTERESTED: 'bg-violet-50 text-violet-700 border-violet-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const KIND_LABELS = { contact: 'Contact', trip: 'Trip enquiry', custom: 'Custom trip' };

export const isDone = (status) => DONE_STATUSES.includes(status);

/** Contact interests are stored as typed; the CRM always showed them tidied. */
export function cleanInterest(interest) {
  if (!interest) return 'General';
  if (interest.startsWith('Quote Request: ')) return interest.replace('Quote Request: ', '');
  if (interest.startsWith('Plan Your Dream Trip')) return 'Landing Lead';
  return interest;
}

/** What the lead is about: package, interest, or the kind of enquiry. */
export function leadSubject(lead) {
  if (lead.kind === 'trip') return lead.packageTitle || 'Trip enquiry';
  if (lead.kind === 'custom') return 'Custom trip';
  return cleanInterest(lead.interest);
}

const digitsOnly = (value) => String(value ?? '').replace(/[^\d]/g, '');

/** wa.me needs a country code; 10-digit numbers are Indian mobiles. */
export function whatsappNumber(phone) {
  const digits = digitsOnly(phone);
  if (!digits) return null;
  return digits.length === 10 ? `91${digits}` : digits;
}

export function whatsappHref(lead, { withGreeting = false } = {}) {
  const number = whatsappNumber(lead.phone);
  if (!number) return null;
  if (!withGreeting) return `https://wa.me/${number}`;
  const text = `Hello ${lead.name}! Connecting from Zurii Travels regarding your inquiry for ${leadSubject(lead)}.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** The address is encoded, so an address like `a@b.c?bcc=x` cannot add headers. */
export function mailtoHref(lead) {
  if (!lead.email) return null;
  const subject = `Zurii Travels Package Quote Inquiry — ${leadSubject(lead)}`;
  return `mailto:${encodeURIComponent(lead.email)}?subject=${encodeURIComponent(subject)}`;
}

export function relativeTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function formatDate(value, options = { day: '2-digit', month: 'long', year: 'numeric' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-IN', options);
}

export function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Local-day boundaries for a YYYY-MM-DD from the date inputs, as ISO instants. */
export function dayStartIso(day) {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function dayEndIso(day) {
  if (!day) return '';
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** Quick date ranges the CRM always offered, as YYYY-MM-DD in local time. */
export function quickRange(key, now = new Date()) {
  const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (n) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  switch (key) {
    case 'today': return { from: ymd(today), to: ymd(today) };
    case 'yesterday': return { from: ymd(daysAgo(1)), to: ymd(daysAgo(1)) };
    case '7d': return { from: ymd(daysAgo(7)), to: ymd(today) };
    case '30d': return { from: ymd(daysAgo(30)), to: ymd(today) };
    case 'this-month': return { from: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymd(today) };
    case 'last-month':
      return {
        from: ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        to: ymd(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    default: return { from: '', to: '' };
  }
}

const ACTIVITY_TEXT = {
  status_changed: (a) => `Status ${STATUS_LABELS[a.fromStatus] ?? a.fromStatus} → ${STATUS_LABELS[a.toStatus] ?? a.toStatus}`,
  note_added: () => 'Note added',
  deleted: (a) => `Deleted${a.details?.reason ? ` — ${a.details.reason}` : ''}`,
  restored: () => 'Restored',
};

export function describeActivity(entry) {
  const text = ACTIVITY_TEXT[entry.action]?.(entry) ?? entry.action;
  return entry.details?.via === 'legacy-api' ? `${text} (older admin screen)` : text;
}

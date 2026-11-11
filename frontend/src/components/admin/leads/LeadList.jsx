import {
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  isDone,
  leadSubject,
  relativeTime,
  whatsappHref,
} from './leadFormat';

const ACTION = 'w-8 h-8 rounded-lg flex items-center justify-center border transition-colors';

function StatusBadge({ status }) {
  return (
    <span className={`text-[8px] font-black uppercase tracking-wider border px-1.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status] ?? STATUS_STYLES.CLOSED}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function KindBadge({ kind }) {
  return (
    <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50/50 border border-violet-100/50 px-2 py-0.5 rounded-full whitespace-nowrap">
      {KIND_LABELS[kind] ?? kind}
    </span>
  );
}

/** Row actions: contact the customer, then the lifecycle actions. */
function Actions({ lead, busy, onComplete, onReopen, onDelete, onRestore, compact = false }) {
  const wa = whatsappHref(lead);
  const btn = (label, title, onClick, tone, icon) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={title}
      aria-label={`${title}: ${lead.name}`}
      className={compact ? `px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${tone}` : `${ACTION} ${tone}`}
    >
      {compact ? label : icon}
    </button>
  );
  if (lead.deletedAt) {
    return btn('Restore', 'Restore lead', onRestore, 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200', '↺');
  }
  return (
    <>
      <a
        href={`tel:${lead.phone}`}
        title={`Call: ${lead.phone}`}
        className={compact ? 'px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 rounded-lg text-[10px] font-bold text-zinc-700 border border-zinc-200/50' : `${ACTION} bg-zinc-50 hover:bg-zinc-100 border-zinc-200/50 text-zinc-600`}
      >
        {compact ? 'Call' : '📞'}
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          title="Chat on WhatsApp"
          className={compact ? 'px-2.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[10px] font-bold border border-emerald-100' : `${ACTION} bg-emerald-50/80 hover:bg-emerald-100/80 border-emerald-100/50 text-emerald-600`}
        >
          {compact ? 'WhatsApp' : '💬'}
        </a>
      )}
      {isDone(lead.status)
        ? btn('Reopen', 'Reopen lead', onReopen, 'bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200', '↺')
        : btn('Complete', 'Mark completed', onComplete, 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200', '✓')}
      {btn('Delete', 'Delete lead', onDelete, 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200', '🗑️')}
    </>
  );
}

/** One page of leads from the server: a table on desktop, cards on mobile. */
export default function LeadList({ items, page, pageSize, busyId, onOpen, ...actions }) {
  const stop = (e) => e.stopPropagation();
  return (
    <>
      <div className="hidden md:block bg-white rounded-3xl border border-zinc-200/50 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-100 text-zinc-500 uppercase tracking-widest text-[9px] font-black">
                <th scope="col" className="text-left px-6 py-4 w-12">#</th>
                <th scope="col" className="text-left px-6 py-4">Name</th>
                <th scope="col" className="text-left px-6 py-4">Source / Trip</th>
                <th scope="col" className="text-left px-6 py-4">Message Summary</th>
                <th scope="col" className="text-left px-6 py-4">Time</th>
                <th scope="col" className="text-center px-6 py-4 w-44">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-medium text-zinc-700">
              {items.map((lead, idx) => {
                const isHigh = lead.priority === 'high' && !isDone(lead.status);
                return (
                  <tr
                    key={lead.leadId}
                    onClick={() => onOpen(lead)}
                    className={`hover:bg-zinc-50/70 transition-colors cursor-pointer group ${isHigh ? 'bg-amber-50/15' : ''}`}
                  >
                    <td className="px-6 py-4 font-mono text-zinc-400">
                      {isHigh ? <span className="text-amber-500 font-bold" title="High Priority">🔥</span> : (page - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-6 py-4 font-bold text-zinc-900 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={(e) => { stop(e); onOpen(lead); }} className="text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
                          {lead.name}
                        </button>
                        <StatusBadge status={lead.status} />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1 items-start">
                        <KindBadge kind={lead.kind} />
                        <span className="text-[10px] text-zinc-500 max-w-[14rem] truncate">{leadSubject(lead)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-zinc-500 max-w-xs truncate">{lead.messagePreview || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-zinc-800 font-semibold">{relativeTime(lead.createdAt)}</div>
                      <div className="text-[9px] text-zinc-400 font-medium">
                        {new Date(lead.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center" onClick={stop}>
                      <div className="flex items-center justify-center gap-1.5">
                        <Actions lead={lead} busy={busyId === lead.leadId} {...bindActions(actions, lead)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="md:hidden space-y-4">
        {items.map((lead, idx) => {
          const isHigh = lead.priority === 'high' && !isDone(lead.status);
          return (
            <li
              key={lead.leadId}
              className={`bg-white rounded-2xl border border-zinc-200/50 p-5 shadow-xs flex flex-col gap-4 ${isHigh ? 'border-l-4 border-l-amber-500' : ''}`}
            >
              <button type="button" onClick={() => onOpen(lead)} className="text-left">
                <div className="flex justify-between items-start mb-2 gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 font-mono">#{(page - 1) * pageSize + idx + 1}</span>
                    <KindBadge kind={lead.kind} />
                    <StatusBadge status={lead.status} />
                  </div>
                  <span className="text-[10px] text-zinc-400 font-bold whitespace-nowrap">{relativeTime(lead.createdAt)}</span>
                </div>
                <span className="block font-bold text-zinc-950 text-base leading-snug">
                  {lead.name} {isHigh && <span className="text-amber-500">🔥</span>}
                </span>
                <span className="block text-[11px] text-violet-600 font-semibold mt-0.5">{leadSubject(lead)}</span>
                <span className="block text-xs text-zinc-500 mt-2 line-clamp-2 leading-relaxed">{lead.messagePreview || '—'}</span>
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-100">
                <Actions lead={lead} compact busy={busyId === lead.leadId} {...bindActions(actions, lead)} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const bindActions = ({ onComplete, onReopen, onDelete, onRestore }, lead) => ({
  onComplete: () => onComplete(lead),
  onReopen: () => onReopen(lead),
  onDelete: () => onDelete(lead),
  onRestore: () => onRestore(lead),
});

/** Server-side pages: the totals are the server's, never a count of rows loaded. */
export function Pagination({ page, pageSize, total, totalPages, onPage, onPageSize }) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  const navBtn = 'px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed bg-white';
  return (
    <nav className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4" aria-label="Lead pages">
      <div className="flex items-center gap-2">
        <label htmlFor="lead-page-size" className="text-xs text-zinc-400 font-medium">Rows per page:</label>
        <select
          id="lead-page-size"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="border border-zinc-200 rounded-lg px-2.5 py-1 text-xs outline-none bg-white font-semibold text-zinc-700"
        >
          {[10, 25, 50, 100].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <span className="text-xs text-zinc-400 font-medium ml-2" aria-live="polite">
          Showing {first} – {last} of {total}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(1)} className={navBtn} aria-label="First page">«</button>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={navBtn}>Prev</button>
        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-zinc-400 font-medium">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                p === page ? 'bg-violet-600 border-violet-600 text-white shadow-xs' : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className={navBtn}>Next</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(totalPages)} className={navBtn} aria-label="Last page">»</button>
      </div>
    </nav>
  );
}

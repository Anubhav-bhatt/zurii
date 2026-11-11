import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AdminApiError, AdminAuthError } from '../../../services/adminApi';
import { deleteLead, getLeadSummary, listLeads, restoreLead, updateLeadStatus } from '../../../services/leadsApi';
import LeadDrawer from './LeadDrawer';
import LeadFilters from './LeadFilters';
import LeadList, { Pagination } from './LeadList';
import { dayEndIso, dayStartIso, quickRange } from './leadFormat';

const INITIAL = {
  view: 'all', // all | contact | trip | custom | deleted
  group: 'all', // all | open | done
  status: '', // one exact status, overrides group
  searchInput: '',
  q: '',
  interest: '',
  priority: 'all',
  dateFrom: '',
  dateTo: '',
  quick: 'all',
  sort: 'newest',
  page: 1,
  pageSize: 10,
};

const todayStartIso = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
};

/**
 * The unified CRM: every enquiry from both tables, paged, filtered and counted
 * by the server (backend/routes/leads.js). Nothing is loaded wholesale into the
 * browser, and every figure on screen is a server count.
 */
export default function LeadsWorkspace({ refreshKey = 0, onAuthLost, onPasswordChangeRequired, onLoadingChange }) {
  const [filters, setFilters] = useState(INITIAL);
  const [list, setList] = useState({ loading: true, error: '', items: [], total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openLeadId, setOpenLeadId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toComplete, setToComplete] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  /** Session problems go to the page; everything else is shown here. */
  const handleSessionError = useCallback(
    (err) => {
      if (err instanceof AdminAuthError) {
        onAuthLost();
        return true;
      }
      if (err instanceof AdminApiError && err.code === 'PASSWORD_CHANGE_REQUIRED') {
        onPasswordChangeRequired();
        return true;
      }
      return false;
    },
    [onAuthLost, onPasswordChangeRequired]
  );

  const showToast = useCallback((message, type = 'success', undo = null) => {
    clearTimeout(toastTimer.current);
    setToast({ message, type, undo });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // Debounced search: the server is asked once the admin pauses typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === f.searchInput.trim() ? f : { ...f, q: f.searchInput.trim(), page: 1 }));
    }, 300);
    return () => clearTimeout(t);
  }, [filters.searchInput]);

  const params = useMemo(
    () => ({
      kind: filters.view === 'deleted' ? 'all' : filters.view,
      deleted: filters.view === 'deleted' ? 'only' : 'exclude',
      status: filters.status || filters.group,
      priority: filters.priority,
      q: filters.q,
      interest: filters.interest,
      from: dayStartIso(filters.dateFrom),
      to: dayEndIso(filters.dateTo),
      sort: filters.sort,
      page: filters.page,
      pageSize: filters.pageSize,
    }),
    [filters.view, filters.status, filters.group, filters.priority, filters.q, filters.interest, filters.dateFrom, filters.dateTo, filters.sort, filters.page, filters.pageSize]
  );

  useEffect(() => {
    const controller = new AbortController();
    setList((l) => ({ ...l, loading: true, error: '' }));
    onLoadingChange?.(true);
    listLeads(params, { signal: controller.signal })
      .then((result) => {
        setList({ loading: false, error: '', items: result.items, total: result.total, totalPages: result.totalPages });
        // A delete can empty the last page; step back rather than show nothing.
        if (result.items.length === 0 && result.total > 0 && params.page > result.totalPages) {
          setFilters((f) => ({ ...f, page: result.totalPages }));
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (handleSessionError(err)) return;
        const message = err.name === 'TimeoutError' ? 'The request timed out. The server may be waking up — try again.' : err.message;
        setList((l) => ({ ...l, loading: false, error: message || 'Could not load enquiries.' }));
      })
      .finally(() => onLoadingChange?.(false));
    return () => controller.abort();
  }, [params, reloadKey, refreshKey, handleSessionError, onLoadingChange]);

  useEffect(() => {
    const controller = new AbortController();
    getLeadSummary({ since: todayStartIso() }, { signal: controller.signal })
      .then(setSummary)
      .catch((err) => {
        if (err.name !== 'AbortError') handleSessionError(err);
      });
    return () => controller.abort();
  }, [reloadKey, refreshKey, handleSessionError]);

  const update = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
  const onQuick = (key) => {
    const { from, to } = quickRange(key);
    update({ quick: key, dateFrom: from, dateTo: to });
  };

  // ── mutations ─────────────────────────────────────────────────────
  const run = async (lead, work, success, undo) => {
    setBusyId(lead.leadId);
    try {
      await work();
      showToast(success, 'success', undo);
    } catch (err) {
      if (handleSessionError(err)) return;
      if (err instanceof AdminApiError && (err.code === 'STATUS_CONFLICT' || err.status === 409)) {
        showToast('Someone else changed this lead — the list has been refreshed.', 'error');
      } else {
        showToast(err.message || 'That did not work. Please try again.', 'error');
      }
    } finally {
      setBusyId(null);
      reload();
    }
  };

  const setStatus = (lead, status, message) =>
    run(lead, () => updateLeadStatus(lead.leadId, status, lead.status), message, () =>
      run({ ...lead, status }, () => updateLeadStatus(lead.leadId, lead.status, status), 'Change undone.')
    );

  const doDelete = (lead, reason) =>
    run(lead, () => deleteLead(lead.leadId, reason), 'Lead moved to Deleted. It can be restored.', () =>
      run(lead, () => restoreLead(lead.leadId), 'Lead restored.')
    );

  const doRestore = (lead) => run(lead, () => restoreLead(lead.leadId), 'Lead restored.');

  // ── view ──────────────────────────────────────────────────────────
  const k = summary?.byKind;
  const tabs = [
    { key: 'all', label: 'All Enquiries', count: summary?.total },
    { key: 'contact', label: 'Contact Leads', count: k?.contact },
    { key: 'trip', label: 'Trip Enquiries', count: k?.trip },
    { key: 'custom', label: 'Custom Trips', count: k?.custom },
    { key: 'deleted', label: 'Deleted', count: summary?.deleted },
  ];
  const done = summary ? summary.done : 0;
  const cards = [
    {
      label: 'Total Enquiries',
      value: summary?.total ?? '—',
      desc: k ? `${k.contact} contact · ${k.trip} trip · ${k.custom} custom` : 'Loading…',
      icon: '🎒',
      color: 'text-violet-600 bg-violet-50 border-violet-100',
    },
    { label: 'Received Today', value: summary?.receivedSince ?? '—', desc: 'All enquiry types', icon: '⚡', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    {
      label: 'Open / Unhandled',
      value: summary?.byStatus.NEW ?? '—',
      desc: summary ? `${summary.byStatus.CONTACTED + summary.byStatus.INTERESTED} more in progress` : '',
      icon: '📥',
      color: 'text-amber-600 bg-amber-50 border-amber-100',
    },
    {
      label: 'Leads Completed',
      value: summary ? `${summary.total ? Math.round((done / summary.total) * 100) : 0}%` : '—',
      desc: summary ? `${done} of ${summary.total} confirmed, closed or cancelled` : '',
      icon: '📈',
      color: 'text-blue-600 bg-blue-50 border-blue-100',
    },
  ];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white border border-zinc-200/50 rounded-2xl p-5 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{card.label}</p>
              <p className="text-2xl font-extrabold text-zinc-950 mt-1 tracking-tight">{card.value}</p>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{card.desc}</p>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${card.color}`} aria-hidden="true">{card.icon}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1 mb-6 bg-zinc-100/70 p-1 rounded-xl w-fit max-w-full" role="tablist" aria-label="Enquiry type">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filters.view === tab.key}
            onClick={() => update({ view: tab.key })}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-2 ${
              filters.view === tab.key ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums ${filters.view === tab.key ? 'bg-violet-50 text-violet-700' : 'bg-zinc-200/70 text-zinc-500'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <LeadFilters filters={filters} interests={summary?.interests ?? []} onChange={update} onQuick={onQuick} onReset={() => setFilters({ ...INITIAL, view: filters.view })} />

      {filters.view !== 'deleted' && (
        <div className="flex mb-6 bg-white rounded-2xl p-1 shadow-2xs border border-zinc-200" role="group" aria-label="Status group">
          {[
            ['open', `Open Leads (${summary?.open ?? '…'})`],
            ['done', `Completed Leads (${summary?.done ?? '…'})`],
            ['all', `All Statuses (${summary?.total ?? '…'})`],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={!filters.status && filters.group === key}
              onClick={() => update({ group: key, status: '' })}
              className={`flex-1 py-3 text-xs font-bold rounded-xl transition-all ${
                !filters.status && filters.group === key ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {list.error ? (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-3xl p-8 text-center shadow-xs">
          <span className="text-4xl block mb-3" aria-hidden="true">📡</span>
          <h3 className="text-base font-bold text-red-800">Could not load enquiries</h3>
          <p className="text-red-600 text-xs mt-1.5 max-w-md mx-auto leading-relaxed">{list.error}</p>
          <button type="button" onClick={reload} className="mt-5 px-6 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl">
            Retry
          </button>
        </div>
      ) : list.loading && list.items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-zinc-200/50 shadow-xs p-6 space-y-4" role="status" aria-label="Loading enquiries">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 items-center">
              <div className="h-10 bg-zinc-100 animate-pulse w-10 rounded-full" />
              <div className="h-4 bg-zinc-100 animate-pulse flex-1 rounded" />
              <div className="h-4 bg-zinc-100 animate-pulse w-20 rounded" />
            </div>
          ))}
        </div>
      ) : list.items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-zinc-200/50 shadow-xs p-12 text-center">
          <span className="text-5xl mb-4 block" aria-hidden="true">📭</span>
          <h2 className="text-lg font-bold text-zinc-950">No Inquiries Found</h2>
          <p className="text-zinc-500 text-xs mt-2 max-w-sm mx-auto leading-relaxed">
            {filters.view === 'deleted' ? 'Nothing has been deleted.' : 'No enquiries match these filters.'}
          </p>
        </div>
      ) : (
        <div aria-busy={list.loading}>
          <LeadList
            items={list.items}
            page={filters.page}
            pageSize={filters.pageSize}
            busyId={busyId}
            onOpen={(lead) => setOpenLeadId(lead.leadId)}
            onComplete={(lead) => setToComplete(lead)}
            onReopen={(lead) => setStatus(lead, 'NEW', 'Lead reopened.')}
            onDelete={(lead) => { setDeleteReason(''); setToDelete(lead); }}
            onRestore={doRestore}
          />
          <Pagination
            page={filters.page}
            pageSize={filters.pageSize}
            total={list.total}
            totalPages={list.totalPages}
            onPage={(page) => update({ page })}
            onPageSize={(pageSize) => update({ pageSize })}
          />
        </div>
      )}

      {openLeadId && (
        <LeadDrawer
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onChanged={reload}
          onError={handleSessionError}
          onRequestDelete={(lead) => { setDeleteReason(''); setToDelete(lead); }}
          onRequestRestore={(lead) => { setOpenLeadId(null); doRestore(lead); }}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 z-[250] bg-zinc-900 text-white px-5 py-4 rounded-2xl shadow-xl flex items-center justify-between gap-5 border border-zinc-800/80">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span aria-hidden="true">{toast.type === 'success' ? '✅' : '❌'}</span>
            <span>{toast.message}</span>
          </div>
          {toast.undo && (
            <button
              type="button"
              onClick={() => { const undo = toast.undo; setToast(null); undo(); }}
              className="text-violet-400 hover:text-violet-300 text-xs font-bold uppercase tracking-wider px-2.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {toComplete && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-[300] p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="complete-title" className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200/50">
            <h3 id="complete-title" className="text-lg font-bold text-zinc-950">Complete Inquiry</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Mark the inquiry from <span className="font-semibold text-zinc-800">{toComplete.name}</span> as closed?
            </p>
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setToComplete(null)} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 text-xs font-bold rounded-xl">Cancel</button>
              <button
                type="button"
                onClick={() => { const lead = toComplete; setToComplete(null); setStatus(lead, 'CLOSED', 'Lead marked as completed.'); }}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-xs flex items-center justify-center z-[300] p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-zinc-200/50">
            <h3 id="delete-title" className="text-lg font-bold text-zinc-950">Delete Inquiry</h3>
            <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
              Move the inquiry from <span className="font-semibold text-zinc-800">{toDelete.name}</span> to Deleted? It leaves the lists but is
              kept, and can be restored from the Deleted tab.
            </p>
            <label htmlFor="delete-reason" className="block text-[10px] font-bold uppercase text-zinc-400 mt-4 mb-1">Reason (optional)</label>
            <input
              id="delete-reason"
              type="text"
              value={deleteReason}
              maxLength={500}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g. spam, duplicate, test"
              className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500"
            />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setToDelete(null)} className="flex-1 py-2.5 bg-zinc-100 hover:bg-zinc-200/70 text-zinc-800 text-xs font-bold rounded-xl">Cancel</button>
              <button
                type="button"
                onClick={() => { const lead = toDelete; setToDelete(null); setOpenLeadId(null); doDelete(lead, deleteReason.trim()); }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

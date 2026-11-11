import { LEAD_STATUSES, STATUS_LABELS, cleanInterest } from './leadFormat';

const LABEL = 'block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-0.5';
const FIELD = 'w-full border border-zinc-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 bg-white transition-all font-medium text-zinc-700';

const QUICK = [
  { label: 'All Time', key: 'all' },
  { label: 'Today', key: 'today' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: '7 Days', key: '7d' },
  { label: '30 Days', key: '30d' },
  { label: 'This Month', key: 'this-month' },
  { label: 'Last Month', key: 'last-month' },
];

/**
 * Search, status, interest, dates, priority and sort. Every value is sent to
 * the server (backend/routes/leads.js); nothing here filters in the browser.
 */
export default function LeadFilters({ filters, interests = [], onChange, onQuick, onReset }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/50 shadow-xs p-5 md:p-6 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div className="lg:col-span-2">
          <label htmlFor="lead-search" className={LABEL}>Search</label>
          <div className="relative">
            <input
              id="lead-search"
              type="search"
              value={filters.searchInput}
              onChange={(e) => onChange({ searchInput: e.target.value })}
              placeholder="Name, phone, email, trip or message…"
              maxLength={100}
              className={`${FIELD} pl-9 pr-8`}
            />
            <svg className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div>
          <label htmlFor="lead-status" className={LABEL}>Status</label>
          <select id="lead-status" value={filters.status} onChange={(e) => onChange({ status: e.target.value })} className={FIELD}>
            <option value="">Any status</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lead-interest" className={LABEL}>Source / Interest</label>
          <select id="lead-interest" value={filters.interest} onChange={(e) => onChange({ interest: e.target.value })} className={FIELD}>
            <option value="">All sources</option>
            {interests.map((i) => (
              <option key={i.interest} value={i.interest}>{cleanInterest(i.interest)} ({i.count})</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="lead-sort" className={LABEL}>Sort</label>
          <select id="lead-sort" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value })} className={FIELD}>
            <option value="newest">Latest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 items-end">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="lead-from" className={LABEL}>From</label>
            <input id="lead-from" type="date" value={filters.dateFrom} onChange={(e) => onChange({ dateFrom: e.target.value, quick: '' })} className={FIELD} />
          </div>
          <div>
            <label htmlFor="lead-to" className={LABEL}>To</label>
            <input id="lead-to" type="date" value={filters.dateTo} onChange={(e) => onChange({ dateTo: e.target.value, quick: '' })} className={FIELD} />
          </div>
        </div>

        <div>
          <span className={LABEL}>Priority Level</span>
          <div className="flex border border-zinc-200 rounded-xl overflow-hidden p-0.5 bg-zinc-50" role="group" aria-label="Priority">
            {['all', 'high', 'normal'].map((level) => (
              <button
                key={level}
                type="button"
                aria-pressed={filters.priority === level}
                onClick={() => onChange({ priority: level })}
                className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${
                  filters.priority === level
                    ? level === 'high' ? 'bg-amber-500 text-white shadow-sm' : 'bg-violet-600 text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100/50'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="flex md:justify-end">
          <button
            type="button"
            onClick={onReset}
            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-[10px] font-bold transition-all border border-red-100 hover:border-red-200 active:scale-95"
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-wrap gap-1.5">
        {QUICK.map((btn) => (
          <button
            key={btn.key}
            type="button"
            onClick={() => onQuick(btn.key)}
            aria-pressed={filters.quick === btn.key}
            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all duration-300 ${
              filters.quick === btn.key
                ? 'bg-zinc-100 border-zinc-300 text-zinc-800'
                : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-700'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

import { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAsyncData } from '../../hooks/useAsyncData';
import { getDestinationsCached } from '../../services/destinationsApi';
import { track } from '../../services/analytics';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DURATIONS = [
  { value: '1-3', label: '1 – 3 days' },
  { value: '4-6', label: '4 – 6 days' },
  { value: '7+', label: '7+ days' },
];

const BUDGETS = [
  { label: 'Up to ₹25,000', maxPrice: '25000' },
  { label: '₹25,000 – ₹50,000', minPrice: '25000', maxPrice: '50000' },
  { label: '₹50,000 – ₹1,00,000', minPrice: '50000', maxPrice: '100000' },
  { label: '₹1,00,000 – ₹2,00,000', minPrice: '100000', maxPrice: '200000' },
  { label: 'Above ₹2,00,000', minPrice: '200000' },
];

const TRAVELLERS = ['1', '2', '3-4', '5-6', '7+'];

const FIELD_WRAP = 'relative flex items-center w-full h-12';
const SELECT_FIELD =
  'w-full h-12 pl-10 pr-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/80 text-xs sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 ' +
  'appearance-none transition-all duration-200 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-white dark:hover:bg-zinc-800 ' +
  'focus:border-zinc-400 dark:focus:border-zinc-500 focus:bg-white dark:focus:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20 ' +
  'disabled:cursor-not-allowed disabled:bg-zinc-100 dark:disabled:bg-zinc-900 disabled:text-zinc-400';

const ICON_STYLE = 'pointer-events-none absolute left-3.5 h-4 w-4 text-zinc-400 dark:text-zinc-500';
const CHEVRON_STYLE = 'pointer-events-none absolute right-3 h-4 w-4 text-zinc-400 dark:text-zinc-500';

const LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400';

const EMPTY = { destination: '', month: '', duration: '', budget: '', travellers: '' };

export default function TravelSearch({ className = '' }) {
  const navigate = useNavigate();
  const uid = useId();
  const [form, setForm] = useState(EMPTY);

  const { data: destinations, loading, error } = useAsyncData(
    () => getDestinationsCached(),
    ['travel-search-destinations']
  );

  const list = destinations ?? [];
  const destinationsUnavailable = !loading && (Boolean(error) || list.length === 0);

  const update = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();

    if (form.destination) params.set('destination', form.destination);
    if (form.duration) params.set('duration', form.duration);

    const budget = BUDGETS[Number(form.budget)];
    if (budget) {
      if (budget.minPrice) params.set('minPrice', budget.minPrice);
      if (budget.maxPrice) params.set('maxPrice', budget.maxPrice);
    }

    if (form.month) params.set('month', form.month);
    if (form.travellers) params.set('travellers', form.travellers);

    // Fired before navigate and never awaited — the fetch's keepalive carries
    // it through the route change. Only slugs and picker values, no free text.
    const trackedFilters = {};
    for (const [key, value] of params.entries()) {
      if (key !== 'destination') trackedFilters[key] = value;
    }
    track('search_performed', { meta: { query: form.destination || '', filters: trackedFilters } });

    navigate(`/packages${params.toString() ? `?${params}` : ''}`);
  };

  const destinationLabel = loading ? 'Loading destinations…' : 'Anywhere';

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Search travel packages"
      className={`rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-white dark:bg-zinc-900/95 p-4 sm:p-5 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.15)] dark:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 ${className}`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 items-end">
        {/* Destination */}
        <div>
          <label className={LABEL} htmlFor={`${uid}-destination`}>
            Destination
          </label>
          <div className={FIELD_WRAP}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_STYLE}>
              <path d="M12 21s-7-4.5-7-10a7 7 0 1114 0c0 5.5-7 10-7 10z" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="11" r="2.5" />
            </svg>
            <select
              id={`${uid}-destination`}
              className={SELECT_FIELD}
              value={form.destination}
              onChange={update('destination')}
              disabled={loading || destinationsUnavailable}
            >
              <option value="">{destinationLabel}</option>
              {list.map((destination) => (
                <option key={destination.slug} value={destination.slug}>
                  {destination.name}
                  {destination.packageCount > 0 ? ` (${destination.packageCount})` : ''}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={CHEVRON_STYLE}>
              <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Month */}
        <div>
          <label className={LABEL} htmlFor={`${uid}-month`}>
            Travel Month
          </label>
          <div className={FIELD_WRAP}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_STYLE}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <select id={`${uid}-month`} className={SELECT_FIELD} value={form.month} onChange={update('month')}>
              <option value="">Any month</option>
              {MONTHS.map((month) => (
                <option key={month} value={month}>
                  {month}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={CHEVRON_STYLE}>
              <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className={LABEL} htmlFor={`${uid}-duration`}>
            Duration
          </label>
          <div className={FIELD_WRAP}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_STYLE}>
              <circle cx="12" cy="12" r="9" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" />
            </svg>
            <select id={`${uid}-duration`} className={SELECT_FIELD} value={form.duration} onChange={update('duration')}>
              <option value="">Any length</option>
              {DURATIONS.map((duration) => (
                <option key={duration.value} value={duration.value}>
                  {duration.label}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={CHEVRON_STYLE}>
              <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Budget */}
        <div>
          <label className={LABEL} htmlFor={`${uid}-budget`}>
            Budget
          </label>
          <div className={FIELD_WRAP}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_STYLE}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <select id={`${uid}-budget`} className={SELECT_FIELD} value={form.budget} onChange={update('budget')}>
              <option value="">Any budget</option>
              {BUDGETS.map((budget, index) => (
                <option key={budget.label} value={String(index)}>
                  {budget.label}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={CHEVRON_STYLE}>
              <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Travellers */}
        <div>
          <label className={LABEL} htmlFor={`${uid}-travellers`}>
            Travellers
          </label>
          <div className={FIELD_WRAP}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON_STYLE}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" strokeLinecap="round" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
            </svg>
            <select id={`${uid}-travellers`} className={SELECT_FIELD} value={form.travellers} onChange={update('travellers')}>
              <option value="">Any</option>
              {TRAVELLERS.map((count) => (
                <option key={count} value={count}>
                  {count} {count === '1' ? 'person' : 'people'}
                </option>
              ))}
            </select>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={CHEVRON_STYLE}>
              <path d="M5.5 7.5L10 12l4.5-4.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        {/* Submit Button */}
        <div>
          <button
            type="submit"
            className="h-12 w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 dark:bg-white px-5 text-sm font-semibold text-white dark:text-zinc-900 shadow-sm transition-all duration-200 hover:bg-zinc-800 dark:hover:bg-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-900 dark:focus:ring-zinc-100 active:scale-[0.99]"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <span>Explore</span>
          </button>
        </div>
      </div>

      {destinationsUnavailable && (
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Destination list unavailable right now — search by budget or duration, or{' '}
          <Link to="/packages" className="font-semibold text-zinc-900 dark:text-zinc-200 hover:underline">
            browse all trips
          </Link>
          .
        </p>
      )}
    </form>
  );
}

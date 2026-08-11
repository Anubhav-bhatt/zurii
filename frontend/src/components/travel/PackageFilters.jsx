import { useEffect, useId, useRef, useState } from 'react';

import Button from '../ui/Button';
import { titleCase } from '../../utils/format';

/**
 * The filter surface for the package listing.
 *
 * Only filters the data can answer are offered: the destinations that actually
 * have published packages, five budget bands spanning the real price range
 * (₹5,999 – ₹2,19,999), the three duration buckets the API understands, and the
 * six tags that exist in the packages table. Nothing offered here can return a
 * guaranteed-empty result set.
 *
 * This component owns no filter state. Every control reports through
 * `onChange(patch)` and the page writes the patch into the URL, so Back and
 * Forward replay filter changes and there is nothing to keep in sync. `null` in
 * a patch means "remove this parameter".
 *
 * From `lg` up the controls are a horizontal bar. Below that they live in a
 * bottom sheet behind one "Filters" button, reusing the scroll-lock, Escape and
 * focus-return behaviour of MobileNavigation. The sheet applies changes live —
 * "Apply" simply dismisses it — because staging them in local state would mean a
 * second copy of the filters to reconcile with the URL.
 */

/** Query keys the API understands; see backend/routes/travel.js DURATION_BUCKETS. */
const DURATION_OPTIONS = [
  { value: '1-3', label: '1–3 days' },
  { value: '4-6', label: '4–6 days' },
  { value: '7+', label: '7+ days' },
];

/**
 * Bands over `minPrice` / `maxPrice`. A range slider would imply a precision the
 * catalogue does not have — 68 packages clustered in a handful of price bands.
 */
const BUDGET_OPTIONS = [
  { value: 'under-25k', label: 'Under ₹25,000', minPrice: null, maxPrice: 25000 },
  { value: '25k-50k', label: '₹25,000 – ₹50,000', minPrice: 25000, maxPrice: 50000 },
  { value: '50k-1l', label: '₹50,000 – ₹1,00,000', minPrice: 50000, maxPrice: 100000 },
  { value: '1l-2l', label: '₹1,00,000 – ₹2,00,000', minPrice: 100000, maxPrice: 200000 },
  { value: 'above-2l', label: 'Above ₹2,00,000', minPrice: 200000, maxPrice: null },
];

/**
 * Tags present in the data, with their counts: international 41, heritage 31,
 * adventure 26, domestic 21, beach 20, family 4. Deliberately no honeymoon,
 * couple, group or mountains — there are no packages behind them.
 */
const STYLE_OPTIONS = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'beach', label: 'Beach' },
  { value: 'heritage', label: 'Heritage' },
  { value: 'family', label: 'Family' },
  { value: 'domestic', label: 'India' },
  { value: 'international', label: 'International' },
];

/** Sentinel for a price range in the URL that matches none of the bands. */
const CUSTOM_BUDGET = 'custom-range';

const FIELD =
  'w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100 ' +
  'transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-600 ' +
  'focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20 ' +
  'disabled:cursor-not-allowed disabled:border-zinc-200 dark:disabled:border-zinc-800 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-500 dark:disabled:text-zinc-400';

const SHEET_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-600 dark:text-zinc-300';

const FilterIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
    <path d="M4 7h16M7 12h10M10 17h4" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
);

const price = (value) => (value === undefined || value === null || value === '' ? null : Number(value));

/** Which band the URL's prices describe: a band value, the sentinel, or ''. */
function currentBudget(filters) {
  const min = price(filters.minPrice);
  const max = price(filters.maxPrice);
  if (min === null && max === null) return '';
  return BUDGET_OPTIONS.find((band) => band.minPrice === min && band.maxPrice === max)?.value ?? CUSTOM_BUDGET;
}

/** One labelled select. `height` is 44px in the bar and 48px in the sheet. */
function Field({ id, label, labelClassName, height, value, onChange, disabled = false, className, children }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD} ${height}`}
      >
        {children}
      </select>
    </div>
  );
}

/**
 * The four selects, rendered identically in the desktop bar and in the sheet.
 *
 * The bar hides the labels: "Anywhere", "Any budget", "Any duration" and "Any
 * style" already say what each control does, and four stacked label rows would
 * double the height of the toolbar. The sheet has room, so it shows them.
 */
function FilterControls({ filters, destinations, destinationsLoading, destinationsError, onChange, layout }) {
  const uid = useId();
  const sheet = layout === 'sheet';
  const labelClassName = sheet ? SHEET_LABEL : 'sr-only';
  const height = sheet ? 'h-12' : 'h-11';

  // A destination with no published packages would only ever produce an empty
  // result set, so it is not offered.
  const bookable = destinations.filter((destination) => (destination.packageCount ?? 0) > 0);
  const groups = [
    { key: 'domestic', label: 'India' },
    { key: 'international', label: 'International' },
  ]
    .map((group) => ({
      ...group,
      items: bookable
        .filter((destination) => destination.kind === group.key)
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter((group) => group.items.length > 0);

  const knownDestination = bookable.some((destination) => destination.slug === filters.destination);

  // With no list there is nothing to pick — but if the URL already carries a
  // destination the select must stay usable, because it is how you clear it.
  const noOptions = destinationsLoading || Boolean(destinationsError) || bookable.length === 0;
  const destinationDisabled = noOptions && !filters.destination;
  let anywhereLabel = 'Anywhere';
  if (destinationDisabled) anywhereLabel = destinationsLoading ? 'Loading destinations…' : 'Destinations unavailable';

  const budget = currentBudget(filters);
  const knownStyle = STYLE_OPTIONS.some((option) => option.value === filters.tag);

  const setBudget = (value) => {
    // Re-selecting the sentinel is a no-op; it only exists to display a range.
    if (value === CUSTOM_BUDGET) return;
    const band = BUDGET_OPTIONS.find((option) => option.value === value);
    onChange({ minPrice: band?.minPrice ?? null, maxPrice: band?.maxPrice ?? null });
  };

  return (
    <div className={sheet ? 'space-y-4' : 'hidden flex-wrap items-center gap-2 lg:flex'}>
      <Field
        id={`${uid}-destination`}
        label="Destination"
        labelClassName={labelClassName}
        height={height}
        value={filters.destination ?? ''}
        disabled={destinationDisabled}
        onChange={(value) => onChange({ destination: value || null })}
        className={sheet ? undefined : 'w-52'}
      >
        <option value="">{anywhereLabel}</option>
        {/* A slug the list does not contain keeps its own entry, so the control
            cannot claim "Anywhere" while the API is filtering on it. */}
        {filters.destination && !knownDestination && (
          <option value={filters.destination}>{titleCase(filters.destination.replace(/-/g, ' '))}</option>
        )}
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.items.map((destination) => (
              <option key={destination.slug} value={destination.slug}>
                {destination.name} ({destination.packageCount})
              </option>
            ))}
          </optgroup>
        ))}
      </Field>

      <Field
        id={`${uid}-budget`}
        label="Budget"
        labelClassName={labelClassName}
        height={height}
        value={budget}
        onChange={setBudget}
        className={sheet ? undefined : 'w-44'}
      >
        <option value="">Any budget</option>
        {/* Prices from an older link or a hand-edited URL. The exact figures are
            on the active-filter chip. */}
        {budget === CUSTOM_BUDGET && <option value={CUSTOM_BUDGET}>Custom range</option>}
        {BUDGET_OPTIONS.map((band) => (
          <option key={band.value} value={band.value}>
            {band.label}
          </option>
        ))}
      </Field>

      <Field
        id={`${uid}-duration`}
        label="Duration"
        labelClassName={labelClassName}
        height={height}
        value={filters.duration ?? ''}
        onChange={(value) => onChange({ duration: value || null })}
        className={sheet ? undefined : 'w-40'}
      >
        <option value="">Any duration</option>
        {DURATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Field>

      <Field
        id={`${uid}-style`}
        label="Trip style"
        labelClassName={labelClassName}
        height={height}
        value={filters.tag ?? ''}
        onChange={(value) => onChange({ tag: value || null })}
        className={sheet ? undefined : 'w-40'}
      >
        <option value="">Any style</option>
        {filters.tag && !knownStyle && <option value={filters.tag}>{titleCase(filters.tag)}</option>}
        {STYLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Field>
    </div>
  );
}

export default function PackageFilters({
  filters = {},
  destinations = [],
  destinationsLoading = false,
  destinationsError = null,
  activeCount = 0,
  resultLabel = '',
  onChange,
  onClear,
  className = '',
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  // Lock the page, close on Escape, and manage focus — same contract as the
  // navigation drawer.
  useEffect(() => {
    if (!sheetOpen) return;

    // Captured now: by cleanup time the ref may point elsewhere.
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSheetOpen(false);
        return;
      }

      // The panel declares aria-modal, so Tab must stay inside it. Without this
      // the sheet tells assistive tech the page behind is unreachable while
      // focus walks straight into it on the next Tab.
      if (event.key === 'Tab') {
        const focusable = panelRef.current?.querySelectorAll(
          'select, button, a[href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable || focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const focusTimer = setTimeout(() => {
      panelRef.current?.querySelector('select, button')?.focus();
    }, 30);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      trigger?.focus?.();
    };
  }, [sheetOpen]);

  const controlProps = { filters, destinations, destinationsLoading, destinationsError, onChange };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setSheetOpen(true)}
        aria-expanded={sheetOpen}
        className="touch-target inline-flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20 lg:hidden"
      >
        <FilterIcon />
        Filters
        {activeCount > 0 && (
          <>
            <span
              aria-hidden="true"
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white"
            >
              {activeCount}
            </span>
            <span className="sr-only">
              {activeCount} {activeCount === 1 ? 'filter' : 'filters'} applied
            </span>
          </>
        )}
      </button>

      <FilterControls {...controlProps} layout="bar" />

      {/* The sheet is only reachable from the button above, which is hidden from
          `lg`; it is not itself width-gated, so a resize while it is open cannot
          leave the page scroll-locked behind an invisible dialog. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Filter trips">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-zinc-950/50 animate-backdrop-in"
          />

          <div
            ref={panelRef}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 animate-slide-in-up"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
              <div>
                <p className="text-[15px] font-bold text-zinc-950 dark:text-zinc-100">Filters</p>
                <p aria-live="polite" className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {resultLabel}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-zinc-600 dark:text-zinc-300 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <FilterControls {...controlProps} layout="sheet" />
            </div>

            <div className="flex shrink-0 gap-2 border-t border-zinc-100 dark:border-zinc-800 p-3 pb-safe">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={onClear}
                disabled={activeCount === 0}
              >
                Clear all
              </Button>
              <Button variant="accent" size="lg" className="flex-1" onClick={() => setSheetOpen(false)}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The removable summary of what the URL is currently asking for.
 *
 * Chips are built by the page — it is the only place that knows how a query
 * parameter reads in English — and each one carries the parameter keys it owns.
 * Removing a chip is therefore a plain URL edit here, with no per-filter special
 * cases: `{ id, label, keys }` is the whole contract.
 *
 * `canClear` exists for the one case where a filter is applied but has no chip:
 * a destination slug in the URL that is not a real destination is left out of the
 * summary, and the user still needs a way back out of it.
 */

const CrossIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
    <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" strokeLinecap="round" />
  </svg>
);

export default function ActiveFilters({
  chips = [],
  onRemove,
  onClear,
  canClear = chips.length > 0,
  className = '',
}) {
  if (chips.length === 0 && !canClear) return null;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {chips.length > 0 && (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.id}>
              <span className="inline-flex min-h-[34px] items-center gap-0.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-1 pl-3 pr-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {chip.label}
                <button
                  type="button"
                  onClick={() => onRemove?.(chip)}
                  aria-label={`Remove ${chip.label} filter`}
                  className="relative flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 dark:text-zinc-500 transition-colors duration-150 before:absolute before:-inset-2 before:content-[''] hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20"
                >
                  <CrossIcon />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canClear && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 transition-colors duration-150 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 dark:focus-visible:ring-zinc-100/20"
        >
          Clear all
        </button>
      )}
    </div>
  );
}

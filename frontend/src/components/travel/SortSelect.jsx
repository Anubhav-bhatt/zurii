/**
 * The listing's sort control.
 *
 * A labelled native `<select>` on purpose: one tap on mobile, keyboard and
 * screen-reader behaviour for free, and no option list to style. The visible
 * value ("Recommended") does not describe itself, so unlike the filter selects
 * this one keeps its label on screen.
 *
 * `recommended` is what the API already does with no `sort` parameter, so the
 * page deletes the parameter instead of writing `sort=recommended` into the URL.
 * PackagesPage sanitises the URL against these same five values.
 */

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'duration_asc', label: 'Duration: Short to Long' },
  { value: 'rating', label: 'Top Rated' },
];

export default function SortSelect({ value = 'recommended', onChange, id = 'packages-sort', className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Sort
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="h-11 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100 transition-colors duration-200 hover:border-zinc-300 dark:hover:border-zinc-600 focus:border-zinc-400 dark:focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-zinc-100/20"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The dashboard-wide collapse toggle: a chevron that points down when the
 * card is open and rotates to the side when collapsed. One shared control so
 * every card's toggle looks, labels and focuses identically.
 */
export default function CollapseChevron({ open, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      <svg
        className={`h-4 w-4 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

import { Link } from 'react-router-dom';

/**
 * The Destinations dropdown panel.
 *
 * Contents come from the destinations API, split into India / International.
 * The previous mega-menu listed roughly ninety hardcoded countries and cities,
 * most of which had no trips behind them; this shows only destinations that
 * exist in the database, with their live trip counts.
 */
export default function DestinationMenu({ destinations = [], loading, onNavigate }) {
  const domestic = destinations.filter((d) => d.kind === 'domestic');
  const international = destinations.filter((d) => d.kind === 'international');

  const columns = [
    { title: 'India', items: domestic.slice(0, 9), all: '/packages?tag=domestic' },
    { title: 'International', items: international.slice(0, 18), all: '/packages?tag=international' },
  ];

  return (
    <div className="max-h-[70vh] overflow-y-auto p-5 sm:p-6">
      {loading ? (
        <div className="grid grid-cols-2 gap-6" role="status" aria-label="Loading destinations">
          {[0, 1].map((column) => (
            <div key={column} className="space-y-2.5">
              <div className="h-3 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-4 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800/60" />
              ))}
            </div>
          ))}
          <span className="sr-only">Loading destinations…</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {columns.map((column) => (
            <div key={column.title}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                {column.title}
              </p>

              <ul
                className={
                  column.title === 'International'
                    ? 'grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3'
                    : 'space-y-0.5'
                }
              >
                {column.items.map((destination) => (
                  <li key={destination.slug}>
                    <Link
                      to={`/destination/${destination.slug}`}
                      onClick={onNavigate}
                      className="group flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 transition-colors duration-150 hover:bg-violet-50 hover:text-violet-800 dark:hover:bg-violet-950/40 dark:hover:text-violet-300"
                    >
                      <span className="truncate">{destination.name}</span>
                      {destination.packageCount > 0 && (
                        <span className="shrink-0 text-[11px] text-zinc-400 dark:text-zinc-500 group-hover:text-violet-500">
                          {destination.packageCount}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                to={column.all}
                onClick={onNavigate}
                className="mt-3 inline-flex items-center gap-1 px-2 text-xs font-semibold text-violet-700 hover:text-violet-900 dark:text-violet-400 dark:hover:text-violet-300 rounded"
              >
                View all {column.title} trips
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

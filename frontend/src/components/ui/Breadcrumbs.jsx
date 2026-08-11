import { Link } from 'react-router-dom';

/**
 * Breadcrumb trail. The last item is the current page and is not a link.
 */
export default function Breadcrumbs({ items = [], className = '' }) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.to && !last ? (
                <Link
                  to={item.to}
                  className="rounded font-medium hover:text-violet-700 dark:hover:text-violet-400"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={last ? 'font-semibold text-zinc-700 dark:text-zinc-300' : ''}
                >
                  {item.label}
                </span>
              )}
              {/* Separator sits a step fainter than the trail: zinc-300 → zinc-600 mirrors the faint pairing. */}
              {!last && (
                <span aria-hidden="true" className="text-zinc-300 dark:text-zinc-600">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

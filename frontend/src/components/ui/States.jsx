import Button from './Button';

/**
 * Error and empty presentations, plus `DataBoundary` which picks between
 * loading / error / empty / content.
 *
 * Every API-backed section renders through DataBoundary, so a failed request
 * degrades to a friendly retry panel instead of taking down the page — and no
 * section has to re-implement the four states.
 */

export function ErrorState({
  title = "We couldn't load this right now.",
  description = 'Something went wrong on our side. Please try again in a moment.',
  onRetry,
  className = '',
}) {
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 px-6 py-10 text-center ${className}`}
    >
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry} className="mt-5">
          Try Again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here yet.',
  description,
  action,
  className = '',
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-12 text-center ${className}`}
    >
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{title}</p>
      {description && <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">{description}</p>}
      {action && (
        <Button variant="secondary" size="md" to={action.to} className="mt-5">
          {action.label}
        </Button>
      )}
    </div>
  );
}

/**
 * @param {boolean}  loading
 * @param {Error?}   error
 * @param {boolean}  isEmpty
 * @param {ReactNode} skeleton  shown while loading
 * @param {Function} onRetry
 * @param {object}   empty      { title, description, action } for the empty state
 */
export function DataBoundary({ loading, error, isEmpty, skeleton, onRetry, empty, children }) {
  if (loading) return skeleton ?? null;
  if (error) return <ErrorState onRetry={onRetry} description={error.message} />;
  if (isEmpty) return <EmptyState {...empty} />;
  return children;
}

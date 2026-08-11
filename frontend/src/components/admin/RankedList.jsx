import { useState } from 'react';

import { Skeleton } from '../ui/Skeleton';
import CollapseChevron from './CollapseChevron';

/**
 * A titled, ranked list of `{ label, value, sub? }` rows with a quiet
 * magnitude bar under each label. Single neutral hue — identity is carried
 * by the row label, never by color.
 *
 * Owns its own loading / error / empty presentation so every dashboard
 * section degrades the same way. An empty analytics DB renders an
 * intentional "(no events recorded yet)" row, not a crash or a spinner.
 */
export default function RankedList({
  title,
  subtitle,
  items = [],
  loading = false,
  error = null,
  onRetry,
  emptyText = '(no events recorded yet)',
  className = '',
}) {
  const rows = Array.isArray(items) ? items : [];
  const max = rows.reduce((m, item) => Math.max(m, Number(item.value) || 0), 0);
  const [open, setOpen] = useState(true);

  return (
    <section
      className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          )}
        </div>
        <CollapseChevron open={open} onClick={() => setOpen((v) => !v)} label={title} />
      </div>

      <div className={open ? 'mt-4' : 'hidden'}>
        {loading ? (
          <div className="space-y-3" role="status" aria-label="Loading">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : error ? (
          <div role="alert" className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Couldn&rsquo;t load this list.{' '}
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2"
              >
                Retry
              </button>
            )}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">{emptyText}</p>
        ) : (
          <ol className="space-y-3">
            {rows.map((item, index) => {
              const value = Number(item.value) || 0;
              const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
              return (
                <li key={`${item.label}-${index}`} className="flex items-start gap-3">
                  <span className="mt-0.5 w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {item.label}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        {value}
                      </span>
                    </div>
                    {item.sub && (
                      <p className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">{item.sub}</p>
                    )}
                    <div className="mt-1 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

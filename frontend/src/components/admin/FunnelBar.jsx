import { useState } from 'react';

import { Skeleton } from '../ui/Skeleton';
import CollapseChevron from './CollapseChevron';

/**
 * The enquiry funnel as horizontal bars — pure divs, one neutral hue, widths
 * proportional to the widest stage, drop-off % between consecutive stages.
 * Counts live in text tokens beside the bars, never inside colored fill.
 */
export default function FunnelBar({
  title = 'Enquiry funnel',
  subtitle,
  stages = [],
  loading = false,
  error = null,
  onRetry,
}) {
  const rows = Array.isArray(stages) ? stages : [];
  const max = rows.reduce((m, s) => Math.max(m, Number(s.count) || 0), 0);
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
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
          <div className="space-y-4" role="status" aria-label="Loading">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : error ? (
          <div role="alert" className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Couldn&rsquo;t load the funnel.{' '}
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
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            (no events recorded yet)
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((stage, index) => {
              const count = Number(stage.count) || 0;
              const prev = index > 0 ? Number(rows[index - 1].count) || 0 : null;
              const drop =
                prev !== null && prev > 0
                  ? Math.max(0, Math.round((1 - count / prev) * 100))
                  : null;
              const pct = max > 0 ? Math.max(count > 0 ? 2 : 0, Math.round((count / max) * 100)) : 0;
              return (
                <div key={stage.stage || index}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                      {stage.label || stage.stage}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300 font-semibold">
                      {count}
                      {drop !== null && (
                        <span className="ml-2 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
                          &minus;{drop}% drop-off
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 rounded bg-zinc-100 dark:bg-zinc-800" aria-hidden="true">
                    <div
                      className="h-full rounded-l rounded-r bg-zinc-700 dark:bg-zinc-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

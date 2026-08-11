import { Skeleton } from '../ui/Skeleton';

/**
 * One KPI tile for the admin analytics header row.
 * The value is a headline number — text tokens only, no chart chrome.
 */
export default function StatCard({ label, value, hint, loading = false }) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="mt-0.5 text-[11px] text-zinc-400 dark:text-zinc-500">{hint}</p>
      )}
    </div>
  );
}

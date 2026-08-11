import { createElement } from 'react';

/**
 * Loading placeholders. Deliberately plain: a pulsing neutral block, sized to
 * match the real card so swapping in the content causes no layout shift.
 * The pulse is disabled under prefers-reduced-motion by index.css.
 */

export function Skeleton({ className = '' }) {
  return <div className={`bg-zinc-200/70 dark:bg-zinc-800 rounded-lg animate-pulse ${className}`} />;
}

export function PackageCardSkeleton() {
  return (
    <div
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/70 dark:border-zinc-800 overflow-hidden"
      aria-hidden="true"
    >
      <Skeleton className="h-52 rounded-none" />
      <div className="p-5 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-32" />
        <div className="pt-2 flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-9 w-24 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function DestinationCardSkeleton({ className = '' }) {
  return <Skeleton className={`rounded-2xl ${className || 'h-64'}`} />;
}

/** `count` copies of a skeleton, for grids. */
export function SkeletonGrid({ count = 3, className = '', Item = PackageCardSkeleton }) {
  return (
    <div className={className} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => createElement(Item, { key: i }))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

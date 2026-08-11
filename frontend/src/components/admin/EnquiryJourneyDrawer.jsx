import { useEffect } from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { adminFetch } from '../../services/adminApi';
import { Skeleton } from '../ui/Skeleton';
import JourneyTimeline from './JourneyTimeline';

/**
 * Right-hand drawer showing the anonymous journey that preceded one enquiry:
 * an Interest Summary block above a humanized event timeline.
 *
 * Fetches GET /api/admin/bookings/:id/journey on open. Only render this
 * component while a booking is selected — the parent mounts/unmounts it.
 */

const titleCase = (slug) =>
  String(slug || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-sm text-zinc-800 dark:text-zinc-200">{children}</dd>
    </div>
  );
}

function ChipList({ values, quote = false }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <span className="text-zinc-400 dark:text-zinc-500">—</span>;
  }
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {values.map((value, i) => (
        <span
          key={`${value}-${i}`}
          className="inline-block rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300"
        >
          {quote ? `“${value}”` : titleCase(value)}
        </span>
      ))}
    </span>
  );
}

export default function EnquiryJourneyDrawer({ booking, onClose }) {
  const bookingId = booking?.id;

  // The list row this drawer opens from deliberately carries no message or
  // contact details, so the full booking is fetched alongside its journey.
  const { data, loading, error, reload } = useAsyncData(
    ({ signal }) =>
      bookingId
        ? Promise.all([
            adminFetch(`/api/admin/bookings/${bookingId}/journey`, { signal }),
            adminFetch(`/api/admin/bookings/${bookingId}`, { signal }),
          ]).then(([journey, detail]) => ({ ...journey, detail }))
        : Promise.resolve(null),
    ['booking-journey', bookingId]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const summary = data?.summary ?? null;
  const events = data?.events ?? [];
  const detail = data?.detail ?? null;

  return (
    // z-[200]: the admin overlay tier (same as the CRM's lead drawer) — it must
    // sit above the fixed site Topbar (z-[60]), which z-50 did not.
    <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label="Enquiry journey">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close journey drawer"
        onClick={onClose}
        className="absolute inset-0 w-full bg-zinc-950/40 backdrop-blur-[2px] cursor-default"
      />

      {/* Panel */}
      <aside className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-zinc-900 dark:text-zinc-50">
              {booking?.name || 'Enquiry'}
            </h2>
            <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {booking?.packageTitle || titleCase(booking?.packageSlug) || 'Journey before this enquiry'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="px-5 py-5 space-y-6">
          {loading ? (
            <div className="space-y-3" role="status" aria-label="Loading journey">
              <Skeleton className="h-40" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <span className="sr-only">Loading…</span>
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 px-5 py-8 text-center"
            >
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Couldn&rsquo;t load this journey.
              </p>
              <button
                type="button"
                onClick={reload}
                className="mt-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 px-4 py-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Message</h3>
                {detail?.message ? (
                  <blockquote className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                    {detail.message}
                  </blockquote>
                ) : (
                  <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
                    No message was left with this enquiry.
                  </p>
                )}
                <dl className="mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  <SummaryRow label="Email">
                    {detail?.email || <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                  </SummaryRow>
                  <SummaryRow label="Phone">
                    {detail?.phone || <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                  </SummaryRow>
                  <SummaryRow label="Travel date">
                    {detail?.travelDate || <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                  </SummaryRow>
                  <SummaryRow label="Travellers">
                    {detail?.travellers ?? <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                  </SummaryRow>
                </dl>
              </section>

              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 px-4 py-3">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  Interest Summary
                </h3>
                {summary ? (
                  <dl className="mt-1 divide-y divide-zinc-200/70 dark:divide-zinc-800">
                    <SummaryRow label="Primary destination">
                      {summary.primaryDestination
                        ? titleCase(summary.primaryDestination)
                        : <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                    </SummaryRow>
                    <SummaryRow label="Packages viewed">
                      <span className="tabular-nums">{Number(summary.packagesViewed) || 0}</span>
                    </SummaryRow>
                    <SummaryRow label="Most viewed package">
                      {summary.mostViewedPackage
                        ? titleCase(summary.mostViewedPackage)
                        : <span className="text-zinc-400 dark:text-zinc-500">—</span>}
                    </SummaryRow>
                    <SummaryRow label="Wishlisted">
                      <ChipList values={summary.wishlisted} />
                    </SummaryRow>
                    <SummaryRow label="Searches">
                      <ChipList values={summary.searches} quote />
                    </SummaryRow>
                    <SummaryRow label="WhatsApp clicked">
                      {summary.whatsappClicked ? 'Yes' : 'No'}
                    </SummaryRow>
                  </dl>
                ) : (
                  <p className="mt-2 pb-1 text-sm text-zinc-400 dark:text-zinc-500">
                    No journey was recorded for this enquiry.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Journey</h3>
                <div className="mt-3">
                  <JourneyTimeline events={events} />
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

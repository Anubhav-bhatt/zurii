import StatCard from './StatCard';
import RankedList from './RankedList';
import { ErrorState } from '../ui/States';
import { CHANNEL_LABELS, FORM_LABELS } from './campaignLabels';

/**
 * Campaigns & sources (ZT-16): where leads came from in the selected window.
 *
 * Four different measures, kept apart on purpose and labelled as such:
 * sessions/events (anonymous analytics), WhatsApp clicks (an intention, not a
 * lead), leads (enquiries saved in the CRM) and leads staff marked confirmed.
 * None of them is a sale: payments and revenue are not tracked here, and no
 * ad spend, ROAS or ROI is shown because none is known.
 */

const TRIP_KIND = { package: 'Trip enquiry', destination: 'Plan My Trip', custom: 'Plan My Trip', contact: 'Contact form' };
const confirmedSub = (row) => (row.confirmed ? `${row.confirmed} marked confirmed` : null);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');

export default function CampaignReport({ report, page, onPage, pageSize }) {
  const { data, loading, error, reload } = report;
  const totals = data?.totals;
  const campaigns = data?.campaigns;

  const cards = [
    { label: 'Visitor sessions', value: totals?.sessions ?? '—', hint: 'Anonymous browsing sessions (analytics)' },
    { label: 'Tracked events', value: totals?.events ?? '—', hint: 'Page and interaction events — not leads' },
    { label: 'WhatsApp clicks', value: totals?.whatsappClicks ?? '—', hint: 'Taps on a WhatsApp button — not saved leads' },
    { label: 'Leads saved', value: totals?.leads ?? '—', hint: 'Enquiries and contact messages in the CRM' },
    { label: 'With attribution', value: totals?.attributedLeads ?? '—', hint: 'Leads saved with source details (recorded since this release)' },
    { label: 'Marked confirmed', value: totals?.confirmedLeads ?? '—', hint: 'Status set by staff — not a verified payment' },
  ];

  if (error) {
    return <ErrorState title="Couldn't load campaign reporting." description={error.message} onRetry={reload} />;
  }

  const from = campaigns ? campaigns.offset + 1 : 0;
  const to = campaigns ? campaigns.offset + campaigns.rows.length : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        A lead is an enquiry saved in the CRM — not a booking or a payment. Sales, revenue and ad spend are not
        tracked here. Source details are recorded for leads saved since this release; earlier leads show as
        &ldquo;not captured&rdquo;.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <StatCard key={card.label} label={card.label} value={card.value} hint={card.hint} loading={loading} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedList
          title="Leads by source"
          subtitle="UTM source, else the ad platform or referring site"
          items={(data?.bySource ?? []).map((r) => ({ label: r.source, value: r.leads, sub: confirmedSub(r) }))}
          loading={loading}
          emptyText="(no leads in this period)"
        />
        <RankedList
          title="Leads by channel"
          subtitle="Grouped from UTM medium, click type and referrer"
          items={(data?.byChannel ?? []).map((r) => ({ label: CHANNEL_LABELS[r.channel] ?? r.channel, value: r.leads, sub: confirmedSub(r) }))}
          loading={loading}
          emptyText="(no leads in this period)"
        />
        <RankedList
          title="Leads by form"
          subtitle="Which form the enquiry was sent from"
          items={(data?.byForm ?? []).map((r) => ({ label: FORM_LABELS[r.form] ?? r.form, value: r.leads, sub: confirmedSub(r) }))}
          loading={loading}
          emptyText="(no leads in this period)"
        />
        <RankedList
          title="Leads by trip or destination"
          subtitle="The trip enquired about, or the destination chosen on Plan My Trip"
          items={(data?.byTrip ?? []).map((r) => ({
            label: r.label ?? (r.kind === 'contact' ? 'General enquiry' : 'Custom trip, no destination chosen'),
            value: r.leads,
            sub: [TRIP_KIND[r.kind], confirmedSub(r)].filter(Boolean).join(' · '),
          }))}
          loading={loading}
          emptyText="(no leads in this period)"
        />
      </div>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Campaigns</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Leads with a utm_campaign tag, by campaign, source and medium</p>
        {loading ? (
          <p className="py-6 text-center text-sm text-zinc-400" role="status">Loading…</p>
        ) : !campaigns?.rows.length ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">(no tagged campaigns in this period)</p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-semibold">Campaign</th>
                    <th scope="col" className="py-2 pr-4 font-semibold">Source / medium</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">Leads</th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">Confirmed</th>
                    <th scope="col" className="py-2 font-semibold">Last lead</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {campaigns.rows.map((r) => (
                    <tr key={`${r.campaign}|${r.source}|${r.medium}`}>
                      <td className="max-w-[16rem] truncate py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{r.campaign}</td>
                      <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-300">{[r.source, r.medium].map((v) => v ?? '—').join(' / ')}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.leads}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{r.confirmed}</td>
                      <td className="py-2 text-zinc-600 dark:text-zinc-300">{day(r.lastLeadAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
              <span>Showing {from}–{to} of {campaigns.total}</span>
              <span className="flex gap-2">
                <button type="button" className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
                  disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button>
                <button type="button" className="rounded-lg border border-zinc-200 px-3 py-1.5 disabled:opacity-40 dark:border-zinc-700"
                  disabled={(page + 1) * pageSize >= campaigns.total} onClick={() => onPage(page + 1)}>Next</button>
              </span>
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Enquiries by day</h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Leads per 100 visitor sessions is a rough enquiry rate — not a conversion to a booking.
        </p>
        {!loading && data?.trend?.length ? (
          <div className="mt-4 max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-semibold">Day</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Sessions</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">WhatsApp clicks</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Leads</th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">Confirmed</th>
                  <th scope="col" className="py-2 text-right font-semibold">Leads / 100 sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {[...data.trend].reverse().map((d) => (
                  <tr key={d.date}>
                    <td className="py-1.5 pr-4">{day(`${d.date}T12:00:00`)}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{d.sessions}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{d.whatsapp_clicks}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{d.leads}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{d.confirmed}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.sessions ? ((d.leads / d.sessions) * 100).toFixed(1) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-zinc-400" role={loading ? 'status' : undefined}>{loading ? 'Loading…' : '(no data)'}</p>
        )}
      </section>
    </div>
  );
}

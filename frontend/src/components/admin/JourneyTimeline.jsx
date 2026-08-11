/**
 * Humanized, day-grouped timeline of analytics events for one lead.
 *
 * Renders only whitelisted, humanized fields — never raw JSON. Metadata is
 * read defensively: only `query` (string) and a numeric results count are
 * ever surfaced, so nothing unexpected can leak into the UI.
 */

const titleCase = (slug) =>
  String(slug || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const safeMeta = (event) => {
  const meta = event?.metadata ?? event?.meta;
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
};

function describeEvent(event) {
  const type = event.type ?? event.event_type ?? '';
  const slug = event.entitySlug ?? event.entity_slug ?? '';
  const name = slug ? titleCase(slug) : '';
  const meta = safeMeta(event);
  const query = typeof meta.query === 'string' ? meta.query : null;
  // The tracking client stores the count as `resultCount`; the other two keys
  // are tolerated fallbacks. A missing value must stay null — Number(null) is
  // 0, which would render every uncounted search as "(0 results)".
  const rawResults = meta.resultCount ?? meta.resultsCount ?? meta.results;
  const results =
    rawResults != null && Number.isFinite(Number(rawResults)) ? Number(rawResults) : null;

  switch (type) {
    case 'session_start':
      return 'Session started';
    case 'destination_view':
      return name ? `Viewed destination ${name}` : 'Viewed a destination';
    case 'package_view':
      return name ? `Viewed ${name}` : 'Viewed a package';
    case 'search_performed':
      if (query) {
        return results !== null
          ? `Searched “${query}” (${results} result${results === 1 ? '' : 's'})`
          : `Searched “${query}”`;
      }
      return 'Performed a search';
    case 'filter_applied':
      return 'Applied a filter';
    case 'sort_changed':
      return 'Changed the sort order';
    case 'wishlist_add':
      return name ? `Added ${name} to wishlist` : 'Added a package to wishlist';
    case 'wishlist_remove':
      return name ? `Removed ${name} from wishlist` : 'Removed a package from wishlist';
    case 'similar_package_click':
      return name ? `Clicked similar package ${name}` : 'Clicked a similar package';
    case 'plan_trip_click':
      return name ? `Clicked Plan My Trip on ${name}` : 'Clicked Plan My Trip';
    case 'whatsapp_click':
      return name ? `Clicked WhatsApp on ${name}` : 'Clicked WhatsApp';
    case 'enquiry_form_opened':
      return 'Opened the enquiry form';
    case 'enquiry_form_started':
      return 'Started filling the enquiry form';
    case 'enquiry_submitted':
      return 'Submitted an enquiry';
    case 'contact_submitted':
      return 'Submitted the contact form';
    default:
      return titleCase(type) || 'Activity';
  }
}

const dayLabel = (date) => {
  const today = new Date();
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(date)) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
};

const timeLabel = (date) =>
  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function JourneyTimeline({ events = [] }) {
  const rows = Array.isArray(events) ? events : [];

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
        (no events recorded yet)
      </p>
    );
  }

  // Group consecutive events by calendar day so each day gets one header.
  const groups = [];
  for (const event of rows) {
    const createdAt = event.createdAt ?? event.created_at;
    const date = new Date(createdAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? date.toDateString() : 'unknown';
    const last = groups[groups.length - 1];
    const entry = { event, date: valid ? date : null };
    if (last && last.key === key) {
      last.items.push(entry);
    } else {
      groups.push({ key, label: valid ? dayLabel(date) : 'Unknown time', items: [entry] });
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group, gi) => (
        <div key={`${group.key}-${gi}`}>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {group.label}
          </p>
          <ol className="mt-2 space-y-0.5 border-l border-zinc-200 dark:border-zinc-800">
            {group.items.map(({ event, date }, i) => (
              <li key={i} className="relative pl-5 py-1.5">
                <span
                  className="absolute -left-[3.5px] top-3 h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
                  aria-hidden="true"
                />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-zinc-800 dark:text-zinc-200">
                    {describeEvent(event)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
                    {date ? timeLabel(date) : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

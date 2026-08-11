import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAsyncData } from '../hooks/useAsyncData';
import {
  adminFetch,
  adminLogin,
  bootstrapSession,
  getAdminSession,
  AdminAuthError,
} from '../services/adminApi';
import ChangePasswordForm from '../components/admin/ChangePasswordForm';
import StatCard from '../components/admin/StatCard';
import RankedList from '../components/admin/RankedList';
import FunnelBar from '../components/admin/FunnelBar';
import EnquiryJourneyDrawer from '../components/admin/EnquiryJourneyDrawer';
import CollapseChevron from '../components/admin/CollapseChevron';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../components/ui/States';

/**
 * /admin/analytics — Customer Insights dashboard over the first-party
 * anonymous analytics events, sibling to the Contact CRM at /admin/insights.
 *
 * Auth: an admin already logged into the CRM is bootstrapped silently from
 * the origin-wide refresh cookie (see services/adminApi.js); the login form
 * only appears when that refresh fails.
 */

// ── Small formatting helpers ────────────────────────────────────────────────

const titleCase = (slug) =>
  String(slug || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const getRelativeTime = (dateString) => {
  const past = new Date(dateString);
  if (Number.isNaN(past.getTime())) return '—';
  const diffMs = Date.now() - past.getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  const diffHrs = Math.floor(diffMs / (60 * 60 * 1000));
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return past.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatRate = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  // The server sends a 0..1 fraction (enquiries / packageViews to 4dp).
  const pct = num * 100;
  return `${pct % 1 === 0 ? pct : pct.toFixed(1)}%`;
};

const FUNNEL_LABELS = {
  package_view: 'Viewed a package',
  plan_trip_click: 'Clicked Plan My Trip',
  enquiry_form_opened: 'Opened the enquiry form',
  enquiry_form_started: 'Started the enquiry form',
  enquiries: 'Submitted an enquiry',
};

const DAY_OPTIONS = [
  { label: 'Last 24h', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
];

const PACKAGE_TABS = [
  { key: 'mostViewed', label: 'Viewed' },
  { key: 'mostWishlisted', label: 'Wishlisted' },
  { key: 'mostEnquired', label: 'Enquired' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

// ── Login gate (only shown when the silent refresh bootstrap fails) ─────────

function LoginGate({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const admin = await adminLogin(username, password);
      // A temporary password authenticates but reaches nothing else, so the
      // parent is told to render the password screen rather than the dashboard.
      // The server enforces this regardless of what happens here.
      onSuccess(admin);
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 outline-none focus:border-zinc-900 dark:focus:border-zinc-100 transition-colors';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8">
        <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">Customer Insights</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Admin access required. Use your CRM credentials.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="analytics-username"
              className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5"
            >
              Username
            </label>
            <input
              id="analytics-username"
              type="text"
              required
              autoFocus
              disabled={submitting}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              placeholder="Enter username"
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="analytics-password"
              className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5"
            >
              Password
            </label>
            <input
              id="analytics-password"
              type="password"
              required
              disabled={submitting}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter password"
              className={inputClass}
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs font-medium text-red-700 dark:text-red-400"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-zinc-900 dark:bg-zinc-100 py-2.5 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Enquiries table ─────────────────────────────────────────────────────────

function EnquiriesTable({ bookings, onSelect }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Package</th>
            <th className="px-4 py-3">Travel date</th>
            <th className="px-4 py-3">Travellers</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Journey</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
          {bookings.map((booking) => (
            <tr
              key={booking.id}
              tabIndex={0}
              onClick={() => onSelect(booking)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(booking);
                }
              }}
              className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 focus:bg-zinc-50 dark:focus:bg-zinc-800/50 outline-none transition-colors"
            >
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                {booking.name || '—'}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 max-w-[220px] truncate">
                {booking.packageTitle || titleCase(booking.packageSlug) || '—'}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 whitespace-nowrap tabular-nums">
                {formatDate(booking.travelDate)}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 tabular-nums">
                {booking.travellers ?? '—'}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    booking.status === 'completed'
                      ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'
                      : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                  }`}
                >
                  {titleCase(booking.status) || 'Pending'}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {getRelativeTime(booking.createdAt)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {booking.hasJourney ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-zinc-700 dark:bg-zinc-300"
                      aria-hidden="true"
                    />
                    Tracked
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Security activity ───────────────────────────────────────────────────────

/** Result pill: a failed login and a successful one must be scannable apart. */
function ResultBadge({ success }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        success
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
      }`}
    >
      {success ? 'OK' : 'Failed'}
    </span>
  );
}

const EVENT_LABELS = {
  LOGIN_SUCCESS: 'Signed in',
  LOGIN_FAILURE: 'Sign-in failed',
  LOGOUT: 'Signed out',
  PASSWORD_CHANGED: 'Password changed',
  ADMIN_CREATED: 'Admin created',
  ADMIN_REMOVED: 'Admin removed',
  TOKEN_REJECTED: 'Token rejected',
};

const REASON_LABELS = {
  unknown_username: 'no such admin',
  bad_password: 'wrong password',
  account_locked: 'account locked',
  missing_credentials: 'missing credentials',
  token_version_mismatch: 'session revoked',
  token_invalid: 'invalid token',
  admin_gone: 'admin deleted',
};

/**
 * The admin authentication trail. Deliberately a card on this page rather than
 * another dashboard: it reuses the same auth, fetch hook and collapse pattern,
 * and there was previously no way to see who signed in at all.
 *
 * Everything shown here is non-sensitive by construction — the server never
 * stores a password, hash or token in this table, so there is nothing to redact.
 */
function SecurityActivity({ open, onToggle }) {
  const { data, loading, error, reload } = useAsyncData(
    ({ signal }) => adminFetch('/api/admin/security/audit?limit=100', { signal }),
    ['security-audit']
  );

  const events = data ?? [];

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Security activity</h3>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Admin sign-ins, failures and session revocations — most recent first
          </p>
        </div>
        <CollapseChevron open={open} onClick={onToggle} label="Security activity" />
      </div>

      <div className={open ? 'mt-4' : 'hidden'}>
        {loading ? (
          <div className="space-y-2" role="status" aria-label="Loading security activity">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : error ? (
          <div role="alert" className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            Couldn&rsquo;t load security activity.{' '}
            <button
              type="button"
              onClick={reload}
              className="font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
            (no admin activity recorded yet)
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-2 pr-4 font-bold">Time</th>
                  <th className="py-2 pr-4 font-bold">Admin</th>
                  <th className="py-2 pr-4 font-bold">Event</th>
                  <th className="py-2 pr-4 font-bold">Result</th>
                  <th className="py-2 pr-4 font-bold">IP</th>
                  <th className="py-2 font-bold">Client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/70">
                {events.map((event) => (
                  <tr key={event.id} className="text-zinc-700 dark:text-zinc-300">
                    <td className="whitespace-nowrap py-2 pr-4 tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(event.createdAt).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">
                      {event.admin ?? '—'}
                      {event.admin && !event.adminExists && (
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">(deleted)</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {EVENT_LABELS[event.eventType] ?? event.eventType}
                      {event.reason && (
                        <span className="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                          — {REASON_LABELS[event.reason] ?? event.reason}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <ResultBadge success={event.success} />
                    </td>
                    <td className="whitespace-nowrap py-2 pr-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                      {event.ip ?? '—'}
                    </td>
                    <td className="py-2 text-xs text-zinc-500 dark:text-zinc-400">{event.client ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Dashboard (mounted only once a session exists) ──────────────────────────

function Dashboard({ username, onAuthLost, onPasswordChangeRequired }) {
  const [days, setDays] = useState(7);
  const [packageTab, setPackageTab] = useState('mostViewed');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const overview = useAsyncData(
    ({ signal }) => adminFetch(`/api/admin/analytics/overview?days=${days}`, { signal }),
    ['analytics-overview', days]
  );
  const searches = useAsyncData(
    ({ signal }) => adminFetch(`/api/admin/analytics/searches?days=${days}`, { signal }),
    ['analytics-searches', days]
  );
  const destinations = useAsyncData(
    ({ signal }) => adminFetch(`/api/admin/analytics/destinations?days=${days}`, { signal }),
    ['analytics-destinations', days]
  );
  const packages = useAsyncData(
    ({ signal }) => adminFetch(`/api/admin/analytics/packages?days=${days}`, { signal }),
    ['analytics-packages', days]
  );
  const funnel = useAsyncData(
    ({ signal }) => adminFetch(`/api/admin/analytics/funnel?days=${days}`, { signal }),
    ['analytics-funnel', days]
  );
  const bookings = useAsyncData(
    ({ signal }) => adminFetch('/api/admin/bookings', { signal }),
    ['admin-bookings']
  );

  const results = [overview, searches, destinations, packages, funnel, bookings];

  // If any request discovers the session is truly gone, fall back to login.
  const authLost = results.some((result) => result.error instanceof AdminAuthError);
  useEffect(() => {
    if (authLost) onAuthLost();
  }, [authLost, onAuthLost]);

  // An operator can reset this admin's password while they are looking at the
  // dashboard. The next request then returns 403 PASSWORD_CHANGE_REQUIRED, and
  // the correct response is the password screen, not a stale dashboard.
  const passwordChangeRequired = results.some(
    (result) => result.error?.status === 403 && /password change required/i.test(result.error?.message ?? '')
  );
  useEffect(() => {
    if (passwordChangeRequired) onPasswordChangeRequired();
  }, [passwordChangeRequired, onPasswordChangeRequired]);

  const kpis = overview.data ?? {};
  const statCards = [
    { label: 'Visitors', value: Number(kpis.visitors) || 0 },
    { label: 'Sessions', value: Number(kpis.sessions) || 0 },
    { label: 'Package views', value: Number(kpis.packageViews) || 0 },
    { label: 'Destination views', value: Number(kpis.destinationViews) || 0 },
    { label: 'Wishlist adds', value: Number(kpis.wishlistAdds) || 0 },
    { label: 'WhatsApp clicks', value: Number(kpis.whatsappClicks) || 0 },
    { label: 'Enquiries', value: Number(kpis.enquiries) || 0 },
    { label: 'View → enquiry', value: formatRate(kpis.viewToEnquiryRate), hint: 'package views to enquiries' },
  ];

  const topSearches = (searches.data?.top ?? []).map((row) => ({
    label: row.query,
    value: row.count,
    sub: Number.isFinite(Number(row.avgResults)) ? `avg ${Math.round(Number(row.avgResults))} results` : undefined,
  }));
  const zeroSearches = (searches.data?.zeroResults ?? []).map((row) => ({
    label: row.query,
    value: row.count,
  }));

  const destinationItems = (Array.isArray(destinations.data) ? destinations.data : []).map((row) => ({
    label: row.name || titleCase(row.slug),
    value: row.views,
    sub: `${Number(row.wishlistAdds) || 0} wishlists · ${Number(row.whatsappClicks) || 0} WhatsApp · ${Number(row.enquiries) || 0} enquiries`,
  }));

  const packageItems = (packages.data?.[packageTab] ?? []).map((row) => ({
    label: row.title || titleCase(row.slug),
    value: row.count,
  }));

  const funnelStages = (Array.isArray(funnel.data) ? funnel.data : []).map((row) => ({
    ...row,
    label: FUNNEL_LABELS[row.stage] || titleCase(row.stage),
  }));

  const bookingRows = Array.isArray(bookings.data) ? bookings.data : [];

  // Collapse state for the cards this page lays out itself; RankedList and
  // FunnelBar own their toggles internally.
  const [openCards, setOpenCards] = useState({
    overview: true,
    leaderboard: true,
    enquiries: true,
    // Collapsed by default: useful when something looks wrong, noise otherwise.
    security: false,
  });
  const toggleCard = (key) => setOpenCards((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Customer Insights
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Anonymous first-party analytics — what visitors do before they enquire.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-1"
            role="group"
            aria-label="Date range"
          >
            {DAY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setDays(option.value)}
                aria-pressed={days === option.value}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  days === option.value
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Routine rotation, same endpoint as the forced first-login screen.
              Deliberately a small control here rather than a profile section. */}
          <button
            type="button"
            onClick={() => setShowPasswordForm(true)}
            className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Change password
          </button>
          <Link
            to="/admin/insights"
            className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            Contact CRM &rarr;
          </Link>
        </div>
      </header>

      {showPasswordForm && (
        <div className="max-w-md">
          <ChangePasswordForm
            username={username}
            onCancel={() => setShowPasswordForm(false)}
            // Changing it revokes this session, so the only coherent next step
            // is the login screen.
            onDone={onAuthLost}
          />
        </div>
      )}

      {/* KPI row */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Overview</h2>
          <CollapseChevron
            open={openCards.overview}
            onClick={() => toggleCard('overview')}
            label="Overview"
          />
        </div>
        {openCards.overview &&
          (overview.error && !(overview.error instanceof AdminAuthError) ? (
            <ErrorState
              title="Couldn't load the overview."
              description={overview.error.message}
              onRetry={overview.reload}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {statCards.map((card) => (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  loading={overview.loading}
                />
              ))}
            </div>
          ))}
      </section>

      {/* Searches */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedList
          title="Top searches"
          subtitle="What visitors look for the most"
          items={topSearches}
          loading={searches.loading}
          error={searches.error}
          onRetry={searches.reload}
          emptyText="(no searches recorded yet)"
        />
        <RankedList
          title="Searched but not offered"
          subtitle="Searches that returned zero results — demand with no matching package"
          items={zeroSearches}
          loading={searches.loading}
          error={searches.error}
          onRetry={searches.reload}
          emptyText="(no zero-result searches — every search found something)"
        />
      </div>

      {/* Destinations + packages */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RankedList
          title="Most viewed destinations"
          subtitle="Views with wishlist, WhatsApp and enquiry counts"
          items={destinationItems}
          loading={destinations.loading}
          error={destinations.error}
          onRetry={destinations.reload}
        />
        <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
              Package leaderboard
            </h3>
            <div
              className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5"
              role="group"
              aria-label="Leaderboard metric"
            >
              {PACKAGE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPackageTab(tab.key)}
                  aria-pressed={packageTab === tab.key}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    packageTab === tab.key
                      ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                      : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <CollapseChevron
              open={openCards.leaderboard}
              onClick={() => toggleCard('leaderboard')}
              label="Package leaderboard"
            />
          </div>
          <div className={openCards.leaderboard ? 'mt-4' : 'hidden'}>
            {packages.loading ? (
              <div className="space-y-3" role="status" aria-label="Loading">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
                <span className="sr-only">Loading…</span>
              </div>
            ) : packages.error ? (
              <div role="alert" className="py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                Couldn&rsquo;t load the leaderboard.{' '}
                <button
                  type="button"
                  onClick={packages.reload}
                  className="font-medium text-zinc-700 dark:text-zinc-300 underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            ) : packageItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-400 dark:text-zinc-500">
                (no events recorded yet)
              </p>
            ) : (
              <ol className="space-y-2.5">
                {packageItems.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="flex items-baseline gap-3">
                    <span className="w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {item.label}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                      {Number(item.value) || 0}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </div>

      {/* Funnel */}
      <FunnelBar
        title="Enquiry funnel"
        subtitle="From viewing a package to submitting an enquiry"
        stages={funnelStages}
        loading={funnel.loading}
        error={funnel.error}
        onRetry={funnel.reload}
      />

      {/* Enquiries */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-50">Enquiries</h2>
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Click a row to see the journey behind the lead
            </p>
            <CollapseChevron
              open={openCards.enquiries}
              onClick={() => toggleCard('enquiries')}
              label="Enquiries"
            />
          </div>
        </div>
        {openCards.enquiries &&
          (bookings.loading ? (
          <div className="space-y-2" role="status" aria-label="Loading enquiries">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
            <span className="sr-only">Loading…</span>
          </div>
        ) : bookings.error && !(bookings.error instanceof AdminAuthError) ? (
          <ErrorState
            title="Couldn't load enquiries."
            description={bookings.error.message}
            onRetry={bookings.reload}
          />
        ) : bookingRows.length === 0 ? (
          <EmptyState
            title="No enquiries yet."
            description="Leads submitted through the Plan My Trip form will appear here with their journeys."
          />
        ) : (
          <EnquiriesTable bookings={bookingRows} onSelect={setSelectedBooking} />
        ))}
      </section>

      {/* Security activity */}
      <SecurityActivity open={openCards.security} onToggle={() => toggleCard('security')} />

      {selectedBooking && (
        <EnquiryJourneyDrawer
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
        />
      )}
    </div>
  );
}

// ── Page shell: silent bootstrap → dashboard, or login gate ────────────────

export default function AdminAnalyticsPage() {
  // 'checking' | 'ready' | 'login' | 'mustChangePassword'
  const [auth, setAuth] = useState('checking');
  const [sessionUser, setSessionUser] = useState(null);

  useEffect(() => {
    if (auth !== 'checking') return undefined;
    let cancelled = false;

    // The refresh cookie may belong to an account that still owes a password
    // change (they reloaded the page, or an operator reset them mid-session), so
    // the session endpoint is consulted rather than assuming a token means
    // dashboard access. It is one of the two routes such an account can reach.
    (async () => {
      const ok = await bootstrapSession();
      if (cancelled) return;
      if (!ok) {
        setAuth('login');
        return;
      }
      try {
        const session = await getAdminSession();
        if (cancelled) return;
        setSessionUser(session?.username ?? null);
        setAuth(session?.mustChangePassword ? 'mustChangePassword' : 'ready');
      } catch {
        if (!cancelled) setAuth('login');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth]);

  let content;
  if (auth === 'mustChangePassword') {
    // The whole admin surface until the temporary password is replaced. Nothing
    // is rendered behind this — and the backend refuses the data anyway.
    content = (
      <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
        <ChangePasswordForm
          forced
          username={sessionUser}
          onDone={() => {
            // The change revoked this session server-side; the only correct
            // next step is signing in again with the new password.
            setSessionUser(null);
            setAuth('login');
          }}
        />
      </div>
    );
  } else if (auth === 'checking') {
    content = (
      <div className="min-h-[60vh] flex items-center justify-center" role="status">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
          <span className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">
            Restoring session…
          </span>
        </div>
      </div>
    );
  } else if (auth === 'login') {
    content = (
      <LoginGate
        onSuccess={(admin) => {
          setSessionUser(admin?.username ?? null);
          setAuth(admin?.mustChangePassword ? 'mustChangePassword' : 'ready');
        }}
      />
    );
  } else {
    content = (
      <Dashboard
        username={sessionUser}
        onAuthLost={() => setAuth('login')}
        // A mid-session reset by an operator surfaces as 403 on the next call.
        onPasswordChangeRequired={() => setAuth('mustChangePassword')}
      />
    );
  }

  // The site Topbar is fixed (h-16, 68px from sm) — every page must clear it
  // or its first rows render underneath. Same offset every customer page uses.
  return <div className="pt-16 sm:pt-[68px]">{content}</div>;
}

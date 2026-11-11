import { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'

import { ensureSession } from './services/analytics'

import { ThemeProvider } from './context/ThemeContext'
import Topbar from './components/navigation/Topbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import BackToTop from './components/ui/BackToTop'
import FloatingWhatsApp from './components/ui/FloatingWhatsApp'
import { ErrorBoundary, RouteErrorFallback, AppErrorFallback } from './components/ErrorBoundary'
import ConsentBanner from './components/consent/ConsentBanner'
import MarketingRouteTracker from './components/consent/MarketingRouteTracker'
import { lazyRoute } from './utils/lazyRoute'
import LegacyRedirect, { ExploreRedirect } from './components/LegacyRedirect'
import { SeoManager } from './seo/useSeo'

// Eagerly loaded critical path. HomePage is the landing route for most visitors,
// so its chunk would be fetched immediately anyway — bundling it saves a round
// trip on the one page where LCP matters most.
import HomePage from './components/HomePage'

// Lazy loaded page paths for chunk separation.
//
// TripDetailPage was eager, which put it — and the EnquiryModal, EnquiryForm,
// ItineraryAccordion and SimilarPackages it pulls in — into the initial bundle
// for every visitor, including the ones who only ever see the homepage. It is a
// route component like all the others below and behaves identically lazily;
// being listed above rather than here looks deliberate but measured as ~30 kB of
// the initial chunk (sourcemap-attributed) spent on a page most sessions never
// open.
const TripDetailPage = lazyRoute(() => import('./components/TripDetailPage'))
const PackagesPage = lazyRoute(() => import('./pages/PackagesPage'))
const DestinationPage = lazyRoute(() => import('./components/DestinationPage'))
const WishlistPage = lazyRoute(() => import('./pages/WishlistPage'))
const PlanTripPage = lazyRoute(() => import('./pages/PlanTripPage'))
const AboutPage = lazyRoute(() => import('./pages/AboutPage'))
const NotFoundPage = lazyRoute(() => import('./pages/NotFoundPage'))
const WeekendTrips = lazyRoute(() => import('./pages/WeekendTrips'))
const CorporateTours = lazyRoute(() => import('./pages/CorporateTours'))
const Blogs = lazyRoute(() => import('./pages/Blogs'))
const BlogDetail = lazyRoute(() => import('./pages/BlogDetail'))
const ContactUs = lazyRoute(() => import('./pages/ContactUs'))
const PaymentPolicy = lazyRoute(() => import('./pages/PaymentPolicy'))
const NoCostEMI = lazyRoute(() => import('./pages/NoCostEMI'))
const TermsConditions = lazyRoute(() => import('./pages/TermsConditions'))
const PrivacyPolicy = lazyRoute(() => import('./pages/PrivacyPolicy'))
const CancellationPolicy = lazyRoute(() => import('./pages/CancellationPolicy'))
const AdminInsights = lazyRoute(() => import('./pages/AdminInsights'))
const AdminAnalyticsPage = lazyRoute(() => import('./pages/AdminAnalyticsPage'))

const LoadingFallback = () => (
  // Fills the viewport below the fixed top bar while a page's code loads; the
  // footer is not rendered until the page is (see the Suspense below). The
  // spinner holds still for reduced motion.
  <div className="min-h-screen pt-16 sm:pt-[68px] flex items-center justify-center" role="status">
    <div className="flex items-center gap-3">
      <span className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin motion-reduce:animate-none" />
      <span className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Loading…</span>
    </div>
  </div>
)

/**
 * Route-level recovery (ZT-05): a page that throws, or whose code cannot be
 * fetched, is replaced by an error panel while Topbar, Footer and WhatsApp keep
 * working. Keyed on the pathname, so navigating anywhere else recovers.
 */
function RouteBoundary({ children }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary resetKey={pathname} fallback={(props) => <RouteErrorFallback {...props} />}>
      {children}
    </ErrorBoundary>
  )
}

function App() {
  // Fires session_start once per browsing session (landing path, referrer,
  // utm_* params). Fire-and-forget and storage-safe — see services/analytics.js.
  useEffect(() => {
    ensureSession()
  }, [])

  return (
    <ErrorBoundary fallback={() => <AppErrorFallback />}>
    <ThemeProvider>
      <BrowserRouter>
        <div className="flex flex-col min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
          <ScrollToTop />
          {/* Title, description, canonical and robots for every route (ZT-17);
              detail pages refine them once their data arrives. */}
          <SeoManager />
          {/* The one Meta PageView listener (consent-gated, never on /admin).
              First in the tree so it runs before a page's own effects. */}
          <MarketingRouteTracker />
          <Topbar />

          {/* The footer sits inside the same Suspense boundary as the page, so on
              a direct visit it appears together with the page instead of being
              painted under the loading placeholder and then pushed down — the
              layout shift Phase 2 measured (up to 0.40). Client-side navigation
              is a transition, so the current page and footer stay up meanwhile. */}
          <Suspense fallback={<LoadingFallback />}>
          <main className="flex-1">
            <RouteBoundary>
              <Routes>
                <Route path="/" element={<HomePage />} />

                {/* Travel content — all database backed */}
                <Route path="/packages" element={<PackagesPage />} />
                <Route path="/trip/:id" element={<TripDetailPage />} />
                <Route path="/destination/:name" element={<DestinationPage />} />

                {/* The browser remembers the slugs; the page fetches the trips */}
                <Route path="/wishlist" element={<WishlistPage />} />

                {/* Travel enquiry (bookings) — distinct from /contact-us (contacts) */}
                <Route path="/plan-my-trip" element={<PlanTripPage />} />

                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact-us" element={<ContactUs />} />

                {/* Superseded category pages keep working as redirects */}
                <Route path="/explore/:slug" element={<ExploreRedirect />} />
                <Route path="/international" element={<LegacyRedirect to="/packages?tag=international" />} />
                <Route path="/best-sellers" element={<LegacyRedirect to="/packages?popular=true" />} />
                <Route
                  path="/all-domestic-destinations"
                  element={<LegacyRedirect to="/packages?tag=domestic" />}
                />

                <Route path="/weekend-trips" element={<WeekendTrips />} />
                <Route path="/corporate-tours" element={<CorporateTours />} />
                <Route path="/blogs" element={<Blogs />} />
                <Route path="/blog/:slug" element={<BlogDetail />} />

                <Route path="/payment-policy" element={<PaymentPolicy />} />
                <Route path="/no-cost-emi" element={<NoCostEMI />} />
                <Route path="/terms-conditions" element={<TermsConditions />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/cancellation-policy" element={<CancellationPolicy />} />

                <Route path="/admin" element={<Navigate to="/admin/insights" replace />} />
                <Route path="/dashboard" element={<Navigate to="/admin/insights" replace />} />
                <Route path="/admin/insights" element={<AdminInsights />} />
                <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />

                {/* Previously fell through to the homepage, which hid broken links */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </RouteBoundary>
          </main>

          <Footer />
          </Suspense>
          <BackToTop />

          {/* Global WhatsApp CTA — inside the router so it can read the route,
              outside <Routes> so it survives navigation. Hides itself on /admin. */}
          <FloatingWhatsApp />

          {/* Marketing consent (opt-in). Hidden on /admin. See services/consent.js. */}
          <ConsentBanner />
        </div>
      </BrowserRouter>
    </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App

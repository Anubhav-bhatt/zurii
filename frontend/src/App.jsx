import './App.css'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import { ensureSession } from './services/analytics'

import { ThemeProvider } from './context/ThemeContext'
import Topbar from './components/navigation/Topbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import BackToTop from './components/ui/BackToTop'
import FloatingWhatsApp from './components/ui/FloatingWhatsApp'
import LegacyRedirect, { ExploreRedirect } from './components/LegacyRedirect'

// Eagerly loaded critical paths
import HomePage from './components/HomePage'
import TripDetailPage from './components/TripDetailPage'

// Lazy loaded page paths for chunk separation
const PackagesPage = lazy(() => import('./pages/PackagesPage'))
const DestinationPage = lazy(() => import('./components/DestinationPage'))
const WishlistPage = lazy(() => import('./pages/WishlistPage'))
const PlanTripPage = lazy(() => import('./pages/PlanTripPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const WeekendTrips = lazy(() => import('./pages/WeekendTrips'))
const CorporateTours = lazy(() => import('./pages/CorporateTours'))
const Blogs = lazy(() => import('./pages/Blogs'))
const BlogDetail = lazy(() => import('./pages/BlogDetail'))
const ContactUs = lazy(() => import('./pages/ContactUs'))
const PaymentPolicy = lazy(() => import('./pages/PaymentPolicy'))
const NoCostEMI = lazy(() => import('./pages/NoCostEMI'))
const TermsConditions = lazy(() => import('./pages/TermsConditions'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const CancellationPolicy = lazy(() => import('./pages/CancellationPolicy'))
const AdminInsights = lazy(() => import('./pages/AdminInsights'))
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage'))

const LoadingFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status">
    <div className="flex items-center gap-3">
      <span className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-900 dark:border-t-zinc-100 rounded-full animate-spin" />
      <span className="text-zinc-500 dark:text-zinc-400 font-medium text-sm">Loading…</span>
    </div>
  </div>
)

function App() {
  // Fires session_start once per browsing session (landing path, referrer,
  // utm_* params). Fire-and-forget and storage-safe — see services/analytics.js.
  useEffect(() => {
    ensureSession()
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="flex flex-col min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
          <ScrollToTop />
          <Topbar />

          <main className="flex-1">
            <Suspense fallback={<LoadingFallback />}>
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
            </Suspense>
          </main>

          <Footer />
          <BackToTop />

          {/* Global WhatsApp CTA — inside the router so it can read the route,
              outside <Routes> so it survives navigation. Hides itself on /admin. */}
          <FloatingWhatsApp />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App

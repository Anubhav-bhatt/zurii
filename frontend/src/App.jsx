import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Topbar from './components/Topbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'

// Eagerly loaded critical paths
import HomePage from './components/HomePage'
import TripDetailPage from './components/TripDetailPage'

// Lazy loaded page paths for chunk separation
const DestinationPage = lazy(() => import('./components/DestinationPage'))
const ExplorePage = lazy(() => import('./components/ExplorePage'))
const BestSellersPage = lazy(() => import('./components/BestSellersPage'))
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
const AllDomesticDestinations = lazy(() => import('./pages/AllDomesticTours'))
const AdminInsights = lazy(() => import('./pages/AdminInsights'))

const LoadingFallback = () => (
  <div className="min-h-[60vh] flex items-center justify-center bg-zinc-50/30">
    <div className="flex items-center gap-3">
      <span className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-zinc-500 font-medium text-sm">Loading...</span>
    </div>
  </div>
)

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <ScrollToTop />
        <Topbar />
        
        <main className="flex-1">
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/trip/:id" element={<TripDetailPage />} />
              <Route path="/destination/:name" element={<DestinationPage />} />
              <Route path="/explore/:slug" element={<ExplorePage />} />
              <Route path="/international" element={<ExplorePage />} />
              <Route path="/best-sellers" element={<BestSellersPage />} />
              <Route path="/weekend-trips" element={<WeekendTrips />} />
              <Route path="/corporate-tours" element={<CorporateTours />} />
              <Route path="/blogs" element={<Blogs />} />
              <Route path="/blog/:slug" element={<BlogDetail />} />
              <Route path="/contact-us" element={<ContactUs />} />
              <Route path="/payment-policy" element={<PaymentPolicy />} />
              <Route path="/no-cost-emi" element={<NoCostEMI />} />
              <Route path="/terms-conditions" element={<TermsConditions />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/cancellation-policy" element={<CancellationPolicy />} />
              <Route path="/all-domestic-destinations" element={<AllDomesticDestinations />} />
              <Route path="/admin/insights" element={<AdminInsights />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Suspense>
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App

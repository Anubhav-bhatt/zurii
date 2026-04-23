import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Topbar from './components/Topbar'
import Footer from './components/Footer'
import ScrollToTop from './components/ScrollToTop'
import HomePage from './components/HomePage'
import TripDetailPage from './components/TripDetailPage'
import DestinationPage from './components/DestinationPage'
import ExplorePage from './components/ExplorePage'
import BestSellersPage from './components/BestSellersPage'
import WeekendTrips from './pages/WeekendTrips'
import CorporateTours from './pages/CorporateTours'
import Blogs from './pages/Blogs'
import BlogDetail from './pages/BlogDetail'
import ContactUs from './pages/ContactUs'
import PaymentPolicy from './pages/PaymentPolicy'
import NoCostEMI from './pages/NoCostEMI'
import TermsConditions from './pages/TermsConditions'
import PrivacyPolicy from './pages/PrivacyPolicy'
import CancellationPolicy from './pages/CancellationPolicy'
import AllDomesticDestinations from './pages/AllDomesticTours'
import AdminInsights from './pages/AdminInsights'

function App() {
  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen">
        <ScrollToTop />
        <Topbar />
        
        <main className="flex-1">
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
        </main>

        <Footer />
      </div>
    </BrowserRouter>
  )
}

export default App

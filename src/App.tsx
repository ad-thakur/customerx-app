import { Routes, Route, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import About from './pages/About'
import File from './pages/File'
import Result from './pages/Result'
import Payment from './pages/Payment'
import Report from './pages/Report'
import Notice from './pages/Notice'
import Dashboard from './pages/Dashboard'
import CaseTracking from './pages/CaseTracking'
import Resolution from './pages/Resolution'
import ClaimAggregation from './pages/ClaimAggregation'
import JoinClaim from './pages/JoinClaim'
import IndividualPursuit from './pages/IndividualPursuit'
import SignIn from './pages/SignIn'
import AuthCallback from './pages/AuthCallback'
import { AuthProvider } from './lib/AuthContext'
import BrandShell from './pages/brand/BrandShell'
import BrandQueue from './pages/brand/BrandQueue'
import BrandComplaint from './pages/brand/BrandComplaint'
import BrandSettings from './pages/brand/BrandSettings'
import TrackComplaint from './pages/TrackComplaint'
import ComplainTo from './pages/ComplainTo'

export default function App() {
  const { pathname } = useLocation()

  // The brand dashboard is a separate workspace with its own chrome.
  if (pathname === '/brand' || pathname.startsWith('/brand/')) {
    return (
      <AuthProvider>
        <Routes>
          <Route path="/brand" element={<BrandShell />}>
            <Route index element={<BrandQueue />} />
            <Route path="c/:id" element={<BrandComplaint />} />
            <Route path="settings" element={<BrandSettings />} />
          </Route>
        </Routes>
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/claim-aggregation" element={<ClaimAggregation />} />
            <Route path="/file" element={<File />} />
            <Route path="/result" element={<Result />} />
            <Route path="/join-claim" element={<JoinClaim />} />
            <Route path="/individual-pursuit" element={<IndividualPursuit />} />
            <Route path="/pay/:id" element={<Payment />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/notice/:id" element={<Notice />} />
            <Route path="/cases" element={<Dashboard />} />
            <Route path="/case/:id" element={<CaseTracking />} />
            <Route path="/case/:id/offer" element={<Resolution />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/track/:id" element={<TrackComplaint />} />
            <Route path="/complain/:slug" element={<ComplainTo />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </AuthProvider>
  )
}

import { Routes, Route } from 'react-router-dom'
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

export default function App() {
  return (
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
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

import { Link, useLocation } from 'react-router-dom'
import Logo from './Logo'

export default function Header() {
  const location = useLocation()
  const isFilingFlow = location.pathname.startsWith('/file') || location.pathname.startsWith('/result')

  return (
    <header className="border-b border-line/80 bg-paper/95 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-20">
        <Link to="/" className="flex items-center gap-3 group">
          <Logo className="w-9 h-9 text-ink shrink-0 group-hover:text-seal transition-colors" />
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            Consumer X
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm lg:text-base font-medium text-ink-soft whitespace-nowrap">
          <Link to="/about" className="hover:text-ink transition-colors">
            About us
          </Link>
          <Link to="/cases" className="hover:text-ink transition-colors">
            My cases
          </Link>
          <a href="/#how-it-works" className="hover:text-ink transition-colors">
            How it works
          </a>
          <a href="/#grounds" className="hover:text-ink transition-colors">
            Grounds for a case
          </a>
          <a href="/#pricing" className="hover:text-ink transition-colors">
            Pricing
          </a>
        </nav>

        {!isFilingFlow ? (
          <Link
            to="/file"
            className="bg-ink text-paper px-5 py-2.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            File a complaint
          </Link>
        ) : (
          <span className="case-number text-sm text-ink-soft border border-line rounded-full px-4 py-2">
            Draft in progress
          </span>
        )}
      </div>
    </header>
  )
}

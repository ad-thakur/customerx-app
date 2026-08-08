import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Logo from './Logo'
import { useAuth } from '../lib/AuthContext'

const NAV = [
  { label: 'About us', to: '/about', router: true },
  { label: 'My cases', to: '/cases', router: true },
  { label: 'Claim aggregation', to: '/claim-aggregation', router: true },
  { label: 'How it works', to: '/#how-it-works', router: false },
  { label: 'Pricing', to: '/#pricing', router: false },
]

export default function Header() {
  const location = useLocation()
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const isFilingFlow =
    location.pathname.startsWith('/file') || location.pathname.startsWith('/result')

  const close = () => setMenuOpen(false)

  const NavLink = ({ label, to, router }: (typeof NAV)[number]) =>
    router ? (
      <Link to={to} onClick={close} className="hover:text-ink transition-colors">
        {label}
      </Link>
    ) : (
      <a href={to} onClick={close} className="hover:text-ink transition-colors">
        {label}
      </a>
    )

  return (
    <header className="border-b border-line/80 bg-paper/95 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-6 flex items-center justify-between h-20">
        <Link to="/" onClick={close} className="flex items-center gap-3 group">
          <Logo className="w-9 h-9 text-ink shrink-0 group-hover:text-seal transition-colors" />
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">
            Consumer X
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-4 lg:gap-6 text-sm lg:text-base font-medium text-ink-soft whitespace-nowrap">
          {NAV.map((item) => (
            <NavLink key={item.label} {...item} />
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              title={user.email}
              className="hidden sm:inline-block text-sm text-ink-soft hover:text-ink transition-colors"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/signin"
              className="hidden sm:inline-block text-sm font-medium text-ink-soft hover:text-ink transition-colors"
            >
              Sign in
            </Link>
          )}

          {!isFilingFlow ? (
            <Link
              to="/file"
              className="hidden sm:inline-block bg-ink text-paper px-5 py-2.5 rounded-full font-medium hover:bg-seal transition-colors"
            >
              File a complaint
            </Link>
          ) : (
            <span className="case-number text-sm text-ink-soft border border-line rounded-full px-4 py-2">
              Draft in progress
            </span>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="md:hidden inline-flex flex-col justify-center gap-1.5 w-10 h-10 items-center rounded-full border border-line text-ink"
          >
            <span className={`block w-5 h-0.5 bg-current transition-transform ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block w-5 h-0.5 bg-current transition-transform ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {menuOpen && (
        <nav className="md:hidden border-t border-line bg-paper px-6 py-4 flex flex-col gap-4 text-ink-soft font-medium">
          {NAV.map((item) => (
            <NavLink key={item.label} {...item} />
          ))}
          {user ? (
            <button
              type="button"
              onClick={() => {
                close()
                void signOut()
              }}
              className="text-left hover:text-ink transition-colors"
            >
              Sign out ({user.email})
            </button>
          ) : (
            <Link to="/signin" onClick={close} className="hover:text-ink transition-colors">
              Sign in
            </Link>
          )}
          <Link
            to="/file"
            onClick={close}
            className="mt-1 bg-ink text-paper text-center px-5 py-2.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            File a complaint
          </Link>
        </nav>
      )}
    </header>
  )
}

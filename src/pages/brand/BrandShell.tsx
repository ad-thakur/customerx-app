import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import Logo from '../../components/Logo'
import { useAuth } from '../../lib/AuthContext'
import { createBrand, myBrands, rememberBrand, rememberedBrand, type Brand } from '../../lib/brandApi'

/* -------------------------------------------------------------------------- */
/* Selected-brand context                                                     */
/* -------------------------------------------------------------------------- */

interface BrandValue {
  brand: Brand
  brands: Brand[]
  select: (id: string) => void
  reload: () => Promise<void>
}

const BrandContext = createContext<BrandValue | null>(null)

export function useBrand(): BrandValue {
  const v = useContext(BrandContext)
  if (!v) throw new Error('useBrand outside BrandShell')
  return v
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                      */
/* -------------------------------------------------------------------------- */

export default function BrandShell() {
  const { user, loading, signOut } = useAuth()
  const [brands, setBrands] = useState<Brand[] | null>(null)
  const [selected, setSelected] = useState<string | null>(rememberedBrand())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setBrands(await myBrands())
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (user) void reload()
  }, [user, reload])

  const brand = brands?.find((b) => b.id === selected) ?? brands?.[0] ?? null
  const select = (id: string) => {
    rememberBrand(id)
    setSelected(id)
  }

  let body: ReactNode
  if (loading || (user && brands === null && !error)) {
    body = <p className="text-center text-ink-soft py-24">Loading…</p>
  } else if (!user) {
    body = <BrandLanding />
  } else if (error) {
    body = <p className="text-center text-seal py-24">{error}</p>
  } else if (!brand) {
    body = <Onboarding onCreated={(b) => void reload().then(() => select(b.id))} />
  } else {
    body = (
      <BrandContext.Provider value={{ brand, brands: brands!, select, reload }}>
        <Outlet />
      </BrandContext.Provider>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <header className="border-b border-line bg-ink text-paper sticky top-0 z-40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/brand" className="flex items-center gap-2.5 shrink-0">
              <Logo className="w-7 h-7 text-marigold" />
              <span className="font-display text-lg font-semibold tracking-tight">Consumer X</span>
              <span className="hidden sm:inline case-number text-[10px] text-marigold border border-marigold/50 rounded px-1.5 py-0.5">
                FOR BRANDS
              </span>
            </Link>
            {brand && brands && brands.length > 1 && (
              <select
                value={brand.id}
                onChange={(e) => select(e.target.value)}
                className="ml-2 bg-ink-soft/40 border border-paper/20 rounded px-2 py-1 text-sm min-w-0"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            {brand && brands?.length === 1 && (
              <span className="hidden sm:inline text-paper/70 text-sm truncate">· {brand.name}</span>
            )}
          </div>
          {user && (
            <nav className="flex items-center gap-1 sm:gap-4 text-sm">
              {brand && (
                <>
                  <NavLink
                    to="/brand"
                    end
                    className={({ isActive }) =>
                      `px-2 py-1 rounded ${isActive ? 'text-marigold' : 'text-paper/80 hover:text-paper'}`
                    }
                  >
                    Complaints
                  </NavLink>
                  <NavLink
                    to="/brand/social"
                    className={({ isActive }) =>
                      `px-2 py-1 rounded ${isActive ? 'text-marigold' : 'text-paper/80 hover:text-paper'}`
                    }
                  >
                    Social
                  </NavLink>
                  <NavLink
                    to="/brand/settings"
                    className={({ isActive }) =>
                      `px-2 py-1 rounded ${isActive ? 'text-marigold' : 'text-paper/80 hover:text-paper'}`
                    }
                  >
                    Channels
                  </NavLink>
                </>
              )}
              <button
                type="button"
                onClick={() => void signOut()}
                title={user.email}
                className="hidden sm:inline text-paper/60 hover:text-paper"
              >
                Sign out
              </button>
            </nav>
          )}
        </div>
      </header>
      <main className="flex-1">{body}</main>
      <footer className="border-t border-line py-5 text-center text-xs text-ink-soft px-4">
        Outcome estimates are statistical indications from published consumer-commission judgments, not legal advice.
      </footer>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Signed-out landing                                                         */
/* -------------------------------------------------------------------------- */

function BrandLanding() {
  const points = [
    ['Every complaint, one queue', 'From your website form, your support inbox and Consumer X — analysed the moment it lands.'],
    ['Know how it would be decided', 'Each complaint scored against 50,000+ NCDRC judgments, including your own record before the commissions.'],
    ['Settle for less, sooner', 'Costed options from a priority repair to store credit, measured against what defending it would cost.'],
  ]
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
      <p className="case-number text-seal text-sm mb-3">CONSUMER X FOR BRANDS</p>
      <h1 className="font-display text-4xl sm:text-5xl text-ink leading-tight max-w-3xl">
        Resolve consumer complaints before they become consumer cases.
      </h1>
      <p className="text-ink-soft text-lg mt-5 max-w-2xl leading-relaxed">
        A complaint desk that tells you which complaints would succeed at a consumer commission, what they would cost you,
        and the cheapest fair way to close each one.
      </p>
      <div className="flex flex-wrap gap-3 mt-8">
        <Link
          to="/signin?next=/brand"
          className="bg-ink text-paper rounded-full px-6 py-3 font-medium hover:bg-seal transition-colors"
        >
          Sign in to your brand dashboard
        </Link>
      </div>
      <div className="grid md:grid-cols-3 gap-4 mt-14">
        {points.map(([t, d]) => (
          <div key={t} className="border border-line rounded-lg bg-white/70 p-6">
            <p className="font-display text-lg text-ink font-semibold mb-2">{t}</p>
            <p className="text-sm text-ink-soft leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* First-run brand setup                                                      */
/* -------------------------------------------------------------------------- */

function Onboarding({ onCreated }: { onCreated: (b: Brand) => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  const [margin, setMargin] = useState('40')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    createBrand({
      name: name.trim(),
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      grossMargin: Math.min(90, Math.max(0, Number(margin) || 40)) / 100,
    })
      .then((b) => {
        onCreated(b)
        navigate('/brand')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-16">
      <p className="case-number text-seal text-sm mb-2">SET UP YOUR BRAND</p>
      <h1 className="font-display text-3xl text-ink mb-2">Tell us who you are.</h1>
      <p className="text-ink-soft mb-8">
        We use your registered names to find every consumer-commission case your company has been party to.
      </p>
      <form onSubmit={submit} className="space-y-5 border border-line rounded-lg bg-white/70 p-6">
        <label className="block">
          <span className="text-sm font-medium text-ink">Brand name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Voltix"
            className="mt-1 w-full border border-line rounded px-3 py-2 bg-white"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Registered / legal names</span>
          <input
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            placeholder="Voltix Appliances Ltd, Voltix India Pvt Ltd"
            className="mt-1 w-full border border-line rounded px-3 py-2 bg-white"
          />
          <span className="text-xs text-ink-soft">Comma-separated. How you appear as a respondent in judgments.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-ink">Gross margin (%)</span>
          <input
            type="number"
            min={0}
            max={90}
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            className="mt-1 w-32 border border-line rounded px-3 py-2 bg-white"
          />
          <span className="block text-xs text-ink-soft">
            Used to cost replacements and gift cards at what they really cost you, not their face value.
          </span>
        </label>
        {error && <p className="text-sm text-seal">{error}</p>}
        <button
          disabled={busy || name.trim().length < 2}
          className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create brand dashboard'}
        </button>
      </form>
    </div>
  )
}

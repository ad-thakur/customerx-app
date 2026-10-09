import { useEffect, useState } from 'react'
import { useBrand } from './BrandShell'
import { CopyLine } from './BrandComplaint'
import { addMember, listMembers, updateBrand } from '../../lib/brandApi'
import { BRAND_DOMAIN, BRAND_NAME } from '../../lib/brand'

const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')
const INBOUND_DOMAIN = (import.meta.env.VITE_INBOUND_DOMAIN as string | undefined) || `inbound.${BRAND_DOMAIN}`

export default function BrandSettings() {
  const { brand, reload } = useBrand()
  const hostedUrl = `${window.location.origin}/complain/${brand.slug}`
  const inbound = `complaints+${brand.slug}@${INBOUND_DOMAIN}`

  const embed = `<!-- ${brand.name} complaint form, powered by ${BRAND_NAME} -->
<form id="cx-complaint">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email" required>
  <input name="orderRef" placeholder="Order number">
  <input name="product" placeholder="Product">
  <textarea name="body" placeholder="What went wrong?" required></textarea>
  <button>Submit complaint</button>
</form>
<script>
document.getElementById('cx-complaint').addEventListener('submit', async (e) => {
  e.preventDefault()
  const res = await fetch('${API_ORIGIN}/api/intake/${brand.intakeKey}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
  })
  const r = await res.json()
  e.target.outerHTML = res.ok
    ? '<p>Thank you. Track your complaint here: <a href="' + r.trackUrl + '">' + r.id + '</a></p>'
    : '<p>' + (r.error || 'Something went wrong') + '</p>'
})
</script>`

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-8">
      <div>
        <p className="case-number text-seal text-xs mb-1">CHANNELS</p>
        <h1 className="font-display text-3xl text-ink">Where complaints come from</h1>
        <p className="text-ink-soft mt-2">
          Every channel lands in the same queue and is analysed on arrival. The consumer gets a tracking link either
          way.
        </p>
      </div>

      <Card title="Your website’s complaint form" tag="WEBSITE">
        <p className="text-sm text-ink-soft mb-3">
          Paste this into any page, or post the same JSON fields from your existing form. The key is publishable — it
          can only file complaints to {brand.name}.
        </p>
        <pre className="text-[11px] bg-ink text-paper rounded p-4 overflow-x-auto leading-relaxed">{embed}</pre>
        <div className="mt-2">
          <CopyLine text={`POST ${API_ORIGIN}/api/intake/${brand.intakeKey}`} />
        </div>
      </Card>

      <Card title="Hosted complaint page" tag={`${BRAND_NAME.toUpperCase()} FORM`}>
        <p className="text-sm text-ink-soft mb-3">
          No form of your own? Link to this page from your site, receipts or packaging.
        </p>
        <CopyLine text={hostedUrl} />
        <a href={hostedUrl} target="_blank" rel="noreferrer" className="text-sm text-seal underline mt-2 inline-block">
          Open it →
        </a>
      </Card>

      <Card title="Your support inbox" tag="EMAIL">
        <p className="text-sm text-ink-soft mb-3">
          Set your complaints or grievance-officer inbox to auto-forward to this address. Each email becomes a
          complaint, with the sender as the consumer.
        </p>
        <CopyLine text={inbound} />
        <p className="text-xs text-ink-soft mt-3 border-l-2 border-marigold pl-3">
          Requires the inbound mail domain to be configured on our side (an inbound-parse provider pointed at{' '}
          <span className="case-number">/api/intake/email</span>). Until then, use the website or hosted form, or add
          complaints by hand.
        </p>
      </Card>

      <BrandProfile key={brand.id} onSaved={reload} />
      <Team />
    </div>
  )
}

function Card({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <section className="border border-line rounded-lg bg-white/80 p-6">
      <p className="case-number text-[11px] text-ink-soft">{tag}</p>
      <h2 className="font-display text-xl text-ink mb-2">{title}</h2>
      {children}
    </section>
  )
}

function BrandProfile({ onSaved }: { onSaved: () => Promise<void> }) {
  const { brand } = useBrand()
  const [name, setName] = useState(brand.name)
  const [aliases, setAliases] = useState(brand.aliases.join(', '))
  const [margin, setMargin] = useState(String(Math.round(brand.grossMargin * 100)))
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setState('saving')
    setError(null)
    updateBrand(brand.id, {
      name: name.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      grossMargin: Math.min(90, Math.max(0, Number(margin) || 0)) / 100,
    })
      .then(onSaved)
      .then(() => setState('saved'))
      .catch((err: Error) => {
        setError(err.message)
        setState('idle')
      })
  }

  const input = 'mt-1 w-full border border-line rounded px-3 py-2 bg-white text-sm'
  return (
    <Card title="Brand profile" tag="SETTINGS">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-sm text-ink">Brand name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-sm text-ink">Registered / legal names (comma-separated)</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={input} />
          <span className="text-xs text-ink-soft">Used to find judgments where you were a party.</span>
        </label>
        <label className="block">
          <span className="text-sm text-ink">Gross margin (%)</span>
          <input type="number" min={0} max={90} value={margin} onChange={(e) => setMargin(e.target.value)} className={`${input} w-32`} />
        </label>
        {error && <p className="text-sm text-seal">{error}</p>}
        <button className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
        </button>
        <p className="text-xs text-ink-soft">Existing complaints keep their analysis until you re-run it.</p>
      </form>
    </Card>
  )
}

function Team() {
  const { brand } = useBrand()
  const [members, setMembers] = useState<{ email: string; role: string }[]>([])
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listMembers(brand.id).then(setMembers).catch(() => setMembers([]))
  }, [brand.id])

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    addMember(brand.id, email.trim())
      .then((m) => {
        setMembers(m)
        setEmail('')
      })
      .catch((err: Error) => setError(err.message))
  }

  return (
    <Card title="Team" tag="ACCESS">
      <ul className="text-sm text-ink mb-4 space-y-1">
        {members.map((m) => (
          <li key={m.email}>{m.email}</li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2 flex-wrap">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@brand.com"
          className="border border-line rounded px-3 py-2 bg-white text-sm flex-1 min-w-48"
        />
        <button className="border border-ink text-ink rounded-full px-5 py-2 text-sm hover:bg-ink hover:text-paper transition-colors">
          Add
        </button>
      </form>
      {error && <p className="text-sm text-seal mt-2">{error}</p>}
      <p className="text-xs text-ink-soft mt-2">They sign in with that email to get access.</p>
    </Card>
  )
}

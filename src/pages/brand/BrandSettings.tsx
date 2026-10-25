import { useEffect, useState } from 'react'
import { useBrand } from './BrandShell'
import { CopyLine } from './BrandComplaint'
import { addMember, listMembers, loadUsage, updateBrand } from '../../lib/brandApi'
import { BRAND_DOMAIN, BRAND_NAME } from '../../lib/brand'

const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '')
const INBOUND_DOMAIN = (import.meta.env.VITE_INBOUND_DOMAIN as string | undefined) || `inbound.${BRAND_DOMAIN}`

export default function BrandSettings() {
  const { brand, reload } = useBrand()
  const hostedUrl = `${window.location.origin}/complain/${brand.slug}`
  // Setup details (embed code, intake address, forwarding email) are for the
  // platform team who connect a brand's channels, not for the brand's users.
  const [isStaff, setIsStaff] = useState(false)
  useEffect(() => {
    loadUsage(brand.id)
      .then((u) => setIsStaff(u.isAdmin))
      .catch(() => setIsStaff(false))
  }, [brand.id])

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-8">
      <div>
        <p className="case-number text-seal text-xs mb-1">SETTINGS</p>
        <h1 className="font-display text-3xl text-ink">Your brand and team</h1>
      </div>

      <Card title="How complaints reach you" tag="COMPLAINTS">
        <p className="text-sm text-ink-soft mb-4 leading-relaxed">
          Complaints from your website, your support email and your {BRAND_NAME} complaint page all arrive in your
          Complaints list, already analysed. The {BRAND_NAME} team connects these for you — to add or change one,
          contact us.
        </p>
        <p className="text-sm text-ink font-medium mb-1">Your complaint page</p>
        <p className="text-xs text-ink-soft mb-2">
          Share this link with customers — on your website, receipts or packaging.
        </p>
        <CopyLine text={hostedUrl} />
        <a href={hostedUrl} target="_blank" rel="noreferrer" className="text-sm text-seal underline mt-2 inline-block">
          Open your complaint page →
        </a>
      </Card>

      <BrandProfile key={brand.id} onSaved={reload} />
      <SettlementSettings key={`settle-${brand.id}`} onSaved={reload} />
      <Team />
      {isStaff && <StaffSetup />}
    </div>
  )
}

/** Connection details for the platform team. Hidden from brand users. */
function StaffSetup() {
  const { brand } = useBrand()
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
    <section className="border border-dashed border-marigold/70 rounded-lg bg-marigold/5 p-6 space-y-6">
      <div>
        <p className="case-number text-[11px] text-[#8a5f14]">{BRAND_NAME.toUpperCase()} STAFF ONLY · NOT SHOWN TO THE BRAND</p>
        <h2 className="font-display text-xl text-ink">Connection setup</h2>
        <p className="text-sm text-ink-soft mt-1">Details for connecting this brand’s complaint channels.</p>
      </div>
      <div>
        <p className="text-sm text-ink font-medium mb-1">Website form</p>
        <p className="text-sm text-ink-soft mb-3">
          Paste into the brand’s site, or post the same JSON fields from their existing form. The key is publishable —
          it can only file complaints to {brand.name}.
        </p>
        <pre className="text-[11px] bg-ink text-paper rounded p-4 overflow-x-auto leading-relaxed">{embed}</pre>
        <div className="mt-2">
          <CopyLine text={`POST ${API_ORIGIN}/api/intake/${brand.intakeKey}`} />
        </div>
      </div>
      <div>
        <p className="text-sm text-ink font-medium mb-1">Support inbox forwarding</p>
        <p className="text-sm text-ink-soft mb-3">
          Set the brand’s complaints inbox to auto-forward here; each email becomes a complaint.
        </p>
        <CopyLine text={inbound} />
        <p className="text-xs text-ink-soft mt-3 border-l-2 border-marigold pl-3">
          Not live yet: needs an inbound-parse provider pointed at <span className="case-number">/api/intake/email</span>{' '}
          and INBOUND_EMAIL_SECRET set on the API.
        </p>
      </div>
    </section>
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
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setState('saving')
    setError(null)
    updateBrand(brand.id, {
      name: name.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
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
    <Card title="Brand details" tag="BRAND">
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-sm text-ink">Brand name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-sm text-ink">Your company’s legal names</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={input} />
          <span className="text-xs text-ink-soft">
            As they appear on invoices, separated by commas — e.g. “Voltix Appliances Ltd, Voltix India Pvt Ltd”. We use
            them to find past court cases involving you.
          </span>
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

/** How the brand settles claims. Meant for whoever signs off on settlements
 *  (typically legal or the head of customer service); everything optional. */
function SettlementSettings({ onSaved }: { onSaved: () => Promise<void> }) {
  const { brand } = useBrand()
  const [margin, setMargin] = useState(brand.grossMargin === null ? '' : String(Math.round(brand.grossMargin * 100)))
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setState('saving')
    setError(null)
    const pct = margin.trim() === '' ? null : Math.min(90, Math.max(0, Number(margin) || 0))
    updateBrand(brand.id, { grossMargin: pct === null ? null : pct / 100 })
      .then(onSaved)
      .then(() => setState('saved'))
      .catch((err: Error) => {
        setError(err.message)
        setState('idle')
      })
  }

  return (
    <Card title="Settlement settings" tag="SETTLEMENTS">
      <p className="text-sm text-ink-soft mb-4 leading-relaxed">
        For whoever approves settlements — usually your legal head or head of customer service.
      </p>
      <form onSubmit={save} className="space-y-4">
        <label className="block">
          <span className="text-sm text-ink">Gross margin (%) — optional</span>
          <input
            type="number"
            min={0}
            max={90}
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            placeholder="Not given"
            className="mt-1 border border-line rounded px-3 py-2 bg-white text-sm w-32 block"
          />
          <span className="text-xs text-ink-soft">
            Lets us cost replacements and vouchers at what they actually cost you. Leave blank and we cost them at full
            price. Only your team sees this.
          </span>
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

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { hostedBrand, submitHosted } from '../lib/brandApi'

// Hosted complaint form for a partner brand: /complain/:slug. Brands without
// a form of their own link here from their site, receipts or packaging.

export default function ComplainTo() {
  const { slug = '' } = useParams()
  const [brand, setBrand] = useState<{ name: string } | null>(null)
  const [missing, setMissing] = useState(false)
  const [f, setF] = useState({
    name: '',
    email: '',
    phone: '',
    orderRef: '',
    product: '',
    amount: '',
    purchaseDate: '',
    subject: '',
    body: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string; trackUrl: string } | null>(null)

  useEffect(() => {
    hostedBrand(slug)
      .then(setBrand)
      .catch(() => setMissing(true))
  }, [slug])

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    submitHosted(slug, f)
      .then(setDone)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  if (missing) return <p className="text-center text-ink-soft py-24">We couldn’t find that brand.</p>
  if (!brand) return <p className="text-center text-ink-soft py-24">Loading…</p>

  if (done) {
    const path = new URL(done.trackUrl).pathname + new URL(done.trackUrl).search
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <p className="case-number text-verdict text-sm mb-3">COMPLAINT SENT · {done.id}</p>
        <h1 className="font-display text-3xl text-ink mb-3">{brand.name} has your complaint.</h1>
        <p className="text-ink-soft mb-6">
          Keep this link — it’s how you’ll see their reply, add details and respond to any offer. Bookmark it or
          save it somewhere safe.
        </p>
        <a href={path} className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors inline-block">
          Track your complaint
        </a>
      </div>
    )
  }

  const input = 'mt-1 w-full border border-line rounded px-3 py-2 bg-white'
  return (
    <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
      <p className="case-number text-seal text-sm mb-2">COMPLAINT TO {brand.name.toUpperCase()}</p>
      <h1 className="font-display text-3xl text-ink mb-2">Tell {brand.name} what went wrong.</h1>
      <p className="text-ink-soft mb-8">
        This goes straight to {brand.name}’s complaints team. You’ll get a link to follow it. Free, and it doesn’t
        affect your rights as a consumer.
      </p>
      <form onSubmit={submit} className="space-y-4 border border-line rounded-lg bg-white/70 p-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block text-sm text-ink">
            Your name *
            <input required value={f.name} onChange={set('name')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Email *
            <input required type="email" value={f.email} onChange={set('email')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Phone
            <input value={f.phone} onChange={set('phone')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Order / invoice number
            <input value={f.orderRef} onChange={set('orderRef')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Product or service
            <input value={f.product} onChange={set('product')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Amount paid (₹)
            <input inputMode="numeric" value={f.amount} onChange={set('amount')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Date of purchase
            <input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} className={input} />
          </label>
          <label className="block text-sm text-ink">
            Subject
            <input value={f.subject} onChange={set('subject')} className={input} />
          </label>
        </div>
        <label className="block text-sm text-ink">
          What happened? *
          <textarea
            required
            rows={7}
            value={f.body}
            onChange={set('body')}
            placeholder="What went wrong, what you’ve already tried, and what would put it right."
            className={input}
          />
        </label>
        {error && <p className="text-sm text-seal">{error}</p>}
        <button
          disabled={busy}
          className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send complaint'}
        </button>
      </form>
    </div>
  )
}

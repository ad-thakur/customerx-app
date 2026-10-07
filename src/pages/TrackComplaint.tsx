import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  ago,
  loadTrack,
  OFFER_LABEL,
  rupees,
  trackDetails,
  trackOffer,
  trackReply,
  type ComplaintStatus,
  type TrackView,
} from '../lib/brandApi'

// The consumer's view of a complaint they made directly to a brand, reached
// from the link in the brand's first response. No account needed: the token
// in the link is the access control, as with case links.

const STATUS_TEXT: Record<ComplaintStatus, { label: string; cls: string; help: string }> = {
  new: { label: 'RECEIVED', cls: 'text-ink border-line bg-white', help: 'The brand has your complaint and has not replied yet.' },
  responded: { label: 'BRAND HAS REPLIED', cls: 'text-[#8a5f14] border-marigold/50 bg-marigold/10', help: 'Read their reply below. You can respond, add details, or answer their offer.' },
  consumer_replied: { label: 'WAITING ON BRAND', cls: 'text-ink border-line bg-white', help: 'You have replied. The brand will see your message.' },
  resolved: { label: 'RESOLVED', cls: 'text-verdict border-verdict/40 bg-verdict/10', help: 'This complaint is resolved.' },
  escalated: { label: 'ESCALATED', cls: 'text-seal border-seal/40 bg-seal/5', help: 'You have taken this further.' },
  closed: { label: 'CLOSED', cls: 'text-ink-soft border-line bg-white', help: 'The brand has closed this complaint. If you disagree, you can still take it further.' },
}

export default function TrackComplaint() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const t = params.get('t') ?? ''
  const [v, setV] = useState<TrackView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reply, setReply] = useState('')
  const [editing, setEditing] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  const load = useCallback(() => {
    loadTrack(id, t)
      .then(setV)
      .catch((e: Error) => setError(e.message))
  }, [id, t])
  useEffect(() => {
    load()
  }, [load])

  const run = (p: Promise<TrackView>) => {
    setBusy(true)
    setError(null)
    return p
      .then((x) => {
        setV(x)
        return true
      })
      .catch((e: Error) => {
        setError(e.message)
        return false
      })
      .finally(() => setBusy(false))
  }

  if (!v && error) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="font-display text-2xl text-ink mb-2">{error}</p>
        <p className="text-ink-soft">Check you opened the full link from the brand’s email.</p>
      </div>
    )
  }
  if (!v) return <p className="text-center text-ink-soft py-24">Loading your complaint…</p>

  const st = STATUS_TEXT[v.status]
  const open = v.status !== 'resolved' && v.status !== 'closed'
  const offer = v.offer

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <p className="case-number text-xs text-ink-soft">YOUR COMPLAINT TO {v.brandName.toUpperCase()} · {v.id}</p>
      <h1 className="font-display text-3xl text-ink mt-1">{v.subject || 'Your complaint'}</h1>
      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <span className={`case-number text-[11px] tracking-wide px-3 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
        <span className="text-sm text-ink-soft">{st.help}</span>
      </div>

      {error && <p className="text-sm text-seal mt-4">{error}</p>}

      {offer && (
        <section className={`mt-6 rounded-lg border-2 p-5 ${offer.status === 'pending' ? 'border-marigold bg-marigold/10' : 'border-line bg-white/70'}`}>
          <p className="case-number text-[11px] text-ink-soft">
            {offer.status === 'pending' ? 'OFFER FROM ' + v.brandName.toUpperCase() : `OFFER ${offer.status.toUpperCase()}`}
          </p>
          <p className="font-display text-2xl text-ink mt-1">
            {OFFER_LABEL[offer.kind]}
            {offer.value > 0 && ` · ${rupees(offer.value)}`}
          </p>
          {offer.status === 'pending' && open && (
            <>
              <p className="text-sm text-ink-soft mt-1">
                Accepting closes this complaint. You are under no obligation to accept, and declining does not affect
                your right to take it further.
              </p>
              {!declining ? (
                <div className="flex gap-3 mt-4 flex-wrap">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(trackOffer(id, t, 'accept'))}
                    className="bg-verdict text-paper rounded-full px-6 py-2.5 font-medium hover:bg-ink transition-colors"
                  >
                    Accept offer
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclining(true)}
                    className="border border-ink text-ink rounded-full px-6 py-2.5 font-medium hover:bg-ink hover:text-paper transition-colors"
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Optional: tell them what would resolve it for you"
                    className="w-full border border-line rounded px-3 py-2 bg-white text-sm"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(trackOffer(id, t, 'decline', reason)).then((ok) => ok && setDeclining(false))}
                      className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium"
                    >
                      Decline offer
                    </button>
                    <button type="button" onClick={() => setDeclining(false)} className="text-sm text-ink-soft">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Conversation */}
      <section className="mt-8">
        <h2 className="font-display text-xl text-ink mb-3">Conversation</h2>
        <ol className="space-y-3">
          <li className="rounded-lg border border-line bg-white/80 p-4 sm:mr-10">
            <p className="text-xs text-ink-soft mb-1.5">
              <b className="text-ink">You</b> · {ago(v.receivedAt)}
            </p>
            <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{v.body}</p>
          </li>
          {v.thread.map((e) =>
            e.from === 'system' ? (
              <li key={e.id} className="text-xs text-ink-soft text-center">
                {e.text} · {ago(e.at)}
              </li>
            ) : (
              <li
                key={e.id}
                className={`rounded-lg border p-4 ${e.from === 'brand' ? 'border-ink/20 bg-ink/[0.03] sm:ml-10' : 'border-line bg-white/80 sm:mr-10'}`}
              >
                <p className="text-xs text-ink-soft mb-1.5">
                  <b className="text-ink">{e.from === 'brand' ? v.brandName : 'You'}</b> · {ago(e.at)}
                </p>
                <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{e.text}</p>
              </li>
            ),
          )}
        </ol>

        {open && (
          <div className="mt-4">
            <textarea
              rows={3}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={`Write to ${v.brandName}…`}
              className="w-full border border-line rounded px-3 py-2 bg-white text-sm"
            />
            <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
              <button type="button" onClick={() => setEditing((x) => !x)} className="text-sm text-seal underline">
                {editing ? 'Hide' : 'Add or correct details'}
              </button>
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void run(trackReply(id, t, reply)).then((ok) => ok && setReply(''))}
                className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {open && editing && <DetailsForm v={v} busy={busy} onSave={(d) => run(trackDetails(id, t, d)).then((ok) => ok && setEditing(false))} />}
      </section>

      {/* The way out, if this doesn't work. */}
      <section className="mt-12 border-t border-line pt-6">
        <p className="text-sm text-ink-soft leading-relaxed">
          This page is run by <b className="text-ink">Consumer X</b>, an independent platform. It is free for you, and
          nothing here limits your rights under the Consumer Protection Act, 2019.{' '}
          {open || v.status === 'closed' ? (
            <>
              If this isn’t resolved, you can{' '}
              <Link to="/file" className="text-seal underline">
                check your case and send a formal notice
              </Link>{' '}
              — the eligibility check is free.
            </>
          ) : null}
        </p>
      </section>
    </div>
  )
}

function DetailsForm({
  v,
  busy,
  onSave,
}: {
  v: TrackView
  busy: boolean
  onSave: (d: Record<string, unknown>) => void
}) {
  const [f, setF] = useState({
    orderRef: v.orderRef,
    product: v.product,
    amountClaimed: v.amountClaimed ? String(v.amountClaimed) : '',
    purchaseDate: v.purchaseDate ?? '',
    addition: '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value })
  const input = 'mt-1 w-full border border-line rounded px-3 py-2 bg-white text-sm'
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSave(f)
      }}
      className="mt-4 border border-line rounded-lg bg-white/70 p-5 space-y-3"
    >
      <p className="text-sm text-ink-soft">
        Your original complaint stays as written. Anything you add here is recorded alongside it, so both sides keep
        the same record.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block text-sm">
          Order / invoice number
          <input value={f.orderRef} onChange={set('orderRef')} className={input} />
        </label>
        <label className="block text-sm">
          Product
          <input value={f.product} onChange={set('product')} className={input} />
        </label>
        <label className="block text-sm">
          Amount paid (₹)
          <input inputMode="numeric" value={f.amountClaimed} onChange={set('amountClaimed')} className={input} />
        </label>
        <label className="block text-sm">
          Purchase date
          <input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} className={input} />
        </label>
      </div>
      <label className="block text-sm">
        Anything to add
        <textarea rows={3} value={f.addition} onChange={set('addition')} className={input} />
      </label>
      <button disabled={busy} className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors">
        Save details
      </button>
    </form>
  )
}

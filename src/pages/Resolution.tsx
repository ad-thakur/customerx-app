import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getCaseView,
  acceptOffer,
  setLedgerConsent,
  inr,
  type CaseView,
} from '../lib/caseStore'

function slugEmail(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18)
  return `legal@${slug || 'company'}.in`
}

export default function Resolution() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const urlToken = searchParams.get('t')
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    getCaseView(id, urlToken)
      .then(setRecord)
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [id, urlToken])

  if (loading) {
    return <p className="text-center text-ink-soft py-24">Loading your case…</p>
  }

  if (!record || !record.notice) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">We couldn't find that case.</p>
        <Link to="/cases" className="text-seal font-medium">Back to my cases →</Link>
      </div>
    )
  }

  const status = record.derived.status
  const offer = record.derived.offer
  const claim = record.intake.claimAmount ?? 0
  const company = record.intake.companyName || 'The company'
  const a = record.assessment

  if (status === 'awaiting_response') {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">No offer yet — the response window is still open.</p>
        <Link to={`/case/${record.id}`} className="text-seal font-medium">Back to case tracking →</Link>
      </div>
    )
  }

  const accept = () => {
    setBusy(true)
    acceptOffer(record.id)
      .then((v) => {
        setRecord(v)
        window.scrollTo(0, 0)
      })
      .catch(() => alert('Could not record the acceptance — please try again.'))
      .finally(() => setBusy(false))
  }

  const addToLedger = () => {
    setBusy(true)
    setLedgerConsent(record.id, true)
      .then(setRecord)
      .catch(() => alert('Could not update ledger consent — please try again.'))
      .finally(() => setBusy(false))
  }

  // ------------------------------------------------------------------ resolved
  if (record.resolution) {
    const r = record.resolution
    const spent = record.assessment ? 499 : 0
    const multiple = spent > 0 ? Math.round(r.amount / spent) : null
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <div className="text-center pt-4">
          <div className="w-16 h-16 rounded-full bg-verdict text-paper text-3xl flex items-center justify-center mx-auto mb-5">✓</div>
          <p className="case-number text-verdict text-sm mb-3">
            CASE RESOLVED · {r.daysFromNotice} DAYS AFTER NOTICE
          </p>
          <h1 className="font-display text-4xl text-ink mb-4">{inr(r.amount)} recovered.</h1>
          <p className="text-ink-soft max-w-md mx-auto">
            Settlement recorded in your case file. {company} has 7 days to transfer the amount — we
            track that too, and reopen the case if it doesn't arrive.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
            <p className="font-display text-2xl font-semibold text-ink">{r.daysFromNotice} days</p>
            <p className="text-sm text-ink-soft mt-1">Notice to resolution</p>
          </div>
          <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
            <p className="font-display text-2xl font-semibold text-ink">{spent > 0 ? inr(spent) : 'Free'}</p>
            <p className="text-sm text-ink-soft mt-1">Your total cost</p>
          </div>
          <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
            <p className="font-display text-2xl font-semibold text-ink">{multiple ? `${multiple}×` : '∞'}</p>
            <p className="text-sm text-ink-soft mt-1">Recovered vs spent</p>
          </div>
        </div>

        <div className="border border-ink rounded-lg bg-ink text-paper p-7 mt-7 text-center">
          <h3 className="font-display text-xl mb-2">Your case just made the next person's fight shorter.</h3>
          <p className="text-sm text-paper/75 max-w-md mx-auto mb-5">
            With your consent, this outcome joins the public ledger — so the next {company} customer
            knows the pattern, and {company} knows they know.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button
              onClick={addToLedger}
              disabled={busy || r.ledgerConsent}
              className="bg-paper text-ink rounded-full px-5 py-2.5 font-medium hover:bg-paper-dim transition-colors disabled:opacity-80"
            >
              {r.ledgerConsent ? 'Added to the public ledger ✓' : 'Add my outcome (anonymised)'}
            </button>
            <Link
              to="/cases"
              className="border border-paper/40 text-paper rounded-full px-5 py-2.5 font-medium hover:bg-paper/10 transition-colors"
            >
              Back to my cases
            </Link>
          </div>
        </div>

        <div className="border border-line rounded-lg bg-white/70 p-6 mt-7">
          <h3 className="font-display text-lg text-ink mb-2">And if they had stayed silent?</h3>
          <p className="text-sm text-ink-soft">
            Day 30 unlocks assisted filing: your packet — notice, delivery proof, evidence,
            precedents — assembled for the Commission with an empanelled advocate, for one fixed
            fee. The credible threat is what makes settlements like this one happen in{' '}
            {r.daysFromNotice} days.
          </p>
        </div>
      </div>
    )
  }

  // ------------------------------------------------------------ offer received
  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <p className="case-number text-seal text-sm mb-3">
        SETTLEMENT OFFER · DAY {record.derived.noticeDaysElapsed} OF 30
      </p>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">{company} wants to settle.</h1>
      <p className="text-ink-soft mb-8">
        Their legal team responded to your notice. Here's the offer
        {a && ', measured against what your assessment said a Commission would likely award'}.
      </p>

      <div className="border border-line rounded-lg bg-white/70 p-7 mb-7">
        <p className="text-sm text-ink-soft mb-4">
          From {slugEmail(record.intake.companyName)} · today
        </p>
        <blockquote className="border-l-2 border-line pl-5 font-display text-ink leading-relaxed">
          "Without admission of liability, and in the interest of an amicable resolution, our client
          is willing to refund the full purchase consideration of <b>{inr(claim)}</b> and
          additionally credit <b>{inr(offer.goodwill)}</b> towards the inconvenience caused, subject
          to withdrawal of the contemplated proceedings…"
        </blockquote>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <p className="text-sm text-ink-soft">Their offer</p>
            <p className="font-display text-2xl font-semibold text-ink">{inr(offer.amount)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-ink-soft">Your claim</p>
            <p className="font-display text-2xl font-semibold text-ink">{inr(claim)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-ink-soft">Assessment range</p>
            <p className="font-display text-2xl font-semibold text-ink">
              {a ? `${inr(a.rangeLow)}–${inr(a.rangeHigh)}` : '—'}
            </p>
          </div>
        </div>
        <div className="border border-verdict/40 bg-verdict/5 rounded-lg px-5 py-4 mt-6">
          <p className="text-sm text-ink">
            <b className="text-verdict">Our read:</b> the offer covers 100% of your claim
            {a && offer.amount >= a.rangeLow && ' and sits inside the realistic range'}. Accepting
            now beats a likely 12–18 month wait at the Commission for a similar number.
          </p>
        </div>
      </div>

      <div className="flex gap-4 justify-center flex-wrap mb-8">
        <button
          onClick={() =>
            alert('In the live product this opens a counter-offer / decline flow, with the filing path as leverage.')
          }
          className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
        >
          Decline / counter
        </button>
        <button
          onClick={accept}
          disabled={busy}
          className="bg-verdict text-paper rounded-full px-6 py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
        >
          {busy ? 'Recording…' : `Accept — settle for ${inr(offer.amount)}`}
        </button>
      </div>

      <p className="text-center">
        <Link to={`/case/${record.id}`} className="text-ink-soft hover:text-ink text-sm font-medium">
          ← Back to case tracking
        </Link>
      </p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  getCaseView,
  advanceCase,
  caseClockDate,
  caseShareUrl,
  fmtDate,
  inr,
  MILESTONES,
  type CaseView,
} from '../lib/caseStore'
import { groundById } from '../lib/grounds'

interface TimelineItem {
  when: string
  what: string
  note: string
}

function buildTimeline(c: CaseView): { items: TimelineItem[]; current: TimelineItem } {
  const elapsed = c.derived.noticeDaysElapsed
  const items: TimelineItem[] = [
    {
      when: fmtDate(c.createdAt, { day: 'numeric', month: 'short' }),
      what: 'Complaint filed on Consumer X',
      note: `Eligibility confirmed: ${c.routing.commissionLabel.match(/\(([^)]+)\)/)?.[1] ?? c.routing.commissionLabel}, evidence score ${c.routing.evidenceScore.score}/100.`,
    },
  ]
  if (c.assessment) {
    items.push({
      when: fmtDate(c.assessment.paidAt, { day: 'numeric', month: 'short' }),
      what: 'Recovery assessment purchased — ₹499',
      note: `Band: ${c.assessment.band[0].toUpperCase()}${c.assessment.band.slice(1)}. Range ${inr(c.assessment.rangeLow)}–${inr(c.assessment.rangeHigh)}. Recommended: notice first.`,
    })
  }
  if (c.notice) {
    const clockDate = (d: number) => fmtDate(caseClockDate(c, d), { day: 'numeric', month: 'short' })
    items.push({
      when: clockDate(0),
      what: 'Notice sent — email + registered post',
      note: `${c.notice.ref} · Registered post ${c.notice.postId}.`,
    })
    if (elapsed >= MILESTONES.emailDelivered)
      items.push({
        when: clockDate(MILESTONES.emailDelivered),
        what: 'Email delivered',
        note: 'Delivery receipt preserved — becomes an annexure if we file.',
      })
    if (elapsed >= MILESTONES.postAcknowledged)
      items.push({
        when: clockDate(MILESTONES.postAcknowledged),
        what: 'Registered post acknowledged',
        note: 'Proof of service on record.',
      })
    if (elapsed >= MILESTONES.noticeOpened)
      items.push({
        when: clockDate(MILESTONES.noticeOpened),
        what: 'Company opened the notice',
        note: 'Read receipt on the grievance mailbox.',
      })
    if (elapsed >= MILESTONES.offerReceived)
      items.push({
        when: clockDate(MILESTONES.offerReceived),
        what: 'Settlement offer received',
        note: 'The company responded with an offer to settle.',
      })
  }

  const status = c.derived.status
  const current: TimelineItem =
    status === 'window_closed'
      ? { when: 'Now', what: 'Response window closed', note: 'No acceptance recorded — assisted filing is unlocked.' }
      : status === 'offer_received'
        ? { when: 'Now', what: 'Offer awaiting your decision', note: 'Review it against your assessment before the window closes.' }
        : { when: 'Now', what: 'Awaiting response', note: 'If the window closes silently, your filing packet is already 80% assembled.' }

  return { items, current }
}

export default function CaseTracking() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const urlToken = searchParams.get('t')
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loading, setLoading] = useState(true)
  const [advancing, setAdvancing] = useState(false)
  const [copied, setCopied] = useState(false)

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

  if (!record) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">We couldn't find that case (or the link is missing its access token).</p>
        <Link to="/cases" className="text-seal font-medium">Back to my cases →</Link>
      </div>
    )
  }

  const ground = groundById(record.intake.ground)

  if (!record.notice) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">This case's notice hasn't been sent yet.</p>
        <Link to={`/notice/${record.id}`} className="text-seal font-medium">Review and send the notice →</Link>
      </div>
    )
  }

  const status = record.derived.status
  const elapsed = record.derived.noticeDaysElapsed
  const daysLeft = Math.max(0, MILESTONES.windowCloses - elapsed)
  const { items, current } = buildTimeline(record)
  const offer = record.derived.offer
  const resolved = status === 'resolved'

  const CIRC = 2 * Math.PI * 52
  const offset = CIRC * (Math.min(elapsed, 30) / MILESTONES.windowCloses)

  const advance = () => {
    setAdvancing(true)
    advanceCase(record.id)
      .then(setRecord)
      .catch(() => alert('Could not advance the demo clock — please try again.'))
      .finally(() => setAdvancing(false))
  }

  const copyShareLink = () => {
    navigator.clipboard.writeText(caseShareUrl(record.id)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-14">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <p className="case-number text-xs text-ink-soft">
            {record.id} · {ground?.label} · {ground?.section}
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-ink mt-2">
            {record.intake.companyName || 'Your case'}
            {record.intake.narrative && (
              <span className="text-ink-soft"> — {record.intake.narrative.slice(0, 50)}{record.intake.narrative.length > 50 ? '…' : ''}</span>
            )}
          </h1>
        </div>
        <div className="flex gap-3 items-center mt-2">
          <button
            onClick={copyShareLink}
            className="border border-line text-ink-soft hover:text-ink rounded-full px-4 py-1.5 text-sm font-medium transition-colors"
          >
            {copied ? 'Link copied ✓' : 'Share case link'}
          </button>
          <Link to="/cases" className="text-ink-soft hover:text-ink text-sm font-medium">
            ← My cases
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 mt-8 items-start">
        {/* Left column */}
        <div>
          <div className="border border-line rounded-lg bg-white/70 p-7 mb-5">
            <h3 className="font-display text-xl text-ink mb-6">Case timeline</h3>
            <ul className="relative border-l-2 border-line ml-2 space-y-6">
              {items.map((item) => (
                <li key={item.what} className="pl-6 relative">
                  <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-verdict border-2 border-paper" />
                  <p className="case-number text-xs text-ink-soft">{item.when}</p>
                  <p className="font-medium text-ink mt-0.5">{item.what}</p>
                  <p className="text-sm text-ink-soft mt-0.5">{item.note}</p>
                </li>
              ))}
              {!resolved && (
                <li className="pl-6 relative">
                  <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-marigold border-2 border-paper animate-pulse" />
                  <p className="case-number text-xs text-ink-soft">{current.when}</p>
                  <p className="font-medium text-ink mt-0.5">{current.what}</p>
                  <p className="text-sm text-ink-soft mt-0.5">{current.note}</p>
                </li>
              )}
              {resolved && (
                <li className="pl-6 relative">
                  <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-verdict border-2 border-paper" />
                  <p className="case-number text-xs text-ink-soft">{fmtDate(record.resolution!.acceptedAt, { day: 'numeric', month: 'short' })}</p>
                  <p className="font-medium text-ink mt-0.5">Settled — {inr(record.resolution!.amount)} recovered</p>
                  <p className="text-sm text-ink-soft mt-0.5">
                    Resolved {record.resolution!.daysFromNotice} days after notice, without a Commission hearing.
                  </p>
                </li>
              )}
            </ul>
          </div>

          {/* Offer banner */}
          {status === 'offer_received' && (
            <div className="border border-verdict/40 bg-verdict/5 rounded-lg p-6 mb-5">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div>
                  <p className="text-sm font-semibold text-verdict">
                    NEW — {record.intake.companyName || 'The company'} has responded
                  </p>
                  <p className="text-sm text-ink-soft mt-1">
                    An offer to settle for {inr(offer.amount)}. Review it before the window closes.
                  </p>
                </div>
                <Link
                  to={`/case/${record.id}/offer`}
                  className="bg-verdict text-paper rounded-full px-5 py-2.5 font-medium hover:bg-ink transition-colors"
                >
                  Review their offer →
                </Link>
              </div>
            </div>
          )}

          {resolved && (
            <div className="border border-verdict/40 bg-verdict/5 rounded-lg p-6 mb-5">
              <div className="flex justify-between items-center flex-wrap gap-3">
                <p className="text-sm text-ink">
                  <b className="text-verdict">Resolved.</b> {inr(record.resolution!.amount)} recovered,{' '}
                  {record.resolution!.daysFromNotice} days after notice.
                </p>
                <Link to={`/case/${record.id}/offer`} className="text-verdict font-medium text-sm">
                  View the outcome →
                </Link>
              </div>
            </div>
          )}

          {/* Demo controls */}
          {!resolved && status !== 'window_closed' && (
            <div className="border border-dashed border-line rounded-lg p-4 flex justify-between items-center flex-wrap gap-3">
              <p className="case-number text-xs text-ink-soft">
                DEMO CONTROLS — day {elapsed} of 30 on the case clock. In production this is real time.
              </p>
              <button
                onClick={advance}
                disabled={advancing}
                className="border border-line text-ink-soft hover:text-ink hover:border-ink rounded-full px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60"
              >
                {advancing ? 'Advancing…' : 'Fast-forward to next event ⏩'}
              </button>
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          <div className="border border-line rounded-lg bg-white/70 p-6 text-center mb-5">
            <p className="text-sm text-ink-soft mb-3">Response window</p>
            <div className="relative w-[150px] h-[150px] mx-auto">
              <svg width="150" height="150" viewBox="0 0 120 120" className="-rotate-90">
                <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" className="stroke-paper-dim" />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  strokeWidth="10"
                  strokeLinecap="round"
                  className="stroke-marigold"
                  strokeDasharray={CIRC}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-3xl font-semibold text-ink leading-none">{daysLeft}</p>
                <p className="text-xs text-ink-soft mt-1">days left of 30</p>
              </div>
            </div>
            <p className="text-sm text-ink-soft border-t border-line pt-3 mt-4">
              Response due <b className="text-ink">{fmtDate(caseClockDate(record, MILESTONES.windowCloses), { day: 'numeric', month: 'long' })}</b>
            </p>
          </div>

          <div className="border border-line rounded-lg bg-white/70 p-6 mb-5">
            <h3 className="font-display text-lg text-ink mb-3">Case file</h3>
            <p className="text-sm text-ink py-2 border-b border-line">📄 {ground ? `Notice — ${ground.label.toLowerCase()}` : 'Pre-litigation notice'} (sent)</p>
            {record.assessment && (
              <p className="text-sm text-ink py-2 border-b border-line">📄 Recovery assessment report</p>
            )}
            {record.intake.evidence.map((e) => (
              <p key={e.id} className="text-sm text-ink py-2 border-b border-line last:border-b-0">
                📎 {e.name}
              </p>
            ))}
            {record.intake.evidence.length === 0 && (
              <p className="text-sm text-ink-soft py-2">No evidence files uploaded yet.</p>
            )}
          </div>

          <div className="border border-ink rounded-lg bg-ink text-paper p-6">
            <h3 className="font-display text-lg mb-2">If they stay silent</h3>
            <p className="text-sm text-paper/75 mb-4">
              On day 30 we assemble your {record.routing.commissionLabel.match(/\(([^)]+)\)/)?.[1] ?? 'Commission'} filing
              with an empanelled advocate. One fixed fee, no surprises.
            </p>
            <button
              disabled={status !== 'window_closed'}
              onClick={() => alert('Assisted filing is a Phase 2 ops workflow — not part of this demo build.')}
              className="w-full border border-paper/40 text-paper rounded-full py-2.5 font-medium disabled:opacity-50 enabled:hover:bg-paper/10 transition-colors"
            >
              {status === 'window_closed' ? 'Start assisted filing' : 'Available on day 30'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

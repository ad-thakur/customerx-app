import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  listCaseViews,
  inr,
  MILESTONES,
  type CaseView,
  type CaseStatus,
} from '../lib/caseStore'
import { groundById } from '../lib/grounds'

const STATUS_CHIP: Record<CaseStatus, { label: string; cls: string; border: string }> = {
  draft: {
    label: 'DRAFT — NOTICE NOT SENT',
    cls: 'text-ink-soft border-line bg-white/70',
    border: 'border-l-line',
  },
  awaiting_response: {
    label: 'AWAITING RESPONSE',
    cls: 'text-marigold border-marigold/40 bg-marigold/10',
    border: 'border-l-marigold',
  },
  offer_received: {
    label: 'OFFER RECEIVED',
    cls: 'text-verdict border-verdict/40 bg-verdict/10',
    border: 'border-l-verdict',
  },
  window_closed: {
    label: 'WINDOW CLOSED — FILING UNLOCKED',
    cls: 'text-seal border-seal/40 bg-seal/10',
    border: 'border-l-seal',
  },
  resolved: {
    label: 'RESOLVED',
    cls: 'text-verdict border-verdict/40 bg-verdict/10',
    border: 'border-l-verdict',
  },
}

function caseLink(c: CaseView): string {
  if (c.derived.status === 'draft') return `/notice/${c.id}`
  return `/case/${c.id}`
}

function subline(c: CaseView): string {
  const claim = inr((c.intake.claimAmount ?? 0) + (c.intake.consequentialLoss ?? 0))
  switch (c.derived.status) {
    case 'draft':
      return `Claim ${claim} · Eligibility confirmed · Notice drafted, not yet sent`
    case 'awaiting_response':
      return `Claim ${claim} · Notice delivered, awaiting response`
    case 'offer_received':
      return `Claim ${claim} · Settlement offer received — review it before the window closes`
    case 'window_closed':
      return `Claim ${claim} · No response in 30 days · Assisted filing available`
    case 'resolved':
      return `Settled at notice stage in ${c.resolution?.daysFromNotice} days · Recovered ${inr(c.resolution?.amount ?? 0)}`
  }
}

export default function Dashboard() {
  const [cases, setCases] = useState<CaseView[] | null>(null)

  useEffect(() => {
    listCaseViews()
      .then(setCases)
      .catch(() => setCases([]))
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (cases === null) {
    return <p className="text-center text-ink-soft py-24">Loading your cases…</p>
  }

  const active = cases.filter((c) => c.derived.status !== 'resolved')
  const resolved = cases.filter((c) => c.derived.status === 'resolved')
  const recovered = resolved.reduce((sum, c) => sum + (c.resolution?.amount ?? 0), 0)
  const firstName = cases[0]?.intake.fullName?.split(' ')[0]

  return (
    <div className="mx-auto max-w-4xl px-6 py-14">
      <div className="flex justify-between items-end flex-wrap gap-4 mb-8">
        <div>
          <p className="case-number text-seal text-sm mb-2">YOUR DASHBOARD</p>
          <h1 className="font-display text-3xl md:text-4xl text-ink">
            {greeting}{firstName ? `, ${firstName}` : ''}.
          </h1>
        </div>
        <Link
          to="/file"
          className="bg-ink text-paper rounded-full px-5 py-2.5 font-medium hover:bg-seal transition-colors"
        >
          + New complaint
        </Link>
      </div>

      {cases.length === 0 ? (
        <div className="border border-line rounded-lg bg-white/70 p-10 text-center">
          <p className="font-display text-xl text-ink mb-2">No cases yet on this device.</p>
          <p className="text-ink-soft mb-6">
            Tell us what happened — the eligibility check is free, and takes about five minutes.
          </p>
          <Link
            to="/file"
            className="inline-block bg-seal text-paper rounded-full px-6 py-2.5 font-medium hover:bg-ink transition-colors"
          >
            File a complaint
          </Link>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
              <p className="font-display text-3xl font-semibold text-verdict">{inr(recovered)}</p>
              <p className="text-sm text-ink-soft mt-1">Recovered so far</p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
              <p className="font-display text-3xl font-semibold text-ink">{active.length}</p>
              <p className="text-sm text-ink-soft mt-1">Active {active.length === 1 ? 'case' : 'cases'}</p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
              <p className="font-display text-3xl font-semibold text-ink">{resolved.length}</p>
              <p className="text-sm text-ink-soft mt-1">Resolved</p>
            </div>
          </div>

          {active.length > 0 && (
            <>
              <h3 className="font-display text-2xl text-ink mb-4">Active</h3>
              {active.map((c) => {
                const chip = STATUS_CHIP[c.derived.status]
                const ground = groundById(c.intake.ground)
                const daysLeft = MILESTONES.windowCloses - c.derived.noticeDaysElapsed
                return (
                  <Link
                    key={c.id}
                    to={caseLink(c)}
                    className={`block border border-line border-l-4 ${chip.border} rounded-lg bg-white/70 p-6 mb-4 hover:border-ink/40 transition-colors`}
                  >
                    <div className="flex justify-between items-start flex-wrap gap-3">
                      <div>
                        <p className="case-number text-xs text-ink-soft">
                          {c.id} · {ground?.label} · {ground?.section}
                        </p>
                        <p className="font-display text-lg font-semibold text-ink mt-1">
                          {c.intake.companyName || 'Unnamed company'}
                          {c.intake.narrative && ` — ${c.intake.narrative.slice(0, 60)}${c.intake.narrative.length > 60 ? '…' : ''}`}
                        </p>
                        <p className="text-sm text-ink-soft mt-1">{subline(c)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`case-number text-xs rounded-full border px-3 py-1 ${chip.cls}`}>
                          {chip.label}
                        </span>
                        {c.derived.status === 'awaiting_response' && (
                          <p className="text-sm text-ink-soft mt-2">
                            <b className="text-ink">{daysLeft}</b> days left in response window
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </>
          )}

          {resolved.length > 0 && (
            <>
              <h3 className="font-display text-2xl text-ink mb-4 mt-10">Resolved</h3>
              {resolved.map((c) => {
                const ground = groundById(c.intake.ground)
                return (
                  <Link
                    key={c.id}
                    to={`/case/${c.id}/offer`}
                    className="block border border-line border-l-4 border-l-verdict rounded-lg bg-paper-dim/50 p-6 mb-4 hover:border-ink/40 transition-colors"
                  >
                    <div className="flex justify-between items-start flex-wrap gap-3">
                      <div>
                        <p className="case-number text-xs text-ink-soft">
                          {c.id} · {ground?.label} · {ground?.section}
                        </p>
                        <p className="font-display text-lg font-semibold text-ink mt-1">
                          {c.intake.companyName || 'Unnamed company'}
                        </p>
                        <p className="text-sm text-ink-soft mt-1">{subline(c)}</p>
                      </div>
                      <span className="case-number text-xs text-verdict border border-verdict/40 bg-verdict/10 rounded-full px-3 py-1">
                        RECOVERED {inr(c.resolution?.amount ?? 0)}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}

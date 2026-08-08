import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useIntake } from '../lib/IntakeContext'
import { runRoutingEngine } from '../lib/rulesEngine'
import { groundListLabel, groundsByIds } from '../lib/grounds'
import type { GroundId } from '../lib/types'
import { fetchPrecedents, type PrecedentResult } from '../lib/precedents'
import { ensureCaseFromIntake } from '../lib/caseStore'
import { matchGroup, GROUP_JOIN_FEE } from '../lib/groups'
import Chip from '../components/Chip'

const BAND_STYLE = {
  strong: { text: 'text-verdict', bg: 'bg-verdict/10', border: 'border-verdict/40', label: 'Strong' },
  moderate: { text: 'text-marigold', bg: 'bg-marigold/10', border: 'border-marigold/40', label: 'Moderate' },
  weak: { text: 'text-seal', bg: 'bg-seal/10', border: 'border-seal/40', label: 'Needs more evidence' },
}

export default function Result() {
  const { data } = useIntake()
  const navigate = useNavigate()
  const grounds = data.grounds ?? []
  const [creating, setCreating] = useState<'pay' | 'notice' | null>(null)

  // Guard: if someone lands here without completing intake, send them back.
  useEffect(() => {
    if (grounds.length === 0 || !data.claimAmount || !data.incidentDate) {
      navigate('/file')
    }
  }, [data, grounds.length, navigate])

  const result = useMemo(() => runRoutingEngine(data), [data])
  const band = BAND_STYLE[result.evidenceScore.band]
  const group = matchGroup(data.companyName)

  const [precedents, setPrecedents] = useState<PrecedentResult[] | null>(null)
  const [precedentsError, setPrecedentsError] = useState<string | null>(null)
  const [precedentsLoading, setPrecedentsLoading] = useState(false)

  const groundKey = grounds.join(',')
  useEffect(() => {
    if (grounds.length === 0) return
    setPrecedentsLoading(true)
    setPrecedentsError(null)
    // Note: deliberately searches on the statutory grounds only, never the user's
    // narrative — we don't send case-specific personal details to a third party.
    fetchPrecedents(groundListLabel(groundKey.split(',') as GroundId[], false))
      .then(setPrecedents)
      .catch((err) => setPrecedentsError(err.message))
      .finally(() => setPrecedentsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groundKey])

  if (grounds.length === 0) return null

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="case-number text-seal text-sm mb-3">YOUR CASE SUMMARY</p>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-2">
        {data.fullName ? `${data.fullName.split(' ')[0]}, here's where things stand.` : 'Here\u2019s where things stand.'}
      </h1>
      <p className="text-ink-soft mb-10">
        This is an automated assessment based on what you entered — not legal advice, and not a
        guarantee of outcome or recovery amount.
      </p>

      {/* Commission routing */}
      <div className="border border-line rounded-lg bg-white/70 p-7 mb-6">
        <p className="text-sm text-ink-soft mb-1">Your case should be filed at the</p>
        <p className="font-display text-2xl text-ink mb-4">{result.commissionLabel}</p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ink-soft">Total claim value</p>
            <p className="font-medium text-ink">₹{result.totalClaim.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <p className="text-ink-soft">Estimated court fee</p>
            <p className="font-medium text-ink">{result.courtFeeEstimate}</p>
          </div>
          <div>
            <p className="text-ink-soft">
              Ground{grounds.length > 1 ? 's' : ''} for complaint
            </p>
            <p className="font-medium text-ink">
              {groundsByIds(grounds).map((g) => g.label).join(' · ')}
            </p>
          </div>
          <div>
            <p className="text-ink-soft">Statutory reference{grounds.length > 1 ? 's' : ''}</p>
            <p className="font-medium text-ink">
              {groundsByIds(grounds).map((g) => g.section).join(' · ')}
            </p>
          </div>
        </div>
      </div>

      {/* Limitation status */}
      <div
        className={`border rounded-lg p-7 mb-6 ${
          result.limitation.expired ? 'border-seal/40 bg-seal/5' : 'border-line bg-white/70'
        }`}
      >
        <p className="text-sm text-ink-soft mb-1">Filing window (2-year limitation period)</p>
        {result.limitation.expired ? (
          <>
            <p className="font-display text-xl text-seal mb-2">
              The standard 2-year window appears to have passed.
            </p>
            <p className="text-sm text-ink-soft">
              {result.limitation.withinCondonablePeriod
                ? 'You may still be able to file if the Commission accepts a delay condonation application with sufficient cause — this needs individual review.'
                : 'Filing may still be possible with a delay condonation application, but this requires case-specific legal review — please get in touch before assuming your claim cannot proceed.'}
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-xl text-ink mb-2">
              {result.limitation.daysRemaining.toLocaleString('en-IN')} days remaining
            </p>
            <p className="text-sm text-ink-soft">Counted two years from the date the problem occurred.</p>
          </>
        )}
      </div>

      {/* Evidence score */}
      <div className={`border rounded-lg p-7 mb-10 ${band.border} ${band.bg}`}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-ink-soft">Evidence strength</p>
          <span className={`case-number text-xs px-3 py-1 rounded-full border ${band.border} ${band.text}`}>
            {band.label.toUpperCase()}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white overflow-hidden mb-5">
          <div
            className={`h-full ${band.text.replace('text-', 'bg-')}`}
            style={{ width: `${result.evidenceScore.score}%` }}
          />
        </div>
        {result.evidenceScore.missing.length > 0 && (
          <>
            <p className="text-sm text-ink font-medium mb-2">Consider adding:</p>
            <ul className="text-sm text-ink-soft list-disc list-inside space-y-1">
              {result.evidenceScore.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Similar precedents */}
      <div className="border border-line rounded-lg bg-white/70 p-7 mb-6">
        <p className="text-sm text-ink-soft mb-1">Similar precedents</p>
        <p className="font-display text-xl text-ink mb-4">Cases decided on similar grounds</p>

        {precedentsLoading && <p className="text-sm text-ink-soft">Searching decided cases…</p>}

        {precedentsError && (
          <p className="text-sm text-ink-soft">
            Couldn't load precedents right now ({precedentsError}).
          </p>
        )}

        {precedents && precedents.length === 0 && (
          <div className="border border-line/70 border-dashed rounded-lg px-5 py-6 text-center">
            <p className="text-sm text-ink">No similar cases have been filed.</p>
            <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto leading-relaxed">
              Nothing in the judgment corpus is close enough to your facts to be worth showing.
              That says nothing about the strength of your case — only that we won't pad this
              section with cases that aren't comparable.
            </p>
          </div>
        )}

        {precedents && precedents.length > 0 && (
          <ul className="space-y-4">
            {precedents.map((p) => (
              <li key={p.docUrl} className="border-t border-line pt-4 first:border-t-0 first:pt-0">
                <a
                  href={p.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ink hover:text-seal transition-colors"
                >
                  {p.title} ↗
                </a>
                {p.court && <p className="text-xs text-ink-soft mt-0.5">{p.court}</p>}
                {p.snippet && <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{p.snippet}</p>}
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-ink-soft/70 mt-5 pt-4 border-t border-line">
          Retrieved from the e-Jagriti judgment corpus on your statutory grounds — never your
          case narrative. Only cases clearing a relevance threshold are shown; where none do, we
          say so rather than fill the space. For reference only, not a guarantee of outcome.
        </p>
      </div>

      {/* GROUP-CLAIM CALLOUT — the aggregation nudge */}
      {group && (
        <div className="border border-line border-l-4 border-l-marigold rounded-lg bg-white/70 p-7 mb-6">
          <Chip tone="gold">YOU'RE NOT ALONE</Chip>
          <p className="font-display text-2xl text-ink mt-4 mb-2">
            {group.count} people already have an active claim against {group.company}.
          </p>
          <p className="text-sm text-ink-soft mb-4">
            Similar claims against <span className="font-medium">{group.company}</span> — and against
            others wronged by the same issue — are being pursued together right now. Join them, and
            the company faces one coordinated claim worth {group.combinedValue} instead of your ₹
            {result.totalClaim.toLocaleString('en-IN')} alone.
          </p>
          <div className="flex flex-wrap gap-6 mb-5 text-sm">
            <div>
              <p className="font-display text-2xl text-ink leading-none">{group.count}</p>
              <p className="text-ink-soft">claimants</p>
            </div>
            <div>
              <p className="font-display text-2xl text-ink leading-none">{group.combinedValue}</p>
              <p className="text-ink-soft">combined claim value</p>
            </div>
          </div>
          <Link
            to="/join-claim"
            className="inline-block bg-seal text-paper px-6 py-3 rounded-full font-medium hover:bg-ink transition-colors"
          >
            Join {group.count} others — {GROUP_JOIN_FEE} →
          </Link>
        </div>
      )}

      {/* CTAs — the individual path (real backend-wired actions) */}
      {group && <p className="case-number text-seal text-sm mb-3">OR TAKE IT ON INDIVIDUALLY</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="border border-line rounded-lg p-6 bg-white/70">
          <p className="font-display text-lg text-ink mb-1">Want a recovery estimate?</p>
          <p className="text-sm text-ink-soft mb-4">
            ₹499 — a likelihood band and realistic recovery range based on cases with comparable
            evidence profiles.
          </p>
          <button
            disabled={creating !== null}
            onClick={() => {
              setCreating('pay')
              ensureCaseFromIntake(data, result)
                .then((c) => navigate(c.assessment ? `/report/${c.id}` : `/pay/${c.id}`))
                .catch(() => alert('Could not reach the case service — please try again.'))
                .finally(() => setCreating(null))
            }}
            className="w-full bg-seal text-paper rounded-full py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
          >
            {creating === 'pay' ? 'Opening your case…' : 'Get my assessment — ₹499'}
          </button>
        </div>
        <div className="border border-ink rounded-lg p-6 bg-ink text-paper">
          <p className="font-display text-lg mb-1">Send the notice, free</p>
          <p className="text-sm text-paper/70 mb-4">
            We draft and send a pre-litigation notice to {data.companyName || 'the company'}. 30 days
            to respond before we talk next steps.
          </p>
          <button
            disabled={creating !== null}
            onClick={() => {
              setCreating('notice')
              ensureCaseFromIntake(data, result)
                .then((c) => navigate(`/notice/${c.id}`))
                .catch(() => alert('Could not reach the case service — please try again.'))
                .finally(() => setCreating(null))
            }}
            className="w-full bg-paper text-ink rounded-full py-2.5 font-medium hover:bg-paper-dim transition-colors disabled:opacity-60"
          >
            {creating === 'notice' ? 'Opening your case…' : 'Draft my notice — free'}
          </button>
        </div>
      </div>

      <p className="text-center mt-10">
        <Link to="/file" className="text-ink-soft hover:text-ink font-medium">
          ← Edit your details
        </Link>
      </p>
    </div>
  )
}

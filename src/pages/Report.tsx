import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCaseView, inr, type CaseView } from '../lib/caseStore'
import { groundListLabel, readGrounds } from '../lib/grounds'
import type { GroundId } from '../lib/types'
import { fetchPrecedents, type PrecedentResult } from '../lib/precedents'

const BAND_LABEL = { strong: 'Strong', moderate: 'Moderate', weak: 'Uncertain' } as const
const BAND_COLOR = { strong: 'text-verdict', moderate: 'text-marigold', weak: 'text-seal' } as const

const BAND_BLURB = {
  strong:
    'Comparable cases succeed more often than not when the evidence profile looks like yours.',
  moderate:
    'Comparable cases succeed when the evidence gaps below are closed before escalation.',
  weak: 'The evidence on file is thin — strengthen it before spending more time or money.',
} as const

export default function Report() {
  const { id } = useParams()
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loading, setLoading] = useState(true)
  const [precedents, setPrecedents] = useState<PrecedentResult[] | null>(null)

  useEffect(() => {
    if (!id) return
    getCaseView(id)
      .then(setRecord)
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [id])

  const grounds = record ? readGrounds(record.intake) : []
  const groundKey = grounds.join(',')
  const hasAiPrecedents = Boolean(record?.assessment?.ai?.precedents?.length)

  // Fallback: raw precedent search when the AI layer didn't rank any.
  useEffect(() => {
    if (!groundKey || hasAiPrecedents) return
    fetchPrecedents(groundListLabel(groundKey.split(',') as GroundId[], false))
      .then(setPrecedents)
      .catch(() => setPrecedents(null))
  }, [groundKey, hasAiPrecedents])

  if (loading) {
    return <p className="text-center text-ink-soft py-24">Loading your assessment…</p>
  }

  if (!record || !record.assessment) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">
          {record ? 'This case doesn’t have an assessment yet.' : 'We couldn’t find that case.'}
        </p>
        <Link to={record ? `/pay/${record.id}` : '/file'} className="text-seal font-medium">
          {record ? 'Get the ₹499 assessment →' : 'Start a new complaint →'}
        </Link>
      </div>
    )
  }

  const a = record.assessment
  const worthPursuing = a.band !== 'weak'

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="case-number text-seal text-sm">RECOVERY ASSESSMENT · CASE {record.id}</p>
        <span className="case-number text-xs text-verdict border border-verdict/40 bg-verdict/10 rounded-full px-3 py-1">
          PAID · {a.receiptId}
        </span>
      </div>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">
        {worthPursuing ? 'Your case is worth pursuing.' : 'Strengthen your case before pursuing it.'}
      </h1>
      <p className="text-ink-soft mb-10">
        Based on comparable {groundListLabel(grounds)} cases at{' '}
        {record.routing.commission === 'district' ? 'District' : record.routing.commission === 'state' ? 'State' : 'the National'}{' '}
        Commission{record.routing.commission !== 'national' && 's'} with similar evidence profiles.
        An estimate, not a promise.
      </p>

      {/* Headline numbers */}
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
          <p className="text-sm text-ink-soft mb-1">Likelihood band</p>
          <p className={`font-display text-3xl font-semibold ${BAND_COLOR[a.band]}`}>{BAND_LABEL[a.band]}</p>
          <p className="text-xs text-ink-soft mt-2">{BAND_BLURB[a.band]}</p>
        </div>
        <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
          <p className="text-sm text-ink-soft mb-1">Realistic recovery range</p>
          <p className="font-display text-2xl font-semibold text-ink mt-1">
            {inr(a.rangeLow)} – {inr(a.rangeHigh)}
          </p>
          <p className="text-xs text-ink-soft mt-2">Refund ± depreciation, plus possible compensation and costs</p>
        </div>
        <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
          <p className="text-sm text-ink-soft mb-1">Typical route to resolution</p>
          <p className="font-display text-2xl font-semibold text-ink mt-1">{a.route}</p>
          <p className="text-xs text-ink-soft mt-2">
            {a.route === 'Notice stage'
              ? 'Most comparable disputes settle before a Commission hearing'
              : 'Close the evidence gaps below, then send the notice'}
          </p>
        </div>
      </div>

      {/* AI narrative */}
      {a.ai && (
        <div className="border border-line rounded-lg bg-white/70 p-7 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-display text-xl text-ink">What this means for your case</h3>
            <span className="case-number text-xs text-ink-soft border border-line rounded-full px-3 py-1">
              AI-ASSISTED SUMMARY
            </span>
          </div>
          {a.ai.narrative.split('\n').filter(Boolean).map((para) => (
            <p key={para.slice(0, 40)} className="text-ink leading-relaxed mb-3 last:mb-0">
              {para}
            </p>
          ))}
          <p className="text-xs text-ink-soft/70 mt-4 pt-3 border-t border-line">
            Written by an AI model around the rules-engine numbers above — it cannot change them.
            Reviewed template, not legal advice.
          </p>
        </div>
      )}

      {/* Drivers */}
      <div className="border border-line rounded-lg bg-white/70 p-7 mb-6">
        <h3 className="font-display text-xl text-ink mb-4">What moves your number</h3>
        <div className="space-y-3">
          {a.drivers.map((d) => (
            <div key={d.text} className="flex gap-3 items-baseline">
              <span
                className={`case-number text-xs shrink-0 rounded-full border px-3 py-1 ${
                  d.kind === 'strong'
                    ? 'text-verdict border-verdict/40 bg-verdict/10'
                    : 'text-marigold border-marigold/40 bg-marigold/10'
                }`}
              >
                {d.kind === 'strong' ? '+ STRONG' : '− WATCH'}
              </span>
              <p className="text-sm text-ink">{d.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Comparable cases */}
      <div className="border border-line rounded-lg bg-white/70 p-7 mb-6">
        <p className="text-sm text-ink-soft mb-1">Included in your assessment</p>
        <h3 className="font-display text-xl text-ink mb-4">Cases decided on similar grounds</h3>

        {hasAiPrecedents ? (
          <ul className="space-y-4">
            {a.ai!.precedents.map((p) => (
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
                <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
                  <b className="text-ink">Why it matters to you:</b> {p.note}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {precedents === null && (
              <p className="text-sm text-ink-soft">Couldn't load comparable cases right now.</p>
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
                {precedents.slice(0, 4).map((p) => (
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
          </>
        )}
        <p className="text-xs text-ink-soft/70 mt-5 pt-4 border-t border-line">
          Retrieved from the e-Jagriti judgment corpus on your statutory grounds — never your
          personal narrative. Only cases clearing a relevance threshold are shown.
          {hasAiPrecedents && ' Relevance notes are AI-generated from the retrieved judgments only.'}{' '}
          For reference, not a guarantee of outcome.
        </p>
      </div>

      {/* Recommended path */}
      <div className="border border-ink rounded-lg bg-ink text-paper p-7">
        <h3 className="font-display text-xl mb-2">Recommended path</h3>
        <p className="text-sm text-paper/75 mb-5">
          {worthPursuing ? (
            <>
              Send the free pre-litigation notice now. Companies rarely let well-documented claims
              reach a Commission. If {record.intake.companyName || 'the company'} doesn't respond in
              30 days, we assemble your filing — your estimated court fee:{' '}
              {record.routing.courtFeeEstimate.toLowerCase().startsWith('nil') ? 'nil' : record.routing.courtFeeEstimate}.
            </>
          ) : (
            <>
              Close the evidence gaps flagged above first — then send the notice. A notice backed by
              thin evidence weakens your position if the dispute escalates.
            </>
          )}
        </p>
        <Link
          to={`/notice/${record.id}`}
          className="inline-block bg-paper text-ink rounded-full px-6 py-2.5 font-medium hover:bg-paper-dim transition-colors"
        >
          Draft my notice — free →
        </Link>
      </div>

      <p className="text-center mt-10">
        <Link to="/cases" className="text-ink-soft hover:text-ink text-sm font-medium">
          Go to my case dashboard →
        </Link>
      </p>
    </div>
  )
}

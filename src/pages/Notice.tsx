import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCaseView,
  sendNotice,
  noticeHeading,
  noticeRef,
  inr,
  fmtDate,
  MILESTONES,
  type CaseView,
} from '../lib/caseStore'
import { groundById } from '../lib/grounds'

function commissionShort(c: CaseView): string {
  const city = c.intake.city ? `, ${c.intake.city}` : ''
  switch (c.routing.commission) {
    case 'district':
      return `District Consumer Disputes Redressal Commission${city}`
    case 'state':
      return `State Consumer Disputes Redressal Commission, ${c.intake.state || 'your state'}`
    default:
      return 'National Consumer Disputes Redressal Commission, New Delhi'
  }
}

export default function Notice() {
  const { id } = useParams()
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!id) return
    getCaseView(id)
      .then(setRecord)
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <p className="text-center text-ink-soft py-24">Loading your case…</p>
  }

  if (!record) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">We couldn't find that case.</p>
        <Link to="/file" className="text-seal font-medium">Start a new complaint →</Link>
      </div>
    )
  }

  const ground = groundById(record.intake.ground)
  const claim = record.intake.claimAmount ?? 0
  const cons = record.intake.consequentialLoss ?? 0
  const sent = Boolean(record.notice)
  const feeIsNil = record.routing.courtFeeEstimate.toLowerCase().startsWith('nil')

  const doSend = () => {
    setSending(true)
    sendNotice(record.id)
      .then((v) => {
        setRecord(v)
        window.scrollTo(0, 0)
      })
      .catch(() => alert('Could not send the notice — please try again.'))
      .finally(() => setSending(false))
  }

  const dueDate = record.notice
    ? fmtDate(new Date(new Date(record.notice.sentAt).getTime() + MILESTONES.windowCloses * 86400000))
    : ''

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      {!sent ? (
        <>
          <p className="case-number text-seal text-sm mb-3">PRE-LITIGATION NOTICE · FREE · CASE {record.id}</p>
          <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">Review your notice before it goes.</h1>
          <p className="text-ink-soft mb-8">
            Drafted from your intake, against a lawyer-approved template. Sent by email and
            registered post — delivery tracked, proof preserved for filing.
          </p>
        </>
      ) : (
        <>
          <p className="case-number text-verdict text-sm mb-3">NOTICE SENT · CASE {record.id}</p>
          <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">The 30-day clock is running.</h1>
          <p className="text-ink-soft mb-8">
            Sent by email and registered post. We'll alert you the moment{' '}
            {record.intake.companyName || 'the company'} responds — or the moment the window closes.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Email</p>
              <p className="font-medium text-verdict">Delivered ✓</p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Registered post</p>
              <p className="font-medium text-ink case-number text-sm">In transit · {record.notice?.postId}</p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Response due</p>
              <p className="font-medium text-ink">{dueDate}</p>
            </div>
          </div>
        </>
      )}

      {/* The notice document */}
      <div className="bg-white border border-line rounded-sm shadow-sm p-8 md:p-12 font-display text-ink leading-relaxed">
        <div className="flex justify-between items-start case-number text-xs text-ink-soft font-body">
          <p>{noticeRef(record.id)}</p>
          <p>{fmtDate(record.notice?.sentAt ?? new Date())}</p>
        </div>
        <h3 className="text-center font-semibold text-lg mt-6 mb-1 tracking-wide">
          {noticeHeading(record.intake.ground)}
        </h3>
        <p className="text-center text-sm text-ink-soft">
          Under the Consumer Protection Act, 2019 — prior to institution of complaint
        </p>

        <p className="mt-8">
          <b>To:</b>
          <br />
          The Managing Director,
          <br />
          {record.intake.companyName || '[Company name]'},
          <br />
          {record.intake.companyAddress || '[Registered address]'}
        </p>
        <p className="mt-4">
          <b>From:</b>
          <br />
          {record.intake.fullName || '[Your name]'}
          {record.intake.city && `, ${record.intake.city}`}
          {record.intake.state && `, ${record.intake.state}`}
          <br />
          (through Consumer X, correspondence address for service)
        </p>

        <p className="mt-6"><b>Madam/Sir,</b></p>
        <p className="mt-4 pl-6 -indent-6">
          1.&emsp;My client entered into a transaction with you
          {record.intake.transactionDate && ` on or about ${fmtDate(record.intake.transactionDate)}`} for a
          consideration of {inr(claim)}. The facts of the grievance are as follows:{' '}
          <span className="italic">{record.intake.narrative || '[narrative from intake]'}</span>
        </p>
        <p className="mt-4 pl-6 -indent-6">
          2.&emsp;Despite the above being brought to your attention, no adequate remedy has been
          provided{record.intake.incidentDate && ` since ${fmtDate(record.intake.incidentDate)}`}.
        </p>
        <p className="mt-4 pl-6 -indent-6">
          3.&emsp;The above constitutes a ground of complaint within the meaning of{' '}
          {ground?.section ?? 'Section 2(6)'} ({ground?.label.toLowerCase()}) of the Consumer
          Protection Act, 2019.
        </p>
        <p className="mt-4 pl-6 -indent-6">
          4.&emsp;My client hereby calls upon you, <b>within 30 days of receipt of this notice</b>,
          to refund the consideration of {inr(claim)}
          {cons > 0 && (
            <> together with {inr(cons)} incurred in consequential losses</>
          )}
          , failing which my client will institute a complaint before the {commissionShort(record)}
          {feeIsNil && <> — where, you may note, claims of this value attract no court fee</>} —
          seeking refund, compensation for deficiency and harassment, and costs.
        </p>
        <p className="mt-4 pl-6 -indent-6">
          5.&emsp;This notice is issued without prejudice to all other rights and remedies available
          to my client, which are expressly reserved.
        </p>

        <p className="mt-8">
          Yours faithfully,
          <br />
          <br />
          <span className="italic">for the Complainant</span>
          <br />
          Consumer X · grievance@consumerx.in
        </p>
      </div>

      {/* Controls */}
      {!sent ? (
        <div className="flex gap-4 justify-center mt-8 flex-wrap">
          <Link
            to="/file"
            className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
          >
            Edit details
          </Link>
          <button
            onClick={doSend}
            disabled={sending}
            className="bg-seal text-paper rounded-full px-6 py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
          >
            {sending ? 'Sending…' : 'Send my notice — free'}
          </button>
        </div>
      ) : (
        <div className="flex justify-center mt-8">
          <Link
            to={`/case/${record.id}`}
            className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors"
          >
            Go to my case dashboard →
          </Link>
        </div>
      )}

      <p className="case-number text-xs text-ink-soft/60 text-center mt-10">
        Demo build — dispatch is simulated; no notice actually leaves the building. In production
        every notice is human-reviewed before it goes.
      </p>
    </div>
  )
}

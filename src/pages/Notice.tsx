import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCaseView,
  recordNoticeDispatch,
  saveNoticeDraft,
  fmtDate,
  MILESTONES,
  DISPATCH_LABELS,
  type CaseView,
  type DispatchMethod,
} from '../lib/caseStore'
import {
  buildNotice,
  buildEmailDraft,
  noticeToText,
  outstandingPlaceholders,
  COMPLIANCE_DAYS,
  type NoticeBlock,
} from '../lib/noticeDraft'
import { downloadNoticeDocx, noticeFilename } from '../lib/noticeDocx'
import { useAuth } from '../lib/AuthContext'
import { claimLocalCases } from '../lib/auth'

/* -------------------------------------------------------------------------- */
/* Block rendering                                                            */
/* -------------------------------------------------------------------------- */

const BLOCK_CLASS: Record<NoticeBlock['kind'], string> = {
  ref: 'case-number text-xs text-ink-soft flex justify-between',
  mode: 'text-xs font-semibold tracking-wide text-ink mt-4',
  address: 'mt-6 whitespace-pre-line',
  marking: 'text-center font-semibold mt-8 tracking-wide',
  title: 'text-center font-semibold text-lg mt-2 mb-6 underline underline-offset-4 tracking-wide',
  subject: 'mt-2 text-justify',
  salutation: 'mt-6 font-semibold',
  para: 'mt-4 pl-6 -indent-6 text-justify',
  sub: 'mt-3 ml-6 pl-8 -indent-8 text-justify',
  signature: 'mt-10 whitespace-pre-line',
  'annexure-title': 'mt-10 font-semibold tracking-wide',
  annexure: 'mt-2 pl-6 -indent-6',
}

/**
 * Highlights anything still bracketed so the user can see what needs them.
 * Must stay in step with PLACEHOLDER in noticeDraft.ts, or the count in the
 * banner and the highlighting in the document disagree.
 */
function withPlaceholders(text: string) {
  const parts = text.split(/(\[[^\]\n]{2,}\])/g)
  return parts.map((part, i) =>
    /^\[.+\]$/.test(part) ? (
      <mark key={i} className="bg-marigold/25 text-ink rounded px-1 not-italic">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/* -------------------------------------------------------------------------- */

export default function Notice() {
  const { id } = useParams()
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [copied, setCopied] = useState<'text' | 'body' | null>(null)
  const [methods, setMethods] = useState<DispatchMethod[]>([])
  const [postId, setPostId] = useState('')
  const [recording, setRecording] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { user, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!id) return
    getCaseView(id)
      .then((v) => {
        setRecord(v)
        setEdits(v.noticeDraft?.edits ?? {})
      })
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [id])

  const doc = useMemo(() => (record ? buildNotice(record, edits) : null), [record, edits])
  const sent = Boolean(record?.notice)

  /** Debounced autosave — a legal draft should never be lost to a stray reload. */
  const editBlock = (blockId: string, text: string) => {
    const next = { ...edits, [blockId]: text }
    setEdits(next)
    setSaveState('saving')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (!record) return
      saveNoticeDraft(record.id, next)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'))
    }, 700)
  }

  const copy = (text: string, which: 'text' | 'body') => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(which)
        setTimeout(() => setCopied(null), 2000)
      })
      .catch(() => setSaveState('error'))
  }

  const toggleMethod = (m: DispatchMethod) =>
    setMethods((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))

  const confirmDispatch = () => {
    if (!record || methods.length === 0) return
    setRecording(true)
    recordNoticeDispatch(record.id, methods, postId)
      .then(async (v) => {
        // If they signed up at this step, make sure the case is on the account
        // before we send them to the dashboard.
        if (user) await claimLocalCases()
        setRecord(v)
        window.scrollTo(0, 0)
      })
      .catch((e: Error) => alert(e.message))
      .finally(() => setRecording(false))
  }

  if (loading) return <p className="text-center text-ink-soft py-24">Loading your case…</p>

  if (!record || !doc) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">We couldn't find that case.</p>
        <Link to="/file" className="text-seal font-medium">
          Start a new complaint →
        </Link>
      </div>
    )
  }

  const email = buildEmailDraft(record, doc)
  const gaps = outstandingPlaceholders(doc)
  const dueDate = record.notice
    ? fmtDate(new Date(new Date(record.notice.sentAt).getTime() + MILESTONES.windowCloses * 86400000))
    : ''

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      {/* ---------------------------------------------------------------- */}
      {/* Header                                                            */}
      {/* ---------------------------------------------------------------- */}
      {!sent ? (
        <>
          <p className="case-number text-seal text-sm mb-3">
            PRE-LITIGATION NOTICE · FREE · CASE {record.id}
          </p>
          <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">
            Your notice, ready to edit and send.
          </h1>
          <p className="text-ink-soft mb-6">
            Drafted from your intake against a standard Consumer Protection Act, 2019 notice.
            Click any paragraph to rewrite it. When it reads the way you want, download the Word
            file and send it yourself — from your own email address, and by Registered Post with
            A.D.
          </p>
          <div className="border border-line border-l-4 border-l-marigold rounded-lg bg-white/70 p-5 mb-8">
            <p className="text-sm text-ink font-medium mb-1">Consumer X does not send this for you.</p>
            <p className="text-sm text-ink-soft leading-relaxed">
              A notice carries more weight when it comes from you, and service by Registered Post
              with A.D. is what proves delivery if you later file. We give you the document and a
              prefilled email; you send it and tell us when it's gone.
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="case-number text-verdict text-sm mb-3">NOTICE DISPATCHED · CASE {record.id}</p>
          <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">
            The {COMPLIANCE_DAYS}-day clock is running.
          </h1>
          <p className="text-ink-soft mb-8">
            Recorded as dispatched on {fmtDate(record.notice!.sentAt)}. Keep your postal receipt and
            the A.D. card — they are your proof of service.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Sent by</p>
              <p className="font-medium text-ink text-sm">
                {/* Notices recorded before dispatch methods existed have none. */}
                {(record.notice!.methods ?? []).map((m) => DISPATCH_LABELS[m]).join(' · ') ||
                  'Not recorded'}
              </p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Tracking</p>
              <p className="font-medium text-ink case-number text-sm">
                {record.notice!.postId ?? '—'}
              </p>
            </div>
            <div className="border border-line rounded-lg bg-white/70 p-5 text-center">
              <p className="text-sm text-ink-soft mb-1">Response due</p>
              <p className="font-medium text-ink">{dueDate}</p>
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Outstanding placeholders                                          */}
      {/* ---------------------------------------------------------------- */}
      {!sent && gaps.length > 0 && (
        <div className="border border-seal/40 bg-seal/5 rounded-lg p-5 mb-6">
          <p className="text-sm font-medium text-ink mb-1">
            {gaps.length} {gaps.length === 1 ? 'detail' : 'details'} still to fill in
          </p>
          <p className="text-sm text-ink-soft">
            Anything highlighted in the draft below is a placeholder we couldn't fill from your
            intake — an invoice number, the exact goods, what you were promised. Click the
            paragraph to replace it. A notice that recites specifics is far harder to ignore.
          </p>
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The document                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-white border border-line rounded-sm shadow-sm p-8 md:p-12 font-display text-ink leading-relaxed">
        {doc.blocks.map((b) => {
          const isEditing = editingId === b.id
          const editable = !sent && b.kind !== 'ref' && b.kind !== 'marking'

          if (isEditing) {
            return (
              <div key={b.id} className="my-4">
                {b.hint && (
                  <p className="font-body text-xs text-ink-soft mb-2 leading-relaxed">{b.hint}</p>
                )}
                <textarea
                  autoFocus
                  value={b.text}
                  onChange={(e) => editBlock(b.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  rows={Math.max(3, Math.ceil(b.text.length / 70) + b.text.split('\n').length)}
                  className="font-body w-full border border-ink rounded-md p-3 text-sm text-ink bg-paper focus:outline-none focus:ring-2 focus:ring-ink/30"
                />
                <div className="flex justify-between items-center mt-1.5">
                  <span className="font-body text-xs text-ink-soft">
                    {saveState === 'saving' && 'Saving…'}
                    {saveState === 'saved' && 'Saved'}
                    {saveState === 'error' && 'Could not save — your text is still here'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="font-body text-xs text-seal font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )
          }

          return (
            <p
              key={b.id}
              onClick={() => editable && setEditingId(b.id)}
              className={`${BLOCK_CLASS[b.kind]} ${
                editable ? 'cursor-text hover:bg-marigold/5 rounded transition-colors' : ''
              }`}
              title={editable ? 'Click to edit' : undefined}
            >
              {b.label && <b className="mr-2">{b.label}</b>}
              {withPlaceholders(b.text)}
            </p>
          )
        })}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Dispatch kit                                                      */}
      {/* ---------------------------------------------------------------- */}
      {!sent && (
        <>
          <div className="border border-line rounded-lg bg-white/70 p-7 mt-8">
            <h2 className="font-display text-xl text-ink mb-1">1 · Take the document</h2>
            <p className="text-sm text-ink-soft mb-5">
              A Word file you can edit further, print, sign and attach. Attach your annexures to
              the email and enclose copies with the posted version.
            </p>
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => downloadNoticeDocx(doc)}
                className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors"
              >
                Download {noticeFilename(doc)}
              </button>
              <button
                type="button"
                onClick={() => copy(noticeToText(doc), 'text')}
                className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
              >
                {copied === 'text' ? 'Copied ✓' : 'Copy as plain text'}
              </button>
            </div>
          </div>

          <div className="border border-line rounded-lg bg-white/70 p-7 mt-6">
            <h2 className="font-display text-xl text-ink mb-1">2 · Send the email yourself</h2>
            <p className="text-sm text-ink-soft mb-5">
              {doc.recipientEmail
                ? 'Opens your own mail client with everything filled in. Attach the Word file before you send.'
                : 'We don’t have a grievance email for this company yet — add one in your case details, or copy the draft below into your mail client.'}
            </p>

            <div className="border border-line rounded-md bg-paper divide-y divide-line text-sm">
              <div className="px-4 py-2.5 flex gap-3">
                <span className="text-ink-soft w-16 shrink-0">To</span>
                <span className="text-ink break-all">
                  {doc.recipientEmail ?? <span className="text-ink-soft italic">not set</span>}
                </span>
              </div>
              <div className="px-4 py-2.5 flex gap-3">
                <span className="text-ink-soft w-16 shrink-0">Subject</span>
                <span className="text-ink">{email.subject}</span>
              </div>
              <div className="px-4 py-2.5 flex gap-3">
                <span className="text-ink-soft w-16 shrink-0">Body</span>
                <pre className="text-ink whitespace-pre-wrap font-body max-h-52 overflow-y-auto leading-relaxed">
                  {email.body}
                </pre>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap mt-5">
              <a
                href={email.mailto}
                className={`rounded-full px-6 py-2.5 font-medium transition-colors ${
                  doc.recipientEmail
                    ? 'bg-ink text-paper hover:bg-seal'
                    : 'bg-line text-ink-soft pointer-events-none'
                }`}
              >
                Open in my email app
              </a>
              <button
                type="button"
                onClick={() => copy(email.body, 'body')}
                className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
              >
                {copied === 'body' ? 'Copied ✓' : 'Copy email text'}
              </button>
            </div>
          </div>

          <div className="border border-line rounded-lg bg-white/70 p-7 mt-6">
            <h2 className="font-display text-xl text-ink mb-1">3 · Tell us when it's gone</h2>
            <p className="text-sm text-ink-soft mb-5">
              This starts your {COMPLIANCE_DAYS}-day clock and unlocks case tracking. Only confirm
              once you have actually sent it.
            </p>

            {/* The one point in the flow where an account earns its keep: from
                here on there is a live clock and a case worth coming back to. */}
            {!authLoading && !user && (
              <div className="border border-ink/20 bg-ink/[0.03] rounded-lg p-5 mb-6">
                <p className="font-display text-lg text-ink mb-1">
                  Sign up to keep this case on your dashboard
                </p>
                <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                  You filed without an account, which is fine — but once the clock starts, this
                  case only lives in this browser. Add an email and it follows you to any device,
                  and we can tell you when the {COMPLIANCE_DAYS} days are up.
                </p>
                <div className="flex gap-3 flex-wrap items-center">
                  <Link
                    to={`/signin?next=${encodeURIComponent(`/notice/${record.id}`)}`}
                    className="bg-ink text-paper rounded-full px-5 py-2.5 text-sm font-medium hover:bg-seal transition-colors"
                  >
                    Sign up with email
                  </Link>
                  <span className="text-xs text-ink-soft">
                    No password. You can also skip this and continue.
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap mb-5">
              {(Object.keys(DISPATCH_LABELS) as DispatchMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMethod(m)}
                  className={`rounded-full px-4 py-2 text-sm border transition-colors ${
                    methods.includes(m)
                      ? 'border-ink bg-ink text-paper'
                      : 'border-line text-ink-soft hover:text-ink'
                  }`}
                >
                  {methods.includes(m) ? '✓ ' : ''}
                  {DISPATCH_LABELS[m]}
                </button>
              ))}
            </div>

            {methods.includes('registered_post') && (
              <div className="mb-5">
                <label className="block text-sm font-medium text-ink mb-1.5">
                  Registered post tracking number
                </label>
                <input
                  value={postId}
                  onChange={(e) => setPostId(e.target.value)}
                  placeholder="e.g. RN123456789IN"
                  className="w-full sm:w-72 border border-line rounded-md px-4 py-2.5 bg-white text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-ink/40"
                />
                <p className="text-xs text-ink-soft mt-1">
                  From your postal receipt. Keep the receipt and the A.D. card — they prove service.
                </p>
              </div>
            )}

            <div className="flex gap-4 flex-wrap items-center">
              <Link
                to="/file"
                className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
              >
                Edit case details
              </Link>
              <button
                type="button"
                onClick={confirmDispatch}
                disabled={recording || methods.length === 0}
                className="bg-seal text-paper rounded-full px-6 py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {recording ? 'Recording…' : "I've sent it — start the clock"}
              </button>
            </div>
          </div>
        </>
      )}

      {sent && (
        <div className="flex justify-center gap-3 mt-8 flex-wrap">
          <button
            type="button"
            onClick={() => downloadNoticeDocx(doc)}
            className="border border-line text-ink-soft hover:text-ink rounded-full px-6 py-2.5 font-medium transition-colors"
          >
            Download a copy
          </button>
          <Link
            to={`/case/${record.id}`}
            className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors"
          >
            Go to my case dashboard →
          </Link>
        </div>
      )}

      <p className="case-number text-xs text-ink-soft/60 text-center mt-10 leading-relaxed">
        This is a document-generation tool, not legal advice, and Consumer X is not your advocate.
        Review the notice before you send it — and consider having an advocate settle it where the
        claim is substantial.
      </p>
    </div>
  )
}

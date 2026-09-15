import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  getCaseView,
  recordNoticeDispatch,
  saveNoticeDraft,
  saveIntakeGaps,
  aiFillNotice,
  aiRewordNotice,
  getApiHealth,
  fmtDate,
  MILESTONES,
  DISPATCH_LABELS,
  type CaseView,
  type DispatchMethod,
  type NoticeFillSuggestion,
} from '../lib/caseStore'
import {
  buildNotice,
  buildEmailDraft,
  noticeToText,
  outstandingPlaceholders,
  COMPLIANCE_DAYS,
  type NoticeBlock,
} from '../lib/noticeDraft'
import { pendingGaps, type GapQuestion } from '../lib/noticeGaps'
import type { IntakeData } from '../lib/types'
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
  dispatch: 'mt-10 pt-4 border-t border-line text-sm text-ink-soft italic text-justify',
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

  // Post-intake pop-up: the notice-specifics the intake form doesn't ask for.
  const [gapOpen, setGapOpen] = useState(false)
  const [gapDraft, setGapDraft] = useState<Record<string, string>>({})
  const [savingGaps, setSavingGaps] = useState(false)
  const [gapError, setGapError] = useState<string | null>(null)
  const [gapDismissed, setGapDismissed] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { user, loading: authLoading } = useAuth()

  // AI drafting assistance (only shown when the server has a model configured).
  const [aiEnabled, setAiEnabled] = useState(false)
  const [filling, setFilling] = useState(false)
  const [fillSuggestions, setFillSuggestions] = useState<NoticeFillSuggestion[] | null>(null)
  const [fillError, setFillError] = useState<string | null>(null)
  // Reword, scoped to the block currently being edited.
  const editRef = useRef<HTMLTextAreaElement | null>(null)
  const [rewording, setRewording] = useState(false)
  const [rewordVariants, setRewordVariants] = useState<string[] | null>(null)
  const [rewordRange, setRewordRange] = useState<{ start: number; end: number } | null>(null)
  const [rewordError, setRewordError] = useState<string | null>(null)

  useEffect(() => {
    getApiHealth()
      .then((h) => setAiEnabled(Boolean(h.ai)))
      .catch(() => setAiEnabled(false))
  }, [])

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

  // Details the notice can still use that intake didn't capture, for this case.
  const gapQuestions = useMemo<GapQuestion[]>(
    () => (record && !sent ? pendingGaps(record.intake) : []),
    [record, sent],
  )
  const requiredGaps = gapQuestions.filter((q) => !q.optional)

  // Open the pop-up automatically the first time a draft has required gaps, so
  // the specifics are gathered before the user reads a vaguer draft. Skipping it
  // is always allowed — the draft renders every field gracefully when blank.
  useEffect(() => {
    if (!sent && !gapDismissed && requiredGaps.length > 0) setGapOpen(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id, sent, gapDismissed, requiredGaps.length])

  const saveGaps = () => {
    if (!record) return
    const patch: Partial<IntakeData> = {}
    for (const q of gapQuestions) {
      const v = (gapDraft[q.field] ?? '').trim()
      if (v) (patch as Record<string, string>)[q.field] = v
    }
    setSavingGaps(true)
    setGapError(null)
    saveIntakeGaps(record.id, patch)
      .then((v) => {
        setRecord(v)
        setGapOpen(false)
        setGapDraft({})
      })
      .catch((e: Error) => setGapError(e.message))
      .finally(() => setSavingGaps(false))
  }

  const skipGaps = () => {
    setGapDismissed(true)
    setGapOpen(false)
  }

  // A reword suggestion belongs to one block; drop it when the user moves on.
  useEffect(() => {
    setRewordVariants(null)
    setRewordRange(null)
    setRewordError(null)
  }, [editingId])

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

  /** Deleting a block just clears its text — buildNotice then omits it and renumbers. */
  const deleteBlock = (blockId: string) => {
    editBlock(blockId, '')
    setEditingId(null)
  }

  /** Safety net: throw away every edit and rebuild the notice from intake. */
  const resetDraft = () => {
    if (!record) return
    if (!window.confirm('Discard all your edits and restore the original draft?')) return
    setEdits({})
    setEditingId(null)
    setSaveState('saving')
    saveNoticeDraft(record.id, {})
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'))
  }

  /* --- AI: fill the bracketed gaps from the client's own inputs ----------- */

  const runAiFill = () => {
    if (!record || !doc) return
    // Send only the editable, still-incomplete blocks; the address/signature
    // carry gaps (office address, contact) the AI can partly ground from intake.
    const blocks = doc.blocks
      .filter((b) => b.needsInput && b.kind !== 'ref' && b.kind !== 'marking')
      .map((b) => ({ id: b.id, text: b.text, hint: b.hint }))
    if (blocks.length === 0) return
    setFilling(true)
    setFillError(null)
    setFillSuggestions(null)
    aiFillNotice(record.id, blocks)
      .then((r) => {
        if (r.aiDisabled) {
          setAiEnabled(false)
          return
        }
        setFillSuggestions(r.suggestions)
      })
      .catch((e: Error) => setFillError(e.message))
      .finally(() => setFilling(false))
  }

  const acceptFill = (s: NoticeFillSuggestion) => {
    editBlock(s.id, s.text)
    setFillSuggestions((prev) => prev?.filter((x) => x.id !== s.id) ?? null)
  }

  const acceptAllFills = () => {
    if (!record || !fillSuggestions) return
    const next = { ...edits }
    for (const s of fillSuggestions) next[s.id] = s.text
    setEdits(next)
    setSaveState('saving')
    saveNoticeDraft(record.id, next)
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'))
    setFillSuggestions(null)
  }

  /* --- AI: reword the current selection (or whole block) ------------------- */

  const runReword = (block: NoticeBlock) => {
    if (!record) return
    const el = editRef.current
    const start = el ? el.selectionStart : 0
    const end = el ? el.selectionEnd : block.text.length
    const hasSelection = end > start
    const range = hasSelection ? { start, end } : { start: 0, end: block.text.length }
    const passage = block.text.slice(range.start, range.end)
    if (!passage.trim()) return
    setRewordRange(range)
    setRewordVariants(null)
    setRewordError(null)
    setRewording(true)
    aiRewordNotice(record.id, passage)
      .then((r) => {
        if (r.aiDisabled) {
          setAiEnabled(false)
          return
        }
        if (r.variants.length === 0) {
          setRewordError('No alternative wording came back — try selecting a full sentence.')
          return
        }
        setRewordVariants(r.variants)
      })
      .catch((e: Error) => setRewordError(e.message))
      .finally(() => setRewording(false))
  }

  const acceptReword = (block: NoticeBlock, variant: string) => {
    const r = rewordRange ?? { start: 0, end: block.text.length }
    const next = block.text.slice(0, r.start) + variant + block.text.slice(r.end)
    editBlock(block.id, next)
    setRewordVariants(null)
    setRewordRange(null)
  }

  const dismissReword = () => {
    setRewordVariants(null)
    setRewordRange(null)
    setRewordError(null)
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

  const email = buildEmailDraft(record, doc, methods)
  const gaps = outstandingPlaceholders(doc)
  const dueDate = record.notice
    ? fmtDate(new Date(new Date(record.notice.sentAt).getTime() + MILESTONES.windowCloses * 86400000))
    : ''

  const gapReady = requiredGaps.every((q) => (gapDraft[q.field] ?? '').trim() !== '')

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      {/* ---------------------------------------------------------------- */}
      {/* Post-intake specifics pop-up                                      */}
      {/* ---------------------------------------------------------------- */}
      {!sent && gapOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-ink/40 p-4 overflow-y-auto">
          <div className="bg-paper rounded-xl border border-line shadow-xl max-w-lg w-full my-8">
            <div className="p-6 md:p-8">
              <p className="case-number text-seal text-xs mb-2">A FEW SPECIFICS</p>
              <h2 className="font-display text-2xl text-ink mb-2">Let's make your notice specific</h2>
              <p className="text-ink-soft text-sm mb-6 leading-relaxed">
                A notice that names the exact goods, the invoice and what you were promised is far
                harder to ignore. These go straight into your draft, and you can edit anything
                afterwards.
              </p>
              <div className="space-y-5">
                {gapQuestions.map((q) => {
                  const value = gapDraft[q.field] ?? ''
                  const set = (v: string) => setGapDraft((prev) => ({ ...prev, [q.field]: v }))
                  return (
                    <div key={`${String(q.field)}-${q.label}`}>
                      <label className="block text-sm font-medium text-ink mb-1.5">
                        {q.label}
                        {q.optional && <span className="text-ink-soft font-normal"> (optional)</span>}
                      </label>
                      {q.kind === 'select' ? (
                        <select
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          className="w-full border border-line rounded-md px-4 py-2.5 bg-white text-ink focus:outline-none focus:ring-2 focus:ring-ink/40"
                        >
                          <option value="">Select…</option>
                          {q.options?.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : q.kind === 'textarea' ? (
                        <textarea
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          rows={3}
                          placeholder={q.placeholder}
                          className="w-full border border-line rounded-md px-4 py-2.5 bg-white text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-ink/40"
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          placeholder={q.placeholder}
                          className="w-full border border-line rounded-md px-4 py-2.5 bg-white text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-ink/40"
                        />
                      )}
                      {q.help && <p className="text-xs text-ink-soft mt-1 leading-relaxed">{q.help}</p>}
                    </div>
                  )
                })}
              </div>
              {gapError && <p className="text-sm text-seal mt-4">{gapError}</p>}
              <div className="flex gap-4 flex-wrap items-center mt-7">
                <button
                  type="button"
                  onClick={saveGaps}
                  disabled={savingGaps || !gapReady}
                  className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {savingGaps ? 'Saving…' : 'Add to my notice'}
                </button>
                <button
                  type="button"
                  onClick={skipGaps}
                  className="text-sm text-ink-soft hover:text-ink transition-colors"
                >
                  Skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            Click any paragraph to rewrite it in your own words — or delete it entirely. When it
            reads the way you want, download the Word file and send it yourself — from your own
            email address, and by Registered Post with A.D.
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
      {/* Reopen the specifics pop-up                                        */}
      {/* ---------------------------------------------------------------- */}
      {!sent && !gapOpen && gapQuestions.length > 0 && (
        <div className="border border-seal/40 bg-seal/5 rounded-lg p-5 mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-medium text-ink mb-1">Make this notice more specific</p>
            <p className="text-sm text-ink-soft">
              {gapQuestions.length === 1
                ? 'There is 1 detail'
                : `There are ${gapQuestions.length} details`}{' '}
              we can still add — the exact goods, the invoice, what you were promised. A notice that
              recites specifics is far harder to ignore.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGapOpen(true)}
            className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors shrink-0"
          >
            Add details
          </button>
        </div>
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
          {aiEnabled && (
            <div className="mt-4">
              <button
                type="button"
                onClick={runAiFill}
                disabled={filling}
                className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors disabled:opacity-40"
              >
                {filling ? 'Drafting from your intake…' : '✨ Let AI fill the blanks from my details'}
              </button>
              <p className="text-xs text-ink-soft mt-2">
                The AI only draws on the details you entered — it won't invent an invoice number or
                a figure. Every suggestion is yours to accept or ignore.
              </p>
              {fillError && <p className="text-xs text-seal mt-2">{fillError}</p>}
            </div>
          )}
        </div>
      )}

      {/* AI fill suggestions — review and accept, one at a time or all at once. */}
      {!sent && fillSuggestions && (
        <div className="border border-ink/20 bg-white/70 rounded-lg p-5 mb-6">
          {fillSuggestions.length === 0 ? (
            <p className="text-sm text-ink-soft">
              The AI couldn't add anything it could ground in your details — those blanks need a
              specific only you have. Click a highlighted paragraph to fill it in yourself.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <p className="text-sm font-medium text-ink">
                  {fillSuggestions.length} suggested{' '}
                  {fillSuggestions.length === 1 ? 'fill' : 'fills'} — review before you accept
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={acceptAllFills}
                    className="bg-ink text-paper rounded-full px-4 py-1.5 text-xs font-medium hover:bg-seal transition-colors"
                  >
                    Accept all
                  </button>
                  <button
                    type="button"
                    onClick={() => setFillSuggestions(null)}
                    className="text-xs text-ink-soft hover:text-ink"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {fillSuggestions.map((s) => (
                  <div key={s.id} className="border border-line rounded-md bg-paper p-3">
                    <p className="text-sm text-ink leading-relaxed mb-2">
                      {withPlaceholders(s.text)}
                    </p>
                    <button
                      type="button"
                      onClick={() => acceptFill(s)}
                      className="font-body text-xs bg-ink text-paper rounded-full px-4 py-1.5 font-medium hover:bg-seal transition-colors"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* The document                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="bg-white border border-line rounded-sm shadow-sm p-8 md:p-12 font-display text-ink leading-relaxed">
        {doc.blocks.map((b) => {
          const isEditing = editingId === b.id
          const editable =
            !sent && b.kind !== 'ref' && b.kind !== 'marking' && b.kind !== 'dispatch'

          if (isEditing) {
            return (
              <div key={b.id} className="my-4">
                {b.hint && (
                  <p className="font-body text-xs text-ink-soft mb-2 leading-relaxed">{b.hint}</p>
                )}
                <textarea
                  ref={editRef}
                  autoFocus
                  value={b.text}
                  onChange={(e) => editBlock(b.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  rows={Math.max(3, Math.ceil(b.text.length / 70) + b.text.split('\n').length)}
                  className="font-body w-full border border-ink rounded-md p-3 text-sm text-ink bg-paper focus:outline-none focus:ring-2 focus:ring-ink/30"
                />
                <div className="flex justify-between items-center mt-1.5 gap-3 flex-wrap">
                  <span className="font-body text-xs text-ink-soft">
                    {rewording
                      ? 'Rewording…'
                      : saveState === 'saving'
                        ? 'Saving…'
                        : saveState === 'saved'
                          ? 'Saved'
                          : saveState === 'error'
                            ? 'Could not save — your text is still here'
                            : ''}
                  </span>
                  <div className="flex items-center gap-4">
                    {aiEnabled && (
                      // preventDefault on mousedown keeps the textarea focused so
                      // its selection survives the click and we can reword it.
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => runReword(b)}
                        disabled={rewording}
                        className="font-body text-xs text-seal font-medium hover:underline disabled:opacity-40"
                      >
                        ✨ Reword with AI
                      </button>
                    )}
                    {(b.kind === 'para' ||
                      b.kind === 'sub' ||
                      b.kind === 'subject' ||
                      b.kind === 'annexure') && (
                      <button
                        type="button"
                        onClick={() => deleteBlock(b.id)}
                        className="font-body text-xs text-seal font-medium hover:underline"
                      >
                        Delete paragraph
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="font-body text-xs text-ink font-medium"
                    >
                      Done
                    </button>
                  </div>
                </div>

                {aiEnabled && (rewordError || rewordVariants) && (
                  <div className="mt-3 border border-seal/40 bg-seal/5 rounded-md p-4">
                    {rewordError ? (
                      <p className="font-body text-xs text-ink-soft">{rewordError}</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2 gap-3">
                          <p className="font-body text-xs font-medium text-ink">
                            Suggested rewording — accept to replace, or ignore
                          </p>
                          <button
                            type="button"
                            onClick={dismissReword}
                            className="font-body text-xs text-ink-soft hover:text-ink shrink-0"
                          >
                            Dismiss
                          </button>
                        </div>
                        <div className="space-y-2">
                          {rewordVariants?.map((v, i) => (
                            <div
                              key={i}
                              className="border border-line rounded-md bg-paper p-3 flex flex-col gap-2"
                            >
                              <p className="font-body text-sm text-ink leading-relaxed">{v}</p>
                              <button
                                type="button"
                                onClick={() => acceptReword(b, v)}
                                className="self-start font-body text-xs bg-ink text-paper rounded-full px-4 py-1.5 font-medium hover:bg-seal transition-colors"
                              >
                                Accept this wording
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
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

      {!sent && Object.keys(edits).length > 0 && (
        <div className="text-right mt-3">
          <button
            type="button"
            onClick={resetDraft}
            className="text-xs text-ink-soft hover:text-seal transition-colors"
          >
            Reset the notice to the original draft
          </button>
        </div>
      )}

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

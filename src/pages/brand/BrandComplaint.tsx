import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBrand } from './BrandShell'
import { StatusChip } from './BrandQueue'
import {
  ago,
  draftResponse,
  loadComplaint,
  OFFER_LABEL,
  reanalyse,
  respond,
  rupees,
  setStatus,
  SOURCE_LABEL,
  type ActionOption,
  type Complaint,
  type ComplaintAnalysis,
  type OfferKind,
  type Outcome,
  type ThreadEntry,
} from '../../lib/brandApi'
import { groundsByIds } from '../../lib/grounds'

export default function BrandComplaint() {
  const { id = '' } = useParams()
  const { brand } = useBrand()
  const [c, setC] = useState<Complaint | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    loadComplaint(brand.id, id)
      .then(setC)
      .catch((e: Error) => setError(e.message))
  }, [brand.id, id])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  // Analysis of email/web complaints runs in the background — poll until it lands.
  useEffect(() => {
    if (!c || c.analysis) return
    const t = setTimeout(load, 2_500)
    return () => clearTimeout(t)
  }, [c, load])

  // Composer state lives here so the action list can fill it.
  const [text, setText] = useState('')
  const [offerKind, setOfferKind] = useState<OfferKind | ''>('')
  const [offerValue, setOfferValue] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)

  const choose = (a: ActionOption) => {
    setChosen(a.id)
    draftResponse(brand.id, id, a.id)
      .then((d) => {
        setText(d.text)
        setOfferKind(d.offer?.kind ?? '')
        setOfferValue(d.offer?.value ? String(d.offer.value) : '')
        document.getElementById('composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      .catch((e: Error) => setError(e.message))
  }

  const send = () => {
    setBusy(true)
    respond(brand.id, id, text, offerKind ? { kind: offerKind, value: Number(offerValue) || 0 } : null)
      .then((u) => {
        setC(u)
        setText('')
        setOfferKind('')
        setOfferValue('')
        setChosen(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const changeStatus = (s: 'resolved' | 'closed' | 'new') => {
    setBusy(true)
    setStatus(brand.id, id, s)
      .then(setC)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const rerun = () => {
    setBusy(true)
    reanalyse(brand.id, id)
      .then(setC)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  if (error && !c) return <p className="text-center text-seal py-24">{error}</p>
  if (!c) return <p className="text-center text-ink-soft py-24">Loading…</p>

  const a = c.analysis
  const closed = c.status === 'resolved' || c.status === 'closed'
  const mailto = c.consumerEmail
    ? `mailto:${c.consumerEmail}?subject=${encodeURIComponent(`Re: ${c.subject || 'Your complaint'} [${c.id}]`)}&body=${encodeURIComponent(text)}`
    : null

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">
      <Link to="/brand" className="text-sm text-ink-soft hover:text-ink">
        ← All complaints
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mt-3 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="case-number text-xs text-ink-soft">{c.id}</span>
            <StatusChip status={c.status} />
            {a && <PriorityChip p={a.priority} />}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-ink mt-1">{c.subject || 'Complaint'}</h1>
          <p className="text-sm text-ink-soft mt-1">
            {c.consumerName || 'Unknown consumer'}
            {c.consumerEmail && ` · ${c.consumerEmail}`} · via {SOURCE_LABEL[c.source]} · received {ago(c.receivedAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!closed ? (
            <>
              <button type="button" disabled={busy} onClick={() => changeStatus('resolved')} className="text-sm border border-verdict text-verdict rounded-full px-4 py-1.5 hover:bg-verdict hover:text-paper transition-colors">
                Mark resolved
              </button>
              <button type="button" disabled={busy} onClick={() => changeStatus('closed')} className="text-sm border border-line text-ink-soft rounded-full px-4 py-1.5 hover:border-ink hover:text-ink transition-colors">
                Close
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => changeStatus('new')} className="text-sm border border-line text-ink-soft rounded-full px-4 py-1.5 hover:border-ink hover:text-ink transition-colors">
              Reopen
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-seal mb-4">{error}</p>}

      <div className="grid lg:grid-cols-[1fr_420px] gap-6 items-start">
        {/* Left: the complaint and the conversation */}
        <div className="space-y-6 min-w-0">
          <section className="border border-line rounded-lg bg-white/80 p-5">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-soft mb-3">
              {(a?.facts.product || c.product) && <span>Product: <b className="text-ink font-medium">{a?.facts.product || c.product}</b></span>}
              {c.orderRef && <span>Order: <b className="text-ink font-medium case-number">{c.orderRef}</b></span>}
              {(a?.exposure.principal || c.amountClaimed) ? <span>Amount: <b className="text-ink font-medium">{rupees(a?.exposure.principal || c.amountClaimed)}</b></span> : null}
              {(a?.facts.purchaseDate || c.purchaseDate) && <span>Purchased: <b className="text-ink font-medium">{a?.facts.purchaseDate || c.purchaseDate}</b></span>}
              {a && a.facts.grounds.length > 0 && <span>Grounds: <b className="text-ink font-medium">{groundsByIds(a.facts.grounds).map((g) => g.label).join(', ')}</b></span>}
            </div>
            <p className="whitespace-pre-wrap text-ink leading-relaxed text-[15px]">{c.body}</p>
          </section>

          {c.offer && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm flex flex-wrap justify-between gap-2 ${
                c.offer.status === 'accepted'
                  ? 'border-verdict/50 bg-verdict/10 text-verdict'
                  : c.offer.status === 'declined'
                    ? 'border-seal/40 bg-seal/5 text-seal'
                    : 'border-marigold/50 bg-marigold/10 text-ink'
              }`}
            >
              <span>
                Offer: <b>{OFFER_LABEL[c.offer.kind]}</b>
                {c.offer.value > 0 && ` · ${rupees(c.offer.value)}`}
              </span>
              <span className="case-number text-xs">
                {c.offer.status === 'pending' ? 'WAITING FOR CONSUMER' : `${c.offer.status.toUpperCase()} ${c.offer.decidedAt ? ago(c.offer.decidedAt) : ''}`}
              </span>
            </div>
          )}

          <section>
            <h2 className="font-display text-xl text-ink mb-3">Conversation</h2>
            {c.thread.length === 0 ? (
              <p className="text-sm text-ink-soft border border-dashed border-line rounded-lg p-4">
                No response yet. Pick a recommended action to draft one — it includes the consumer’s tracking link.
              </p>
            ) : (
              <ol className="space-y-3">
                {c.thread.map((e) => (
                  <ThreadItem key={e.id} e={e} brandName={brand.name} />
                ))}
              </ol>
            )}
          </section>

          {!closed && (
            <section id="composer" className="border border-line rounded-lg bg-white/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="font-display text-xl text-ink">{c.firstResponseAt ? 'Reply' : 'First response'}</h2>
                {chosen && a && (
                  <span className="text-xs text-ink-soft">
                    Drafted from: {a.actions.find((x) => x.id === chosen)?.title}
                  </span>
                )}
              </div>
              <textarea
                rows={12}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Choose an action on the right to draft a response, or write your own."
                className="w-full border border-line rounded px-3 py-2 bg-white text-sm leading-relaxed"
              />
              <div className="flex flex-wrap items-end gap-3 mt-3">
                <label className="text-sm">
                  <span className="block text-xs text-ink-soft mb-1">Offer</span>
                  <select
                    value={offerKind}
                    onChange={(e) => setOfferKind(e.target.value as OfferKind | '')}
                    className="border border-line rounded px-2 py-1.5 bg-white"
                  >
                    <option value="">No offer</option>
                    {(Object.keys(OFFER_LABEL) as OfferKind[]).map((k) => (
                      <option key={k} value={k}>
                        {OFFER_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                {offerKind && (
                  <label className="text-sm">
                    <span className="block text-xs text-ink-soft mb-1">Value to consumer (₹)</span>
                    <input
                      inputMode="numeric"
                      value={offerValue}
                      onChange={(e) => setOfferValue(e.target.value)}
                      className="border border-line rounded px-2 py-1.5 bg-white w-32"
                    />
                  </label>
                )}
                <div className="flex-1" />
                {mailto && text && (
                  <a href={mailto} className="text-sm border border-line rounded-full px-4 py-2 text-ink hover:border-ink">
                    Open in email
                  </a>
                )}
                <button
                  type="button"
                  disabled={busy || !text.trim()}
                  onClick={send}
                  className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors disabled:opacity-50"
                >
                  Record response
                </button>
              </div>
              <div className="mt-4 text-xs text-ink-soft bg-paper-dim/60 rounded p-3">
                <p className="mb-1">
                  <b className="text-ink">Consumer tracking link</b> — included in drafts. The consumer can read your replies, add
                  details and accept or decline your offer here:
                </p>
                <CopyLine text={c.trackUrl} />
              </div>
            </section>
          )}
        </div>

        {/* Right: the analysis */}
        <aside className="space-y-4 lg:sticky lg:top-20">
          {!a ? (
            <div className="border border-line rounded-lg bg-white/80 p-6 text-center text-ink-soft text-sm">
              Analysing against the precedent corpus…
            </div>
          ) : (
            <Analysis a={a} brandName={brand.name} onChoose={choose} chosen={chosen} closed={closed} onRerun={rerun} busy={busy} />
          )}
        </aside>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function Analysis({
  a,
  brandName,
  onChoose,
  chosen,
  closed,
  onRerun,
  busy,
}: {
  a: ComplaintAnalysis
  brandName: string
  onChoose: (a: ActionOption) => void
  chosen: string | null
  closed: boolean
  onRerun: () => void
  busy: boolean
}) {
  const p = a.prediction.consumerWinPct
  const tone = p >= 60 ? 'text-seal' : p <= 40 ? 'text-verdict' : 'text-[#8a5f14]'
  const bar = p >= 60 ? 'bg-seal' : p <= 40 ? 'bg-verdict' : 'bg-marigold'
  const e = a.exposure

  return (
    <>
      {/* Likelihood */}
      <section className="border border-line rounded-lg bg-white/80 p-5">
        <div className="flex justify-between items-start">
          <p className="case-number text-[11px] text-ink-soft">IF FILED AT A CONSUMER COMMISSION</p>
          <button type="button" onClick={onRerun} disabled={busy} className="text-[11px] text-ink-soft underline hover:text-ink">
            Re-run
          </button>
        </div>
        <div className="flex items-end gap-3 mt-2">
          <span className={`font-display text-5xl font-semibold ${tone}`}>{p}%</span>
          <span className="text-sm text-ink pb-2">
            chance the consumer succeeds
            <br />
            <b className={tone}>{a.prediction.label}</b>
          </span>
        </div>
        <div className="h-2 bg-line rounded-full overflow-hidden mt-3">
          <div className={`h-full ${bar}`} style={{ width: `${p}%` }} />
        </div>
        <p className="text-xs text-ink-soft mt-3">
          <b className="text-ink capitalize">{a.prediction.confidence} confidence</b> · {a.prediction.basis}
        </p>
        {a.prediction.factors.length > 0 && (
          <ul className="mt-3 space-y-1">
            {a.prediction.factors.map((f) => (
              <li key={f.label} className="text-sm flex gap-2">
                <span className={f.effect === 'up' ? 'text-seal' : 'text-verdict'}>{f.effect === 'up' ? '▲' : '▼'}</span>
                <span className="text-ink">{f.label}</span>
              </li>
            ))}
          </ul>
        )}
        {a.narrative && <p className="text-sm text-ink-soft leading-relaxed mt-3 whitespace-pre-line border-t border-line pt-3">{a.narrative}</p>}
      </section>

      {/* Frivolity */}
      <section className="border border-line rounded-lg bg-white/80 p-5">
        <div className="flex justify-between items-baseline">
          <p className="case-number text-[11px] text-ink-soft">MERIT CHECK</p>
          <span className="text-xs text-ink-soft">frivolity signals {a.frivolity.score}/100</span>
        </div>
        <p
          className={`font-display text-lg font-semibold mt-1 ${
            a.frivolity.label === 'Possibly frivolous' ? 'text-verdict' : a.frivolity.label === 'Needs verification' ? 'text-[#8a5f14]' : 'text-ink'
          }`}
        >
          {a.frivolity.label}
        </p>
        {a.frivolity.signals.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm text-ink-soft list-disc pl-5">
            {a.frivolity.signals.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft mt-1">Specific, documented, and raised with you before.</p>
        )}
      </section>

      {/* Exposure */}
      <section className="border border-line rounded-lg bg-white/80 p-5">
        <p className="case-number text-[11px] text-ink-soft">COST EXPOSURE · {e.forum.toUpperCase()}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <Row k="Award if the consumer wins" v={`${rupees(e.awardIfLost.low)} – ${rupees(e.awardIfLost.high)}`} />
          <Row k="Your defence costs" v={`${rupees(e.defenceCost.low)} – ${rupees(e.defenceCost.high)}`} />
          <Row k="Expected cost if contested" v={rupees(e.expectedCostIfContested)} />
          <div className="border-t border-line pt-2" />
          <Row k="Expected cost if left unresolved" v={rupees(e.expectedCostIfUnresolved)} strong />
          <Row k="Expected cost of recommended action" v={rupees(e.recommendedExpectedCost)} strong />
        </dl>
        {e.saving > 0 && (
          <p className="mt-3 text-sm bg-verdict/10 text-verdict rounded px-3 py-2">
            Acting now saves an expected <b>{rupees(e.saving)}</b>.
          </p>
        )}
      </section>

      {/* Actions */}
      <section className="border border-line rounded-lg bg-white/80 p-5">
        <p className="case-number text-[11px] text-ink-soft mb-3">SUGGESTED ACTIONS</p>
        <ul className="space-y-2">
          {a.actions.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                disabled={closed}
                onClick={() => onChoose(x)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  chosen === x.id
                    ? 'border-ink bg-ink/5'
                    : x.recommended
                      ? 'border-verdict/60 bg-verdict/5 hover:border-verdict'
                      : 'border-line hover:border-ink/40'
                } disabled:cursor-default`}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-sm font-medium text-ink">
                    {x.recommended && <span className="case-number text-[10px] text-verdict mr-1.5">RECOMMENDED</span>}
                    {x.title}
                  </span>
                </div>
                <p className="text-xs text-ink-soft mt-1 leading-relaxed">{x.detail}</p>
                {(x.kind === 'decline' || x.kind === 'advise') && (
                  <p className="text-xs mt-1.5 text-ink">No compensation · closes ~{Math.round(x.closeLikelihood * 100)}%</p>
                )}
                {x.kind !== 'contest' && x.kind !== 'decline' && x.kind !== 'advise' && (
                  <p className="text-xs mt-1.5 text-ink">
                    Costs you <b>{rupees(x.cost)}</b>
                    {x.faceValue > 0 && x.faceValue !== x.cost && <> (worth {rupees(x.faceValue)} to them)</>}
                    {x.closeLikelihood > 0 && <> · closes ~{Math.round(x.closeLikelihood * 100)}%</>}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Precedents */}
      <section className="border border-line rounded-lg bg-white/80 p-5">
        <p className="case-number text-[11px] text-ink-soft">COMPARABLE JUDGMENTS</p>
        {a.similar.cases.length === 0 ? (
          <p className="text-sm text-ink-soft mt-2">No close comparable judgments in the corpus.</p>
        ) : (
          <>
            <p className="text-sm text-ink mt-1">
              Consumer succeeded in <b>{a.similar.consumerWins}</b> of {a.similar.decided} decided comparable cases.
            </p>
            <ul className="mt-3 space-y-3">
              {a.similar.cases.slice(0, 5).map((p) => (
                <li key={p.caseNumber} className="text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-ink font-medium leading-snug">{p.title}</span>
                    <OutcomeChip o={p.outcome} />
                  </div>
                  <p className="text-xs text-ink-soft case-number mt-0.5">
                    {p.caseNumber}
                    {p.date && ` · ${p.date}`}
                    {p.againstThisBrand && <span className="text-seal"> · involves {brandName}</span>}
                  </p>
                  {p.snippet && <p className="text-xs text-ink-soft mt-1 line-clamp-2">{p.snippet}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="border border-line rounded-lg bg-white/80 p-5">
        <p className="case-number text-[11px] text-ink-soft">{brandName.toUpperCase()} BEFORE THE NCDRC</p>
        {a.brandRecord.total === 0 ? (
          <p className="text-sm text-ink-soft mt-2">
            No judgments found under {brandName}’s registered names. Add legal-entity names under Channels → Brand
            profile.
          </p>
        ) : (
          <>
            <p className="text-sm text-ink mt-1">
              {a.brandRecord.total} judgment{a.brandRecord.total === 1 ? '' : 's'} found
              {a.brandRecord.decided > 0 && (
                <>
                  ; consumers succeeded in <b>{a.brandRecord.consumerWins}</b> of {a.brandRecord.decided} decided (
                  {Math.round((a.brandRecord.consumerWins / a.brandRecord.decided) * 100)}%)
                </>
              )}
              .
            </p>
            <ul className="mt-2 space-y-1">
              {a.brandRecord.recent.slice(0, 4).map((p) => (
                <li key={p.caseNumber} className="text-xs flex justify-between gap-2">
                  <span className="text-ink-soft truncate">
                    <span className="case-number">{p.caseNumber}</span> {p.date && `· ${p.date}`}
                  </span>
                  <OutcomeChip o={p.outcome} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="text-[11px] text-ink-soft px-1">
        Facts extracted by {a.facts.extractedBy === 'ai' ? 'AI from the complaint text' : 'keyword rules'}. Figures are
        indicative planning estimates from published judgments, not legal advice.
      </p>
    </>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-soft">{k}</dt>
      <dd className={`text-right whitespace-nowrap ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>{v}</dd>
    </div>
  )
}

const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  consumer: { label: 'CONSUMER WON', cls: 'text-seal border-seal/40 bg-seal/5' },
  business: { label: 'BRAND WON', cls: 'text-verdict border-verdict/40 bg-verdict/10' },
  settled: { label: 'SETTLED', cls: 'text-ink border-line bg-white' },
  withdrawn: { label: 'WITHDRAWN', cls: 'text-ink-soft border-line bg-white' },
  unknown: { label: 'OUTCOME UNCLEAR', cls: 'text-ink-soft border-line bg-white' },
}

function OutcomeChip({ o }: { o: Outcome }) {
  const x = OUTCOME[o]
  return <span className={`case-number shrink-0 text-[9px] tracking-wide px-1.5 py-0.5 rounded border ${x.cls}`}>{x.label}</span>
}

function PriorityChip({ p }: { p: ComplaintAnalysis['priority'] }) {
  const cls =
    p === 'urgent'
      ? 'bg-seal text-paper border-seal'
      : p === 'high'
        ? 'text-[#8a5f14] border-marigold/50 bg-marigold/10'
        : 'text-ink-soft border-line bg-white/60'
  return <span className={`case-number text-[10px] tracking-wide px-2 py-0.5 rounded-full border ${cls}`}>{p.toUpperCase()}</span>
}

function ThreadItem({ e, brandName }: { e: ThreadEntry; brandName: string }) {
  if (e.from === 'system') {
    return <li className="text-xs text-ink-soft text-center py-1">{e.text} · {ago(e.at)}</li>
  }
  const mine = e.from === 'brand'
  return (
    <li className={`rounded-lg border p-4 ${mine ? 'border-ink/20 bg-ink/[0.03] ml-0 sm:ml-10' : 'border-line bg-white/80 mr-0 sm:mr-10'}`}>
      <p className="text-xs text-ink-soft mb-1.5">
        <b className="text-ink">{mine ? brandName : 'Consumer'}</b>
        {e.author && ` · ${e.author}`} · {ago(e.at)}
      </p>
      <p className="whitespace-pre-wrap text-sm text-ink leading-relaxed">{e.text}</p>
      {e.offer && (
        <p className="mt-2 text-xs inline-block border border-marigold/50 bg-marigold/10 rounded px-2 py-1">
          Offer: {OFFER_LABEL[e.offer.kind]}
          {e.offer.value > 0 && ` · ${rupees(e.offer.value)}`}
        </p>
      )}
    </li>
  )
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="case-number text-[11px] text-ink break-all flex-1">{text}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }}
        className="shrink-0 text-ink underline"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export { CopyLine }

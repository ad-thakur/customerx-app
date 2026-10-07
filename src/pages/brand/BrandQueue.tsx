import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBrand } from './BrandShell'
import {
  addComplaint,
  ago,
  loadQueue,
  rupees,
  rupeesShort,
  seedDemo,
  SOURCE_LABEL,
  STATUS_LABEL,
  type ComplaintRow,
  type ComplaintStatus,
  type QueueStats,
} from '../../lib/brandApi'
import { groundsByIds } from '../../lib/grounds'

const REFRESH_MS = 30_000

type Filter = 'open' | 'urgent' | 'unanswered' | 'responded' | 'closed' | 'all'

const FILTERS: { id: Filter; label: string; test: (c: ComplaintRow) => boolean }[] = [
  { id: 'open', label: 'Open', test: (c) => ['new', 'responded', 'consumer_replied'].includes(c.status) },
  { id: 'urgent', label: 'Urgent & high', test: (c) => isOpen(c.status) && (c.priority === 'urgent' || c.priority === 'high') },
  { id: 'unanswered', label: 'Awaiting response', test: (c) => c.status === 'new' || c.status === 'consumer_replied' },
  { id: 'responded', label: 'With consumer', test: (c) => c.status === 'responded' },
  { id: 'closed', label: 'Resolved & closed', test: (c) => !isOpen(c.status) },
  { id: 'all', label: 'All', test: () => true },
]

function isOpen(s: ComplaintStatus) {
  return s === 'new' || s === 'responded' || s === 'consumer_replied'
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-seal',
  high: 'bg-marigold',
  normal: 'bg-ink-soft/40',
  low: 'bg-line',
}

export function WinMeter({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-ink-soft">Analysing…</span>
  const tone = pct >= 60 ? 'bg-seal' : pct <= 40 ? 'bg-verdict' : 'bg-marigold'
  return (
    <div className="flex items-center gap-2" title="Liability likelihood: chance the consumer would succeed at a consumer commission">
      <div className="w-16 h-1.5 rounded-full bg-line overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="case-number text-xs text-ink w-8">{pct}%</span>
    </div>
  )
}

function statusTone(s: ComplaintStatus): string {
  switch (s) {
    case 'new':
    case 'consumer_replied':
      return 'text-seal border-seal/40 bg-seal/5'
    case 'responded':
      return 'text-[#8a5f14] border-marigold/50 bg-marigold/10'
    case 'resolved':
      return 'text-verdict border-verdict/40 bg-verdict/10'
    default:
      return 'text-ink-soft border-line bg-white/60'
  }
}

export function StatusChip({ status }: { status: ComplaintStatus }) {
  return (
    <span className={`case-number inline-block whitespace-nowrap text-[10px] tracking-wide px-2 py-0.5 rounded-full border ${statusTone(status)}`}>
      {STATUS_LABEL[status].toUpperCase()}
    </span>
  )
}

export default function BrandQueue() {
  const { brand } = useBrand()
  const navigate = useNavigate()
  const [data, setData] = useState<{
    stats: QueueStats
    usage: { used: number; limit: number | null }
    complaints: ComplaintRow[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const refresh = useCallback(() => {
    loadQueue(brand.id)
      .then((d) => {
        setData(d)
        setUpdatedAt(new Date())
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
  }, [brand.id])

  useEffect(() => {
    setData(null)
    refresh()
    const t = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  // Complaints arriving by email or web are analysed in the background; poll
  // faster while any are still pending so their scores appear promptly.
  const pending = data?.complaints.some((c) => !c.analysed) ?? false
  useEffect(() => {
    if (!pending) return
    const t = setTimeout(refresh, 3_000)
    return () => clearTimeout(t)
  }, [pending, data, refresh])

  const rows = useMemo(() => {
    if (!data) return []
    const f = FILTERS.find((x) => x.id === filter)!
    const needle = q.trim().toLowerCase()
    return data.complaints
      .filter(f.test)
      .filter(
        (c) =>
          !needle ||
          [c.id, c.consumerName, c.subject, c.product, c.summary].some((s) => s?.toLowerCase().includes(needle)),
      )
      // Most pressing first: priority, then oldest unanswered.
      .sort(
        (a, b) =>
          PRIORITY_RANK[a.priority ?? 'normal'] - PRIORITY_RANK[b.priority ?? 'normal'] ||
          new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime(),
      )
  }, [data, filter, q])

  const seed = () => {
    setSeeding(true)
    seedDemo(brand.id)
      .then(refresh)
      .catch((e: Error) => setError(e.message))
      .finally(() => setSeeding(false))
  }

  if (error && !data) return <p className="text-center text-seal py-24">{error}</p>
  if (!data) return <p className="text-center text-ink-soft py-24">Loading complaints…</p>

  const s = data.stats

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="case-number text-seal text-xs mb-1">COMPLAINT DESK</p>
          <h1 className="font-display text-3xl text-ink">{brand.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/brand/usage"
            title="AI analyses used this month"
            className={`text-xs border rounded-full px-3 py-1 ${
              data.usage.limit !== null && data.usage.used >= data.usage.limit
                ? 'border-seal/50 text-seal bg-seal/5'
                : 'border-line text-ink-soft hover:border-ink/40'
            }`}
          >
            AI analyses {data.usage.used}
            {data.usage.limit !== null ? ` / ${data.usage.limit}` : ''}
          </Link>
          {updatedAt && (
            <span className="text-xs text-ink-soft hidden sm:inline">
              Live · updated {updatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors"
          >
            + Add complaint
          </button>
        </div>
      </div>

      {/* Headline: what's come in, what it's worth, what it could cost. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Complaints received"
          value={String(s.total)}
          note={`${s.open} open · ${s.received30d} in the last 30 days`}
        />
        <Kpi label="Total value claimed" value={rupeesShort(s.openValue)} note="across open complaints" />
        <Kpi
          label="Expected liability"
          value={rupeesShort(s.openLiability)}
          note={`${s.highRisk} likely to succeed if filed`}
          alert={s.highRisk > 0}
        />
        <Kpi
          label="Awaiting your response"
          value={String(s.unanswered)}
          note={s.overdue ? `${s.overdue} past 48 hours` : 'none overdue'}
          alert={s.overdue > 0}
        />
      </div>
      <p className="text-xs text-ink-soft mt-2 mb-8">
        Expected liability = likelihood the consumer succeeds × the likely award, summed over open complaints.
        {s.avgFirstResponseHours !== null && ` Average first response ${s.avgFirstResponseHours.toFixed(1)}h.`}
        {s.resolutionRate !== null && ` ${s.resolved} resolved (${Math.round(s.resolutionRate * 100)}% of closed).`}
      </p>

      {data.complaints.length === 0 ? (
        <div className="border border-line rounded-lg bg-white/70 p-10 text-center">
          <p className="font-display text-xl text-ink mb-2">No complaints yet.</p>
          <p className="text-ink-soft mb-6 max-w-lg mx-auto">
            Connect your website form or support inbox under Channels, add one by hand, or load a set of sample
            complaints to see how the analysis works.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={seed}
              disabled={seeding}
              className="bg-seal text-paper rounded-full px-5 py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
            >
              {seeding ? 'Loading and analysing…' : 'Load sample complaints'}
            </button>
            <Link to="/brand/settings" className="border border-ink rounded-full px-5 py-2.5 font-medium text-ink hover:bg-ink hover:text-paper transition-colors">
              Set up channels
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => {
                const n = data.complaints.filter(f.test).length
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFilter(f.id)}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      filter === f.id ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-ink/40'
                    }`}
                  >
                    {f.label} <span className="opacity-60">{n}</span>
                  </button>
                )
              })}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, product, ID…"
              className="border border-line rounded-full px-4 py-1.5 text-sm bg-white w-full sm:w-64"
            />
          </div>

          <div className="border border-line rounded-lg bg-white/80 overflow-hidden">
            <div className="hidden xl:grid grid-cols-[minmax(0,1fr)_96px_110px_130px_220px_140px] gap-4 px-4 py-2.5 border-b border-line text-[11px] case-number text-ink-soft bg-paper-dim/50">
              <span>COMPLAINT</span>
              <span>VALUE</span>
              <span>LIABILITY LIKELIHOOD</span>
              <span>EXPECTED LIABILITY</span>
              <span>RECOMMENDED</span>
              <span>STATUS</span>
            </div>
            {rows.length === 0 && <p className="text-center text-ink-soft py-10 text-sm">Nothing here.</p>}
            {rows.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/brand/c/${c.id}`)}
                className="w-full text-left grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-[minmax(0,1fr)_96px_110px_130px_220px_140px] gap-x-4 gap-y-2 px-4 py-3.5 border-b border-line last:border-b-0 hover:bg-paper/60 transition-colors"
              >
                <div className="min-w-0 col-span-2 sm:col-span-4 xl:col-span-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[c.priority ?? 'normal']}`}
                      title={c.priority ? `${c.priority} priority` : 'Not analysed yet'}
                    />
                    <span className="font-medium text-ink truncate">{c.subject || c.summary.slice(0, 60)}</span>
                  </div>
                  <p className="text-xs text-ink-soft mt-0.5 truncate">
                    <span className="case-number">{c.id}</span> · {c.consumerName || 'Unknown'} · {SOURCE_LABEL[c.source]} ·{' '}
                    {ago(c.receivedAt)}
                    {c.product && ` · ${c.product}`}
                    {c.grounds.length > 0 && ` · ${groundsByIds(c.grounds).map((g) => g.label).join(', ')}`}
                  </p>
                </div>
                <div className="text-sm text-ink xl:self-center">
                  <span className="xl:hidden text-xs text-ink-soft">Value </span>
                  {rupees(c.amount)}
                </div>
                <div className="xl:self-center">
                  <WinMeter pct={c.consumerWinPct} />
                  {c.frivolity && c.frivolity !== 'Appears genuine' && (
                    <p className={`text-[11px] mt-0.5 ${c.frivolity === 'Possibly frivolous' ? 'text-verdict' : 'text-[#8a5f14]'}`}>
                      {c.frivolity}
                    </p>
                  )}
                </div>
                <div className="xl:self-center text-sm">
                  <span className="xl:hidden text-xs text-ink-soft">Expected liability </span>
                  <span className={(c.consumerWinPct ?? 0) >= 60 ? 'text-seal font-medium' : 'text-ink'}>{rupees(c.liability)}</span>
                  {c.aiReview === 'done' && (
                    <span className="ml-1.5 case-number text-[9px] text-ink border border-ink/30 rounded px-1 py-px align-middle" title="AI case analysis available">
                      AI
                    </span>
                  )}
                </div>
                <div className="xl:self-center text-xs text-ink-soft line-clamp-2 col-span-2 sm:col-span-3 xl:col-span-1">{c.recommended ? <><span className="xl:hidden">Recommended: </span>{c.recommended}</> : ''}</div>
                <div className="xl:self-center">
                  <StatusChip status={c.status} />
                </div>
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between text-xs text-ink-soft">
            <span>
              Liability likelihood = estimated chance the consumer succeeds if this is filed at a consumer commission.
            </span>
            <button type="button" onClick={seed} disabled={seeding} className="underline hover:text-ink">
              {seeding ? 'Loading…' : 'Add sample complaints'}
            </button>
          </div>
        </>
      )}

      {adding && (
        <AddComplaint
          brandId={brand.id}
          onClose={() => setAdding(false)}
          onAdded={(id) => navigate(`/brand/c/${id}`)}
        />
      )}
    </div>
  )
}

function Kpi({ label, value, note, alert }: { label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div className="border border-line rounded-lg bg-white/70 px-4 py-3.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1 ${alert ? 'text-seal' : 'text-ink'}`}>{value}</p>
      {note && <p className={`text-[11px] mt-0.5 ${alert ? 'text-seal' : 'text-ink-soft'}`}>{note}</p>}
    </div>
  )
}

function AddComplaint({
  brandId,
  onClose,
  onAdded,
}: {
  brandId: string
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const [f, setF] = useState({
    name: '',
    email: '',
    subject: '',
    body: '',
    orderRef: '',
    product: '',
    amount: '',
    purchaseDate: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    addComplaint(brandId, f)
      .then((c) => onAdded(c.id))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  const input = 'mt-1 w-full border border-line rounded px-3 py-2 bg-white text-sm'
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-paper rounded-lg border border-line w-full max-w-2xl p-6 space-y-4"
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="case-number text-seal text-xs">ADD A COMPLAINT</p>
            <h2 className="font-display text-2xl text-ink">Paste it in — we’ll analyse it.</h2>
          </div>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink text-xl leading-none">
            ×
          </button>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-ink">Complaint text *</span>
          <textarea
            required
            rows={7}
            value={f.body}
            onChange={set('body')}
            placeholder="Paste the email, form submission or call notes…"
            className={input}
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm text-ink">Consumer name</span>
            <input value={f.name} onChange={set('name')} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Consumer email</span>
            <input type="email" value={f.email} onChange={set('email')} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm text-ink">Subject</span>
            <input value={f.subject} onChange={set('subject')} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Product</span>
            <input value={f.product} onChange={set('product')} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Order / invoice ref</span>
            <input value={f.orderRef} onChange={set('orderRef')} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Amount paid (₹)</span>
            <input inputMode="numeric" value={f.amount} onChange={set('amount')} className={input} />
          </label>
          <label className="block">
            <span className="text-sm text-ink">Purchase date</span>
            <input type="date" value={f.purchaseDate} onChange={set('purchaseDate')} className={input} />
          </label>
        </div>
        {error && <p className="text-sm text-seal">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-ink-soft hover:text-ink">
            Cancel
          </button>
          <button
            disabled={busy || f.body.trim().length < 10}
            className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors disabled:opacity-50"
          >
            {busy ? 'Analysing…' : 'Add and analyse'}
          </button>
        </div>
      </form>
    </div>
  )
}

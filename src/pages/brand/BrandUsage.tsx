import { useEffect, useState } from 'react'
import { useBrand } from './BrandShell'
import { loadUsage, rupees, setBilling, setUsageCap, type BillingModel, type Usage } from '../../lib/brandApi'

export default function BrandUsage() {
  const { brand, reload } = useBrand()
  const [u, setU] = useState<Usage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUsage(brand.id)
      .then(setU)
      .catch((e: Error) => setError(e.message))
  }, [brand.id])

  if (error && !u) return <p className="text-center text-seal py-24">{error}</p>
  if (!u) return <p className="text-center text-ink-soft py-24">Loading…</p>

  const ppa = u.billingModel === 'pay_per_analysis'
  const pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0
  const tone = pct >= 100 ? 'bg-seal' : pct >= 80 ? 'bg-marigold' : 'bg-verdict'
  const month = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">
      <div>
        <p className="case-number text-seal text-xs mb-1">PLAN & USAGE</p>
        <h1 className="font-display text-3xl text-ink">AI analyses this month</h1>
        <p className="text-ink-soft mt-2">
          Every complaint gets the statistical liability estimate automatically, free. An AI case analysis runs when
          your team clicks <b className="text-ink">Run AI case analysis</b> on a complaint: AI reads it, researches
          comparable judgments and suggests how it would be decided. Each click uses one analysis; when the allowance
          runs out, the button is disabled until it resets.
        </p>
      </div>

      {!u.aiEnabled && (
        <p className="text-sm border-l-2 border-marigold pl-3 text-ink">
          AI analysis isn’t switched on yet, so complaints get the statistical estimate and nothing is counted against
          your allowance.
        </p>
      )}

      <section className="border border-line rounded-lg bg-white/80 p-6">
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <p className="text-sm text-ink-soft">{ppa ? 'Pay per analysis' : `${u.plan.label} plan`} · {month}</p>
            <p className="font-display text-4xl font-semibold text-ink mt-1">
              {u.used.toLocaleString('en-IN')}
              <span className="text-xl text-ink-soft font-normal">
                {' '}
                / {u.limit === null ? (ppa ? 'no cap' : 'unlimited') : u.limit.toLocaleString('en-IN')}
              </span>
            </p>
            <p className="text-sm text-ink-soft mt-1">
              {u.remaining !== null ? `${u.remaining.toLocaleString('en-IN')} left · ` : ''}resets on {u.resetsOn}
            </p>
          </div>
          {ppa && (
            <div className="text-right">
              <p className="text-sm text-ink-soft">This month so far</p>
              <p className="font-display text-3xl font-semibold text-ink mt-1">
                {u.estimatedCharge !== null ? rupees(u.estimatedCharge) : '—'}
              </p>
              <p className="text-xs text-ink-soft">
                {u.perAnalysisPrice !== null ? `${rupees(u.perAnalysisPrice)} per analysis` : 'Price to be agreed'}
              </p>
            </div>
          )}
        </div>
        {u.limit !== null && (
          <div className="h-2.5 bg-line rounded-full overflow-hidden mt-4">
            <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {u.limit !== null && u.remaining === 0 && (
          <p className="text-sm text-seal mt-3">
            Allowance used up — AI case analysis is unavailable until {u.resetsOn}; statistical estimates continue.
            {ppa ? ' Raise your cap below to continue.' : ' Contact us to upgrade.'}
          </p>
        )}
        <DailyBars byDay={u.byDay} />
      </section>

      {ppa ? <CapEditor u={u} onSaved={setU} /> : <PlanTable u={u} />}

      {u.isAdmin && <AdminPanel u={u} onSaved={(x) => void reload().then(() => setU(x))} />}
    </div>
  )
}

function DailyBars({ byDay }: { byDay: Usage['byDay'] }) {
  if (byDay.length === 0) return <p className="text-xs text-ink-soft mt-4">No analyses yet this month.</p>
  const now = new Date()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const counts = new Map(byDay.map((d) => [Number(d.day.slice(8, 10)), d.analyses]))
  const max = Math.max(...byDay.map((d) => d.analyses), 1)
  return (
    <div className="mt-5">
      <div className="flex items-end gap-[3px] h-16" aria-label="Analyses per day this month">
        {Array.from({ length: days }, (_, i) => {
          const n = counts.get(i + 1) ?? 0
          return (
            <div
              key={i}
              title={`${i + 1}: ${n} analyses`}
              className={`flex-1 rounded-t-sm ${i + 1 === now.getDate() ? 'bg-ink' : 'bg-ink/30'}`}
              style={{ height: `${n ? Math.max(6, (n / max) * 100) : 2}%` }}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-ink-soft mt-1 case-number">
        <span>1</span>
        <span>{days}</span>
      </div>
    </div>
  )
}

function PlanTable({ u }: { u: Usage }) {
  return (
    <section className="border border-line rounded-lg bg-white/80 p-6">
      <h2 className="font-display text-xl text-ink mb-3">Plans</h2>
      <div className="grid sm:grid-cols-4 gap-3">
        {u.plans.map((p) => (
          <div
            key={p.id}
            className={`rounded-lg border p-4 ${p.id === u.plan.id ? 'border-ink bg-ink/[0.04]' : 'border-line'}`}
          >
            <p className="font-medium text-ink">{p.label}</p>
            <p className="text-sm text-ink-soft mt-1">
              {p.monthlyAnalyses === null ? 'Unlimited' : `${p.monthlyAnalyses.toLocaleString('en-IN')} analyses`} / month
            </p>
            {p.id === u.plan.id && <p className="case-number text-[10px] text-verdict mt-2">CURRENT PLAN</p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-ink-soft mt-4">
        Prefer to pay only for what you use? Pay-per-analysis is also available. Contact us to change plans.
      </p>
    </section>
  )
}

function CapEditor({ u, onSaved }: { u: Usage; onSaved: (u: Usage) => void }) {
  const { brand } = useBrand()
  const [cap, setCap] = useState(u.limit === null ? '' : String(u.limit))
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="border border-line rounded-lg bg-white/80 p-6">
      <h2 className="font-display text-xl text-ink mb-1">Monthly cap</h2>
      <p className="text-sm text-ink-soft mb-4">
        Stop AI analysis after this many in a month, so your bill can’t run past a budget. Leave empty for no cap.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setState('saving')
          setError(null)
          setUsageCap(brand.id, cap.trim() === '' ? null : Number(cap))
            .then((x) => {
              onSaved(x)
              setState('saved')
            })
            .catch((err: Error) => {
              setError(err.message)
              setState('idle')
            })
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input
          inputMode="numeric"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="No cap"
          className="border border-line rounded px-3 py-2 bg-white w-36"
        />
        <span className="text-sm text-ink-soft">
          analyses / month
          {u.perAnalysisPrice !== null && cap.trim() !== '' && Number(cap) > 0 && <> ≈ {rupees(Number(cap) * u.perAnalysisPrice)} at most</>}
        </span>
        <button className="bg-ink text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-seal transition-colors">
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save cap'}
        </button>
      </form>
      {error && <p className="text-sm text-seal mt-2">{error}</p>}
    </section>
  )
}

/** Consumer X staff only: set the brand's billing. */
function AdminPanel({ u, onSaved }: { u: Usage; onSaved: (u: Usage) => void }) {
  const { brand } = useBrand()
  const [model, setModel] = useState<BillingModel>(u.billingModel)
  const [plan, setPlan] = useState(u.plan.id)
  const [limit, setLimit] = useState(brand.monthlyLimit === null ? '' : String(brand.monthlyLimit))
  const [price, setPrice] = useState(u.perAnalysisPrice === null ? '' : String(u.perAnalysisPrice))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const input = 'border border-line rounded px-3 py-2 bg-white text-sm'

  return (
    <section className="border-2 border-dashed border-seal/40 rounded-lg bg-white/60 p-6">
      <p className="case-number text-[11px] text-seal">CONSUMER X STAFF ONLY</p>
      <h2 className="font-display text-xl text-ink mb-3">Billing for {brand.name}</h2>
      {u.internal && (
        <p className="text-sm text-ink mb-4">
          Cost to serve this month: <b>${u.internal.costUsd.toFixed(2)}</b> ({u.internal.inputTokens.toLocaleString('en-IN')}{' '}
          input / {u.internal.outputTokens.toLocaleString('en-IN')} output tokens)
          {u.used > 0 && <> · ${(u.internal.costUsd / u.used).toFixed(3)} per analysis</>}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          setBilling(brand.id, {
            billingModel: model,
            plan,
            monthlyLimit: limit.trim() === '' ? null : Number(limit),
            perAnalysisPrice: price.trim() === '' ? null : Number(price),
          })
            .then((x) => {
              onSaved(x)
              setSaved(true)
            })
            .catch((err: Error) => setError(err.message))
        }}
        className="grid sm:grid-cols-2 gap-4"
      >
        <label className="text-sm text-ink">
          Billing model
          <select value={model} onChange={(e) => setModel(e.target.value as BillingModel)} className={`${input} block mt-1 w-full`}>
            <option value="subscription">Subscription</option>
            <option value="pay_per_analysis">Pay per analysis</option>
          </select>
        </label>
        <label className="text-sm text-ink">
          Plan
          <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={model !== 'subscription'} className={`${input} block mt-1 w-full`}>
            {u.plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.monthlyAnalyses ?? '∞'}/mo)
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink">
          {model === 'subscription' ? 'Custom monthly allowance (overrides plan)' : 'Monthly cap'}
          <input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder={model === 'subscription' ? 'Plan default' : 'No cap'} className={`${input} block mt-1 w-full`} />
        </label>
        <label className="text-sm text-ink">
          Price per analysis (₹)
          <input value={price} onChange={(e) => setPrice(e.target.value)} disabled={model !== 'pay_per_analysis'} placeholder="—" className={`${input} block mt-1 w-full`} />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button className="bg-seal text-paper rounded-full px-5 py-2 text-sm font-medium hover:bg-ink transition-colors">
            Update billing
          </button>
          {saved && <span className="text-sm text-verdict">Updated</span>}
          {error && <span className="text-sm text-seal">{error}</span>}
        </div>
      </form>
    </section>
  )
}

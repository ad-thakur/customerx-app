import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { getCaseView, payCase, type CaseView } from '../lib/caseStore'

type PayStage = 'closed' | 'form' | 'waiting' | 'done'

export default function Payment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [record, setRecord] = useState<CaseView | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stage, setStage] = useState<PayStage>('closed')
  const [method, setMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [upiId, setUpiId] = useState('')

  useEffect(() => {
    if (!id) return
    getCaseView(id)
      .then((v) => {
        if (v.assessment) navigate(`/report/${v.id}`, { replace: true })
        else setRecord(v)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [id, navigate])

  if (loading) {
    return <p className="text-center text-ink-soft py-24">Loading your case…</p>
  }

  if (loadError || !record) {
    return (
      <div className="mx-auto max-w-xl px-6 py-20 text-center">
        <p className="text-ink-soft mb-4">We couldn't find that case.</p>
        <Link to="/file" className="text-seal font-medium">Start a new complaint →</Link>
      </div>
    )
  }

  const pay = () => {
    setStage('waiting')
    payCase(record.id)
      .then(() => setStage('done'))
      .catch(() => {
        setStage('form')
        alert('The payment simulation hit an error — please try again.')
      })
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-14">
      <p className="case-number text-seal text-sm mb-3">RECOVERY ASSESSMENT · CASE {record.id}</p>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-3">One payment. A realistic answer.</h1>
      <p className="text-ink-soft mb-8">
        Before you invest any more time, know what cases like yours actually recover — based on
        comparable evidence profiles, not optimism.
      </p>

      <div className="border border-line rounded-lg bg-white/70 p-6 mb-6">
        <div className="flex justify-between items-baseline border-b border-line pb-4 mb-4">
          <div>
            <p className="font-medium text-ink">Recovery assessment — {record.id}</p>
            <p className="text-sm text-ink-soft">Likelihood band · recovery range · comparable cases · recommended path</p>
          </div>
          <p className="font-display text-2xl font-semibold text-ink">₹499</p>
        </div>
        <div className="flex justify-between items-baseline text-sm">
          <p className="text-ink-soft">One-time · No recurring charges · Refunded if we can't assess your case</p>
          <p className="font-medium text-ink">Total: ₹499</p>
        </div>
      </div>

      <button
        onClick={() => setStage('form')}
        className="w-full bg-seal text-paper rounded-full py-3.5 font-medium text-lg hover:bg-ink transition-colors"
      >
        Pay ₹499 securely
      </button>
      <p className="text-sm text-ink-soft text-center mt-3">
        UPI · Cards · Netbanking — processed by our payment partner. Consumer X never stores card details.
      </p>
      <p className="text-center mt-8">
        <Link to="/result" className="text-ink-soft hover:text-ink text-sm font-medium">← Back to your case summary</Link>
      </p>

      <p className="case-number text-xs text-ink-soft/60 text-center mt-10">
        Demo build — no real money moves; the checkout below is simulated.
      </p>

      {/* Simulated checkout modal */}
      {stage !== 'closed' && (
        <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center px-6">
          <div className="bg-paper rounded-xl border border-line shadow-xl w-full max-w-sm p-6">
            {stage === 'form' && (
              <>
                <div className="flex justify-between items-center mb-5">
                  <p className="font-medium text-ink">Consumer X · ₹499</p>
                  <button
                    onClick={() => setStage('closed')}
                    className="text-ink-soft hover:text-ink text-xl leading-none"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <div className="flex gap-2 mb-4">
                  {(['upi', 'card', 'netbanking'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={`flex-1 rounded-full py-2 text-sm font-medium border transition-colors ${
                        method === m
                          ? 'bg-ink text-paper border-ink'
                          : 'border-line text-ink-soft hover:text-ink'
                      }`}
                    >
                      {m === 'upi' ? 'UPI' : m === 'card' ? 'Card' : 'Netbanking'}
                    </button>
                  ))}
                </div>
                {method === 'upi' ? (
                  <label className="block mb-4">
                    <span className="text-sm text-ink-soft">UPI ID</span>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="you@bank"
                      className="mt-1 w-full rounded-lg border border-line bg-white/80 px-3 py-2 text-ink focus:outline-none focus:border-ink"
                    />
                  </label>
                ) : (
                  <p className="text-sm text-ink-soft mb-4">
                    {method === 'card' ? 'Card' : 'Netbanking'} checkout is simulated in this demo.
                  </p>
                )}
                <button
                  onClick={pay}
                  className="w-full bg-ink text-paper rounded-full py-2.5 font-medium hover:bg-seal transition-colors"
                >
                  Pay ₹499
                </button>
              </>
            )}

            {stage === 'waiting' && (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-line border-t-seal rounded-full animate-spin mx-auto" />
                <p className="text-sm text-ink-soft mt-4">Confirming with your bank… preparing your assessment…</p>
              </div>
            )}

            {stage === 'done' && (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-verdict text-paper text-2xl flex items-center justify-center mx-auto mb-4">✓</div>
                <h3 className="font-display text-xl text-ink">Payment successful</h3>
                <p className="text-sm text-ink-soft mt-2 mb-5">
                  Receipt emailed to you. Your assessment is ready.
                </p>
                <button
                  onClick={() => navigate(`/report/${record.id}`)}
                  className="w-full bg-ink text-paper rounded-full py-2.5 font-medium hover:bg-seal transition-colors"
                >
                  View my recovery assessment →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

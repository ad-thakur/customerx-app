import { useIntake } from '../../lib/IntakeContext'
import { groundById } from '../../lib/grounds'

export default function ReviewStep({ onBack, onSubmit }: { onBack: () => void; onSubmit: () => void }) {
  const { data } = useIntake()
  const ground = groundById(data.ground)

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-4 py-2.5 border-b border-line/70 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className="text-ink font-medium text-right">{value || '—'}</span>
    </div>
  )

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">Review before we run the numbers</h2>
      <p className="text-ink-soft mb-8">Make sure this looks right — it's what your notice will be built from.</p>

      <div className="border border-line rounded-lg bg-white/70 p-6">
        <Row label="Ground for complaint" value={ground ? `${ground.label} (${ground.section})` : ''} />
        <Row label="Complainant" value={data.fullName} />
        <Row label="Phone" value={data.phone} />
        <Row label="Opposite party" value={data.companyName} />
        <Row label="Transaction date" value={data.transactionDate} />
        <Row label="Incident date" value={data.incidentDate} />
        <Row
          label="Claim amount"
          value={
            data.claimAmount
              ? `₹${(data.claimAmount + (data.consequentialLoss ?? 0)).toLocaleString('en-IN')}`
              : ''
          }
        />
        <Row label="Evidence attached" value={`${data.evidence.length} file(s)`} />
      </div>

      <div className="mt-10 flex justify-between">
        <button type="button" onClick={onBack} className="text-ink-soft font-medium hover:text-ink transition-colors">
          ← Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium hover:bg-seal transition-colors"
        >
          See my Commission & eligibility
        </button>
      </div>
    </div>
  )
}

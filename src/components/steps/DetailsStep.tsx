import { useIntake } from '../../lib/IntakeContext'

const inputClass =
  'w-full border border-line rounded-md px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink text-ink placeholder:text-ink-soft/50'
const labelClass = 'block text-sm font-medium text-ink mb-1.5'

export default function DetailsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data, update } = useIntake()

  const requiredFilled = data.fullName && data.phone && data.claimAmount && data.incidentDate

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">A few details</h2>
      <p className="text-ink-soft mb-8">Just the essentials. Everything here goes straight into your notice.</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Full name</label>
          <input
            className={inputClass}
            value={data.fullName}
            onChange={(e) => update({ fullName: e.target.value })}
            placeholder="As it should appear on the notice"
          />
        </div>
        <div>
          <label className={labelClass}>Phone number</label>
          <input
            className={inputClass}
            value={data.phone}
            onChange={(e) => update({ phone: e.target.value })}
            placeholder="10-digit mobile"
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            className={inputClass}
            type="email"
            value={data.email}
            onChange={(e) => update({ email: e.target.value })}
          />
        </div>
        <div>
          <label className={labelClass}>Amount paid / claimed (₹)</label>
          <input
            className={inputClass}
            type="number"
            min={0}
            value={data.claimAmount ?? ''}
            onChange={(e) => update({ claimAmount: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 24999"
          />
        </div>
        <div>
          <label className={labelClass}>When did the problem happen?</label>
          <input
            className={inputClass}
            type="date"
            value={data.incidentDate}
            onChange={(e) => update({ incidentDate: e.target.value })}
          />
          <p className="text-xs text-ink-soft mt-1">Your 2-year filing window is counted from here.</p>
        </div>
      </div>

      <div className="mt-10 flex justify-between">
        <button type="button" onClick={onBack} className="text-ink-soft font-medium hover:text-ink transition-colors">
          ← Back
        </button>
        <button
          type="button"
          disabled={!requiredFilled}
          onClick={onNext}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-seal transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

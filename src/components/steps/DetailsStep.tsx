import { useIntake } from '../../lib/IntakeContext'

const inputClass =
  'w-full border border-line rounded-md px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink text-ink placeholder:text-ink-soft/50'
const labelClass = 'block text-sm font-medium text-ink mb-1.5'

export default function DetailsStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { data, update } = useIntake()

  const requiredFilled =
    data.fullName && data.phone && data.companyName && data.transactionDate && data.incidentDate && data.claimAmount

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">Tell us the details</h2>
      <p className="text-ink-soft mb-8">This goes directly into your notice and, if needed, your filing.</p>

      <div className="space-y-8">
        <fieldset>
          <legend className="case-number text-xs text-seal mb-3">YOUR DETAILS</legend>
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
                placeholder="10-digit mobile number"
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
              <label className={labelClass}>City / State</label>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  value={data.city}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="City"
                />
                <input
                  className={inputClass}
                  value={data.state}
                  onChange={(e) => update({ state: e.target.value })}
                  placeholder="State"
                />
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="case-number text-xs text-seal mb-3">THE COMPANY / SELLER</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Company or seller name</label>
              <input
                className={inputClass}
                value={data.companyName}
                onChange={(e) => update({ companyName: e.target.value })}
                placeholder="e.g. Acme Appliances Pvt. Ltd."
              />
            </div>
            <div>
              <label className={labelClass}>Company address (if known)</label>
              <input
                className={inputClass}
                value={data.companyAddress}
                onChange={(e) => update({ companyAddress: e.target.value })}
                placeholder="Registered or branch address"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Grievance / customer-care email (if known)</label>
              <input
                className={inputClass}
                type="email"
                value={data.companyEmail}
                onChange={(e) => update({ companyEmail: e.target.value })}
                placeholder="e.g. grievance@acme.in"
              />
              <p className="text-xs text-ink-soft mt-1">
                Used to address your notice. Most companies publish a grievance officer's email
                under their "Contact us" or "Grievance Redressal" page, as required by law.
              </p>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend className="case-number text-xs text-seal mb-3">TRANSACTION & CLAIM</legend>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Date of purchase / transaction</label>
              <input
                className={inputClass}
                type="date"
                value={data.transactionDate}
                onChange={(e) => update({ transactionDate: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClass}>Date the problem occurred</label>
              <input
                className={inputClass}
                type="date"
                value={data.incidentDate}
                onChange={(e) => update({ incidentDate: e.target.value })}
              />
              <p className="text-xs text-ink-soft mt-1">
                Your 2-year filing window is counted from this date.
              </p>
            </div>
            <div>
              <label className={labelClass}>Amount paid (₹)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={data.claimAmount ?? ''}
                onChange={(e) => update({ claimAmount: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 20000"
              />
            </div>
            <div>
              <label className={labelClass}>Additional loss claimed (₹, optional)</label>
              <input
                className={inputClass}
                type="number"
                min={0}
                value={data.consequentialLoss ?? ''}
                onChange={(e) =>
                  update({ consequentialLoss: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="e.g. repair costs, medical costs"
              />
            </div>
          </div>
        </fieldset>
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

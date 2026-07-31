import { GROUNDS } from '../../lib/grounds'
import { useIntake } from '../../lib/IntakeContext'

export default function GroundStep({ onNext }: { onNext: () => void }) {
  const { data, update } = useIntake()

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
        What went wrong, and who with?
      </h2>
      <p className="text-ink-soft mb-8">
        Two quick questions. That's all we need to find your footing — and anyone else in the same boat.
      </p>

      <p className="case-number text-xs text-seal mb-3">THE PROBLEM</p>
      <div className="grid sm:grid-cols-2 gap-4">
        {GROUNDS.map((g) => {
          const selected = data.ground === g.id
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => update({ ground: g.id })}
              className={`text-left border rounded-lg p-5 transition ${
                selected
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-white/60 hover:bg-white hover:border-ink-soft'
              }`}
            >
              <p className={`case-number text-xs mb-2 ${selected ? 'text-marigold-dim' : 'text-seal'}`}>
                {g.section}
              </p>
              <p className="font-display text-lg mb-1">{g.label}</p>
              <p className={`text-sm leading-relaxed ${selected ? 'text-paper/80' : 'text-ink-soft'}`}>
                {g.description}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-8 max-w-md">
        <label className="block text-sm font-medium text-ink mb-1.5">Which company or seller?</label>
        <input
          className="w-full border border-line rounded-md px-4 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink text-ink placeholder:text-ink-soft/50"
          value={data.companyName}
          onChange={(e) => update({ companyName: e.target.value })}
          placeholder="e.g. Vayu Appliances"
        />
        <p className="text-xs text-ink-soft mt-1.5">
          Start typing — we'll check if others have already claimed against them.
        </p>
      </div>

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          disabled={!data.ground || data.companyName.trim().length < 2}
          onClick={onNext}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-seal transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

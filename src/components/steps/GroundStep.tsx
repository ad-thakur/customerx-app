import { GROUNDS } from '../../lib/grounds'
import { useIntake } from '../../lib/IntakeContext'

export default function GroundStep({ onNext }: { onNext: () => void }) {
  const { data, update } = useIntake()

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
        What kind of problem are you dealing with?
      </h2>
      <p className="text-ink-soft mb-8">Pick the option closest to your situation. You can refine details next.</p>

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

      <div className="mt-10 flex justify-end">
        <button
          type="button"
          disabled={!data.ground}
          onClick={onNext}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-seal transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

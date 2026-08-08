import { GROUNDS, groundListLabel } from '../../lib/grounds'
import { useIntake } from '../../lib/IntakeContext'
import type { GroundId } from '../../lib/types'

export default function GroundStep({ onNext }: { onNext: () => void }) {
  const { data, update } = useIntake()
  const selected = data.grounds ?? []

  /**
   * Selection order is preserved: the first ground picked becomes the primary
   * one, which drives the notice heading. Re-clicking removes.
   */
  const toggle = (id: GroundId) => {
    update({
      grounds: selected.includes(id) ? selected.filter((g) => g !== id) : [...selected, id],
    })
  }

  return (
    <div>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
        What kind of problem are you dealing with?
      </h2>
      <p className="text-ink-soft mb-2">
        Select every option that applies — most complaints engage more than one. A machine that
        failed and was then never repaired is both{' '}
        <span className="text-ink">defective goods</span> and{' '}
        <span className="text-ink">deficient service</span>, and your notice will plead both.
      </p>
      <p className="text-ink-soft/80 text-sm mb-8">
        The first one you pick is treated as the primary ground.
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        {GROUNDS.map((g) => {
          const isOn = selected.includes(g.id)
          const rank = selected.indexOf(g.id) + 1
          return (
            <button
              key={g.id}
              type="button"
              role="checkbox"
              aria-checked={isOn}
              onClick={() => toggle(g.id)}
              className={`relative text-left border rounded-lg p-5 transition ${
                isOn
                  ? 'border-ink bg-ink text-paper'
                  : 'border-line bg-white/60 hover:bg-white hover:border-ink-soft'
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-4 right-4 w-5 h-5 rounded flex items-center justify-center text-[11px] font-medium border ${
                  isOn ? 'border-marigold-dim text-ink bg-marigold-dim' : 'border-line text-transparent'
                }`}
              >
                {isOn ? rank : ''}
              </span>
              <p className={`case-number text-xs mb-2 ${isOn ? 'text-marigold-dim' : 'text-seal'}`}>
                {g.section}
              </p>
              <p className="font-display text-lg mb-1 pr-8">{g.label}</p>
              <p className={`text-sm leading-relaxed ${isOn ? 'text-paper/80' : 'text-ink-soft'}`}>
                {g.description}
              </p>
            </button>
          )
        })}
      </div>

      <div className="mt-10 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-ink-soft">
          {selected.length === 0
            ? 'Select at least one ground to continue.'
            : `${selected.length} ground${selected.length > 1 ? 's' : ''} selected — ${groundListLabel(selected)}.`}
        </p>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={onNext}
          className="bg-ink text-paper px-7 py-3 rounded-full font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:bg-seal transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

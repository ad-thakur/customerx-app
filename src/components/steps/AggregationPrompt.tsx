import { useIntake } from '../../lib/IntakeContext'
import { matchGroup } from '../../lib/groups'
import Chip from '../Chip'

export default function AggregationPrompt({
  onChoose,
  onBack,
}: {
  onChoose: (joinGroup: boolean) => void
  onBack: () => void
}) {
  const { data } = useIntake()
  const group = matchGroup(data.companyName)

  if (group) {
    return (
      <div>
        <p className="case-number text-seal text-sm mb-3">HOLD ON — YOU'RE NOT ALONE</p>
        <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
          {group.count} people already have a claim against {group.company}.
        </h2>
        <p className="text-ink-soft mb-6 max-w-2xl">
          For the same kind of problem. You can file alongside them — one coordinated notice, one
          combined number the company has to answer — or go it alone. Either way you still get your
          own free assessment.
        </p>

        <div className="border border-line border-l-4 border-l-marigold rounded-lg bg-white/70 p-6 mb-6">
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip tone="navy">GROUP CLAIM · {group.id}</Chip>
            <Chip tone="gold">{group.statusLabel.toUpperCase()}</Chip>
          </div>
          <h3 className="font-display text-lg text-ink mb-1">{group.company}</h3>
          <p className="text-sm text-ink-soft">{group.section} · {group.issue}</p>
          <div className="flex flex-wrap gap-8 mt-4">
            <div>
              <p className="font-display text-2xl text-ink leading-none">{group.count}</p>
              <p className="text-sm text-ink-soft">claimants</p>
            </div>
            <div>
              <p className="font-display text-2xl text-ink leading-none">{group.combinedValue}</p>
              <p className="text-sm text-ink-soft">combined claim value</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={() => onChoose(true)}
            className="bg-seal text-paper px-6 py-3 rounded-full font-medium hover:bg-ink transition-colors"
          >
            Join this group claim →
          </button>
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="border border-line text-ink px-6 py-3 rounded-full font-medium hover:border-ink transition-colors"
          >
            File on my own instead
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="case-number text-seal text-sm mb-3">YOU COULD BE THE FIRST</p>
      <h2 className="font-display text-2xl md:text-3xl text-ink mb-2">
        No active group claim against {data.companyName} yet.
      </h2>
      <p className="text-ink-soft mb-8 max-w-2xl">
        That's fine — file your claim, and anyone wronged the same way can join you. Group claims
        start with one person deciding to act.
      </p>
      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => onChoose(false)}
          className="bg-ink text-paper px-6 py-3 rounded-full font-medium hover:bg-seal transition-colors"
        >
          Continue with my claim →
        </button>
        <button
          type="button"
          onClick={onBack}
          className="text-ink-soft font-medium hover:text-ink transition-colors"
        >
          ← Change company
        </button>
      </div>
    </div>
  )
}

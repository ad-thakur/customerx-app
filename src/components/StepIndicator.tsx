const STEPS = ['Issue', 'Details', 'Evidence', 'Review']

export default function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 mb-10">
      {STEPS.map((label, i) => {
        const active = i === current
        const done = i < current
        return (
          <li key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`case-number w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 border ${
                  active
                    ? 'bg-ink text-paper border-ink'
                    : done
                    ? 'bg-verdict text-paper border-verdict'
                    : 'bg-transparent text-ink-soft border-line'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className={`text-sm hidden sm:inline ${active ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && <span className="w-6 sm:w-10 h-px bg-line" />}
          </li>
        )
      })}
    </ol>
  )
}

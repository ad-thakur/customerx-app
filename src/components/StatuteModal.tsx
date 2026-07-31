import { useEffect } from 'react'
import type { Ground } from '../lib/types'

interface StatuteModalProps {
  ground: Ground
  onClose: () => void
}

export default function StatuteModal({ ground, onClose }: StatuteModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-w-xl w-full max-h-[80vh] overflow-y-auto rounded-lg bg-paper border border-line p-7 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="statute-modal-title"
      >
        <div className="flex items-start justify-between gap-4 mb-1">
          <p className="case-number text-xs text-seal">{ground.statuteRef}</p>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-ink-soft hover:text-ink transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>
        <h3 id="statute-modal-title" className="font-display text-xl text-ink mb-4">
          {ground.label}
        </h3>
        <div className="space-y-4">
          {ground.statuteText.map((para, i) => (
            <p key={i} className="text-sm text-ink-soft leading-relaxed">
              {para}
            </p>
          ))}
        </div>
        <p className="text-xs text-ink-soft/70 mt-6 pt-4 border-t border-line">
          Source: Consumer Protection Act, 2019. Provided for reference — not a substitute for legal advice.
        </p>
      </div>
    </div>
  )
}

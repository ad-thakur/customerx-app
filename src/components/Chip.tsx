import type { GroupStatus } from '../lib/groups'

type Tone = 'gold' | 'seal' | 'verdict' | 'navy'

const TONE_CLASS: Record<Tone, string> = {
  gold: 'text-[#8a5f14] border-marigold/50 bg-marigold/10',
  seal: 'text-seal border-seal/40 bg-seal/5',
  verdict: 'text-verdict border-verdict/40 bg-verdict/10',
  navy: 'text-ink border-ink/25 bg-ink/5',
}

const STATUS_TONE: Record<GroupStatus, Tone> = {
  collecting: 'seal',
  notice_sent: 'gold',
  in_settlement: 'gold',
  settled: 'verdict',
}

export default function Chip({
  children,
  tone = 'navy',
  className = '',
}: {
  children: React.ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={`case-number inline-block text-[11px] tracking-wide px-3 py-1 rounded-full border ${TONE_CLASS[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function statusTone(status: GroupStatus): Tone {
  return STATUS_TONE[status]
}

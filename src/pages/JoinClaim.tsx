import { Link } from 'react-router-dom'
import { featuredGroup, GROUP_JOIN_FEE } from '../lib/groups'
import Chip from '../components/Chip'

const WHAT_JOINING_DOES = [
  {
    title: 'Your claim joins the shared file',
    body: 'Your evidence and details are added to the coordinated group record — kept private to Consumer X.',
  },
  {
    title: "You're covered by the coordinated notice",
    body: 'One notice already went out on behalf of every claimant. There is no separate notice to send — the group’s is the notice.',
  },
  {
    title: 'You settle — or escalate — together',
    body: 'If the company settles the group, you settle on the same terms. If not, the group files as a representative complaint, advocate included.',
  },
]

export default function JoinClaim() {
  const g = featuredGroup

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-sm mb-4">
        <Link to="/claim-aggregation" className="text-ink-soft hover:text-ink font-medium">
          ← All group claims
        </Link>
      </p>

      <p className="case-number text-seal text-sm mb-3">GROUP CLAIM · {g.id}</p>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-2">
        Join the claim against {g.company}.
      </h1>
      <p className="text-ink-soft mb-8">
        You're claimant #{g.count + 1}. Your case stops being one ticket a company can ignore, and
        becomes part of a coordinated action it has to answer.
      </p>

      {/* Cluster snapshot */}
      <div className="border border-line border-l-4 border-l-marigold rounded-lg bg-white/70 p-6 mb-6">
        <Chip tone="gold">{g.statusLabel.toUpperCase()} · WINDOW OPEN</Chip>
        <h2 className="font-display text-xl text-ink mt-3 mb-1">{g.issue}</h2>
        <p className="text-sm text-ink-soft">
          {g.section} · Service centres acknowledged the defect in writing, then refused replacement
          or refund.
        </p>
        <div className="flex flex-wrap gap-8 mt-5">
          <div>
            <p className="font-display text-2xl text-ink leading-none">{g.count}</p>
            <p className="text-sm text-ink-soft">claimants so far</p>
          </div>
          <div>
            <p className="font-display text-2xl text-ink leading-none">{g.combinedValue}</p>
            <p className="text-sm text-ink-soft">combined claim value</p>
          </div>
          <div>
            <p className="font-display text-2xl text-ink leading-none">18</p>
            <p className="text-sm text-ink-soft">days left in the shared window</p>
          </div>
        </div>
      </div>

      {/* What joining does */}
      <div className="border border-line rounded-lg bg-white/70 p-6 mb-6">
        <h2 className="font-display text-xl text-ink mb-4">What joining does</h2>
        <ul className="space-y-4">
          {WHAT_JOINING_DOES.map((item) => (
            <li key={item.title} className="flex gap-3">
              <span className="text-verdict mt-0.5">✓</span>
              <div>
                <p className="font-medium text-ink text-sm">{item.title}</p>
                <p className="text-sm text-ink-soft">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Checkout (payment stubbed for Phase 2) */}
      <div className="border border-seal/60 rounded-lg bg-white/70 p-6">
        <div className="flex justify-between items-baseline border-b border-line pb-4 mb-4">
          <div>
            <p className="font-medium text-ink">Join the group claim — {g.id}</p>
            <p className="text-sm text-ink-soft">
              Your place in the coordinated action · shared advocate representation · filing if the
              group escalates
            </p>
          </div>
          <p className="font-display text-2xl text-ink">{GROUP_JOIN_FEE}</p>
        </div>
        <p className="text-sm text-ink-soft mb-4">
          One fixed fee to join — never a percentage of what you recover. There is no separate notice
          step on a group claim; the coordinated notice is already in play.
        </p>
        <button
          disabled
          title="Payments launch in Phase 2"
          className="w-full rounded-full py-3 font-medium bg-paper-dim text-ink-soft cursor-not-allowed"
        >
          Join for {GROUP_JOIN_FEE} — coming soon
        </button>
        <p className="text-xs text-ink-soft/70 text-center mt-3">
          UPI · Cards · Netbanking — payment integration launches in Phase 2.
        </p>
      </div>

      <p className="text-center mt-8 text-sm">
        <Link to="/individual-pursuit" className="text-ink-soft hover:text-ink font-medium">
          Prefer to go it alone? Pursue individually instead →
        </Link>
      </p>
    </div>
  )
}

import { Link } from 'react-router-dom'
import { featuredGroup, GROUP_JOIN_FEE, INDIVIDUAL_FEE } from '../lib/groups'
import Chip from '../components/Chip'

const COVERS = [
  'Your filing packet assembled — complaint, evidence annexures, delivery proof of the notice',
  'An empanelled advocate engaged for your matter and appearing on your behalf',
  'Filing at the correct District Commission — where your claim value attracts no court fee',
  'Hearing tracking and updates, on WhatsApp and here, to resolution',
]

export default function IndividualPursuit() {
  const g = featuredGroup

  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <p className="case-number text-seal text-sm mb-3">PURSUE INDIVIDUALLY</p>
      <h1 className="font-display text-3xl md:text-4xl text-ink mb-2">Going it alone? Here's your path.</h1>
      <p className="text-ink-soft mb-8">
        Your case, in your name — a free notice to start, an optional assessment, and full
        representation to the Commission if you want it.
      </p>

      {/* Disclaimer: group is usually better & cheaper */}
      <div className="border border-marigold/60 bg-marigold/10 rounded-lg p-6 mb-6">
        <p className="text-sm text-ink">
          <span className="font-semibold">Worth knowing before you go solo.</span> {g.count} people
          are already pursuing {g.company} together for this exact defect. A coordinated claim usually
          carries more weight with a company than a single case — and it's cheaper:{' '}
          <span className="font-semibold">{GROUP_JOIN_FEE} to join the group</span> versus{' '}
          <span className="font-semibold">{INDIVIDUAL_FEE} on your own</span>. If you'd still rather
          run your own case, everything you need is here.{' '}
          <Link to="/join-claim" className="text-seal font-semibold hover:underline">
            Reconsider joining the {g.count} →
          </Link>
        </p>
      </div>

      {/* Lighter first moves */}
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <div className="border border-ink rounded-lg bg-ink text-paper p-6">
          <Chip tone="navy" className="!text-paper !border-paper/40 !bg-paper/10">FREE</Chip>
          <h3 className="font-display text-lg mt-3 mb-1">Send the notice, free</h3>
          <p className="text-sm text-paper/70 mb-4">
            We draft and send your pre-litigation notice at no cost. 30 days to respond — you pay
            nothing unless they ignore it.
          </p>
          <button
            disabled
            title="Notice generation launches in Phase 2"
            className="w-full rounded-full py-2.5 font-medium bg-paper/20 text-paper cursor-not-allowed"
          >
            Draft my notice — coming soon
          </button>
        </div>
        <div className="border border-line rounded-lg bg-white/70 p-6">
          <Chip tone="navy">OPTIONAL · ₹499</Chip>
          <h3 className="font-display text-lg text-ink mt-3 mb-1">Recovery assessment</h3>
          <p className="text-sm text-ink-soft mb-4">
            Your likelihood band, a realistic recovery range, and cases decided on similar grounds —
            so you know what your own case is worth before you commit.
          </p>
          <button
            disabled
            title="Payments launch in Phase 2"
            className="w-full rounded-full py-2.5 font-medium bg-paper-dim text-ink-soft cursor-not-allowed"
          >
            Get my assessment — coming soon
          </button>
        </div>
      </div>

      {/* Main paid pursuit */}
      <div className="border border-seal/60 rounded-lg bg-white/70 p-6">
        <div className="flex justify-between items-baseline border-b border-line pb-4 mb-4">
          <div>
            <p className="font-medium text-ink">Pursue &amp; file my case individually</p>
            <p className="text-sm text-ink-soft">Filing + advocate + representation to resolution</p>
          </div>
          <p className="font-display text-2xl text-ink">{INDIVIDUAL_FEE}</p>
        </div>
        <p className="text-sm font-medium text-ink mb-3">What {INDIVIDUAL_FEE} covers</p>
        <ul className="space-y-2.5 mb-4">
          {COVERS.map((c) => (
            <li key={c} className="flex gap-3 text-sm text-ink-soft">
              <span className="text-seal">▪</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-soft mb-4">
          The notice above is still free — you only pay this if the company ignores it and you choose
          to file, or now if you'd rather skip the wait. One fixed fee, never a percentage of what you
          recover.
        </p>
        <button
          disabled
          title="Payments launch in Phase 2"
          className="w-full rounded-full py-3 font-medium bg-paper-dim text-ink-soft cursor-not-allowed"
        >
          Pay {INDIVIDUAL_FEE} &amp; pursue my case — coming soon
        </button>
      </div>

      <p className="text-center mt-8 text-sm">
        <Link to="/result" className="text-ink-soft hover:text-ink font-medium">
          ← Back to my case summary
        </Link>
      </p>
    </div>
  )
}

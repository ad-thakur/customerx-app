import { Link } from 'react-router-dom'
import { GROUP_CLAIMS, GROUP_JOIN_FEE } from '../lib/groups'
import Chip, { statusTone } from '../components/Chip'

const HOW_IT_WORKS = [
  {
    n: '01',
    title: 'Organise by failure',
    body: 'Every claim is tagged by company, product and the specific defect or practice behind it.',
  },
  {
    n: '02',
    title: 'Cluster the matches',
    body: "When enough substantially similar claims land, they form a coordinated group under the Act's representative-complaint route.",
  },
  {
    n: '03',
    title: 'Quantify exposure',
    body: 'We total the combined claim value, so the company sees the real liability, not one stray ticket.',
  },
  {
    n: '04',
    title: 'Coordinated notice',
    body: 'One notice on behalf of all claimants opens a shared settlement window — with filing as the credible next step.',
  },
]

export default function ClaimAggregation() {
  const featured = GROUP_CLAIMS[0]
  const others = GROUP_CLAIMS.slice(1)

  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-4">
        <p className="case-number text-seal text-sm mb-3">CLAIM AGGREGATION</p>
        <h1 className="font-display text-4xl md:text-5xl leading-[1.1] tracking-tight text-ink max-w-3xl">
          You're rarely the only one.
          <br />
          <span className="italic text-seal">Together, you're a liability.</span>
        </h1>
        <p className="mt-6 text-lg text-ink-soft max-w-2xl">
          A company can wait out one complaint — the courts are slow, and they know it. What they
          can't wait out is a hundred of the same complaint, coordinated, with a combined number
          attached. Consumer X groups substantially similar claims by company, product and failure,
          so you file alongside everyone else the same company wronged — and negotiate from
          concentrated strength.
        </p>
        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
            <p className="font-display text-3xl text-ink">6</p>
            <p className="text-sm text-ink-soft">Active group claims</p>
          </div>
          <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
            <p className="font-display text-3xl text-ink">2,400</p>
            <p className="text-sm text-ink-soft">Consumers coordinating right now</p>
          </div>
          <div className="border border-line rounded-lg bg-white/70 p-6 text-center">
            <p className="font-display text-3xl text-ink">₹1.19 Cr</p>
            <p className="text-sm text-ink-soft">Combined claim value in play</p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-ink text-paper py-16 mt-14">
        <div className="mx-auto max-w-6xl px-6">
          <p className="case-number text-marigold-dim text-sm mb-3">HOW A GROUP CLAIM WORKS</p>
          <h2 className="font-display text-3xl md:text-4xl mb-10 max-w-xl">
            One shared file. Many claimants. A single number the company has to answer.
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.n} className="border-t border-paper/20 pt-5">
                <p className="case-number text-marigold-dim text-xl mb-3">{s.n}</p>
                <h3 className="font-display text-lg mb-1.5">{s.title}</h3>
                <p className="text-sm text-paper/70 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED CLUSTER */}
      <section className="mx-auto max-w-6xl px-6 pt-16">
        <p className="case-number text-seal text-sm mb-3">OPEN NOW · JOINABLE</p>
        <div className="border border-line border-l-4 border-l-marigold rounded-lg bg-white/70 p-7">
          <div className="flex flex-wrap justify-between gap-5">
            <div className="max-w-xl">
              <div className="flex flex-wrap gap-2 mb-3">
                <Chip tone="navy">GROUP CLAIM · {featured.id}</Chip>
                <Chip tone={statusTone(featured.status)}>{featured.statusLabel.toUpperCase()}</Chip>
              </div>
              <h3 className="font-display text-2xl text-ink mb-1.5">{featured.issue}</h3>
              <p className="text-sm text-ink-soft">
                {featured.section} · Service centres acknowledged the defect in writing, then refused
                replacement or refund. A joint notice went out on behalf of every claimant; the
                30-day settlement window is running.
              </p>
            </div>
            <div className="text-right min-w-[150px]">
              <p className="font-display text-4xl text-ink leading-none">{featured.combinedValue}</p>
              <p className="text-sm text-ink-soft">combined claim value</p>
              <p className="font-display text-2xl text-ink leading-none mt-3">{featured.count}</p>
              <p className="text-sm text-ink-soft">claimants so far</p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              to="/join-claim"
              className="bg-seal text-paper px-6 py-3 rounded-full font-medium hover:bg-ink transition-colors"
            >
              Join {featured.count} others — {GROUP_JOIN_FEE} →
            </Link>
            <span className="text-sm text-ink-soft">One fixed fee to join. No cut of your recovery.</span>
          </div>
        </div>
      </section>

      {/* OTHER CLUSTERS */}
      <section className="mx-auto max-w-6xl px-6 pt-12 pb-8">
        <div className="flex justify-between items-baseline mb-5">
          <h2 className="font-display text-2xl md:text-3xl text-ink">
            More companies people are claiming against
          </h2>
          <span className="text-sm text-ink-soft">Illustrative · fictional companies</span>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {others.map((g) => (
            <div key={g.id} className={`border border-line rounded-lg p-6 ${g.status === 'settled' ? 'bg-white/40' : 'bg-white/70'}`}>
              <Chip tone={statusTone(g.status)}>{g.statusLabel.toUpperCase()}</Chip>
              <h3 className="font-display text-lg text-ink mt-3 mb-1">
                {g.company} — {g.issue}
              </h3>
              <p className="text-sm text-ink-soft">{g.section}</p>
              <div className="flex justify-between items-end mt-4">
                <div>
                  <p className="font-display text-2xl text-ink leading-none">{g.count.toLocaleString('en-IN')}</p>
                  <p className="text-sm text-ink-soft">{g.target ? `of ${g.target} to trigger notice` : 'claimants'}</p>
                </div>
                <div className="text-right">
                  <p className={`font-display text-2xl leading-none ${g.status === 'settled' ? 'text-verdict' : 'text-ink'}`}>
                    {g.combinedValue}
                  </p>
                  <p className="text-sm text-ink-soft">{g.status === 'settled' ? 'recovered' : 'combined value'}</p>
                </div>
              </div>
              {g.target && (
                <div className="h-2 rounded-full bg-white border border-line overflow-hidden mt-4">
                  <div className="h-full bg-marigold" style={{ width: `${Math.round((g.count / g.target) * 100)}%` }} />
                </div>
              )}
              {g.status === 'settled' ? (
                <button
                  disabled
                  className="w-full mt-5 rounded-full py-2.5 font-medium bg-paper-dim text-ink-soft cursor-not-allowed"
                >
                  Closed — resolved for all claimants
                </button>
              ) : (
                <Link
                  to="/join-claim"
                  className="block text-center w-full mt-5 rounded-full py-2.5 font-medium border border-line text-ink hover:border-ink transition-colors"
                >
                  Join this claim
                </Link>
              )}
            </div>
          ))}

          {/* Start your own */}
          <div className="border border-dashed border-line rounded-lg p-6 flex flex-col justify-center text-center">
            <h3 className="font-display text-lg text-ink mb-1.5">Don't see your company?</h3>
            <p className="text-sm text-ink-soft mb-4">
              Start a claim and you become the first — others wronged the same way can join you, and
              the group builds from there.
            </p>
            <Link
              to="/file"
              className="self-center bg-ink text-paper px-6 py-2.5 rounded-full font-medium hover:bg-seal transition-colors"
            >
              Start a claim
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24 pt-6">
        <div className="bg-marigold-dim/40 border border-marigold rounded-2xl px-10 py-14 text-center">
          <h2 className="font-display text-3xl md:text-4xl text-ink mb-4">
            Alone, it's a complaint. Together, it's a case they can't ignore.
          </h2>
          <p className="text-ink-soft max-w-xl mx-auto mb-8">
            Add your claim in a few minutes. If a group already exists, you join it. If not, you
            start it.
          </p>
          <Link
            to="/file"
            className="inline-block bg-ink text-paper px-7 py-3.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            Add my claim
          </Link>
        </div>
      </section>
    </>
  )
}

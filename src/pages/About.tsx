import { Link } from 'react-router-dom'
import {
  SpuriousProductsIcon,
  DeficientServiceIcon,
  DefectiveGoodsIcon,
  UnfairTradePracticeIcon,
} from '../components/EvidenceIcons'

const PATTERNS = [
  {
    Icon: SpuriousProductsIcon,
    title: 'Spurious products',
    body: 'Fakes and counterfeits sold with genuine packaging, genuine invoices, and zero accountability when they fail.',
  },
  {
    Icon: DeficientServiceIcon,
    title: 'Deficient service',
    body: 'Money paid upfront, promises made in writing, and a service that never quite delivers what it committed to.',
  },
  {
    Icon: DefectiveGoodsIcon,
    title: 'Defective goods',
    body: 'Products that break, malfunction, or arrive damaged — and a seller who suddenly stops responding.',
  },
  {
    Icon: UnfairTradePracticeIcon,
    title: 'Unfair trade practices',
    body: 'Bait pricing, false claims, hidden terms — tactics designed to win a sale, not earn trust.',
  },
]

const STATS = [
  { value: '5,00,000+', label: 'Consumer cases pending across commissions nationwide' },
  { value: '1 in 3', label: 'Cases pending over three years, against a 3–5 month legal promise' },
  { value: '~40%', label: 'Consumer commission member posts sitting vacant' },
]

const BELIEFS = [
  'Every Indian has the right to be heard — not just the ones who can afford to wait it out.',
  'A broken product or a broken promise deserves a real remedy, not a shrug and a support ticket.',
  "You shouldn't need a law degree to use a law that was written for you.",
  'Justice delayed by paperwork is still justice delayed.',
]

function TricolorRule() {
  return (
    <div
      className="h-1 w-24 rounded-full"
      style={{ background: 'linear-gradient(to right, var(--color-marigold), var(--color-paper-dim), var(--color-verdict))' }}
    />
  )
}

export default function About() {
  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center">
        <p className="case-number text-seal text-sm mb-5 tracking-wide">OUR MANIFESTO</p>
        <h1 className="font-display text-4xl md:text-5xl leading-[1.15] tracking-tight text-ink mb-6">
          Millions of Indians are wronged every year.
          <br />
          <span className="italic text-seal">Most never even try to fight back.</span>
        </h1>
        <p className="text-lg text-ink-soft max-w-2xl mx-auto mb-8">
          Spurious products sold as genuine. Services that fall short of what was promised. Goods
          that break the day the warranty ends. Trade practices designed to mislead. We've watched
          this happen for years — not because Indians lack rights, but because the system meant to
          enforce those rights is overloaded, slow, and built for people who already have a lawyer
          on retainer. Consumer X exists to close that gap.
        </p>
        <div className="flex justify-center mb-9">
          <TricolorRule />
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/file"
            className="bg-ink text-paper px-7 py-3.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            Start your complaint — it's free
          </Link>
          <a href="#pattern" className="text-ink-soft font-medium hover:text-ink transition-colors">
            See what we mean ↓
          </a>
        </div>
      </section>

      {/* THE PATTERN */}
      <section id="pattern" className="mx-auto max-w-6xl px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">WHAT WE'VE SEEN</p>
        <h2 className="font-display text-3xl md:text-4xl mb-12 max-w-xl">
          Four ways Indians get shortchanged, over and over.
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PATTERNS.map(({ Icon, title, body }) => (
            <div key={title} className="border border-line rounded-lg p-5 bg-white/60">
              <Icon className="w-7 h-7 text-seal mb-4" />
              <h3 className="font-display text-lg text-ink mb-1.5">{title}</h3>
              <p className="text-sm text-ink-soft leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY NOTHING CHANGES */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">THE REAL PROBLEM</p>
        <h2 className="font-display text-3xl md:text-4xl mb-6 max-w-2xl">
          It's not that Indians don't have rights. It's that almost no one can act on them in time.
        </h2>
        <p className="text-ink-soft max-w-2xl mb-12 leading-relaxed">
          Even where the law is clear, the system enforcing it is buried. And where the system is
          slow, most people never file at all — the process feels built for advocates, not for
          someone holding a receipt and a grievance. Companies learn that complaints simply go away.
        </p>
        <div className="grid sm:grid-cols-3 gap-5 mb-4">
          {STATS.map((s) => (
            <div key={s.label} className="border border-line rounded-lg p-6 bg-white/60">
              <p className="font-display text-3xl text-ink mb-2">{s.value}</p>
              <p className="text-sm text-ink-soft leading-relaxed">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-ink-soft/70">Source: India Justice Report, 2026.</p>
      </section>

      {/* MANIFESTO */}
      <section className="bg-ink text-paper py-20">
        <div className="mx-auto max-w-4xl px-6">
          <p className="case-number text-marigold-dim text-sm mb-3">WHAT WE BELIEVE</p>
          <h2 className="font-display text-3xl md:text-4xl mb-12 max-w-xl">
            This shouldn't be this hard.
          </h2>
          <ul className="space-y-6">
            {BELIEFS.map((b) => (
              <li key={b} className="font-display text-xl md:text-2xl leading-snug border-t border-paper/20 pt-6">
                {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* THE MULTIPLIER EFFECT */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">WHY IT MATTERS</p>
        <h2 className="font-display text-3xl md:text-4xl mb-12 max-w-xl">
          Every claim filed does two things.
        </h2>
        <div className="grid md:grid-cols-2 gap-10">
          <div className="border-t border-line pt-6">
            <h3 className="font-display text-xl text-ink mb-2">It gets you what you're owed.</h3>
            <p className="text-ink-soft leading-relaxed">
              A refund, a repair, a replacement, or compensation — the resolution the law already
              entitles you to, without needing to fight the process alone.
            </p>
          </div>
          <div className="border-t border-line pt-6">
            <h3 className="font-display text-xl text-ink mb-2">It makes the next person's fight shorter.</h3>
            <p className="text-ink-soft leading-relaxed">
              One complaint is a data point. A thousand identical complaints against the same
              company is a pattern that regulators, commissions, and courts can't ignore. Every
              case filed adds pressure the system has to respond to.
            </p>
          </div>
        </div>
        <p className="font-display text-xl md:text-2xl text-ink mt-12 max-w-2xl">
          We're not just here to win your case.{' '}
          <span className="italic text-seal">We're here to make winning less necessary.</span>
        </p>
      </section>

      {/* CLOSING CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="bg-marigold-dim/40 border border-marigold rounded-2xl px-10 py-14 text-center">
          <h2 className="font-display text-3xl md:text-4xl text-ink mb-4">
            You don't need permission to stand up for yourself.
          </h2>
          <p className="text-ink-soft max-w-xl mx-auto mb-8">You just need a place to start.</p>
          <Link
            to="/file"
            className="inline-block bg-ink text-paper px-7 py-3.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            Start your complaint
          </Link>
        </div>
      </section>
    </>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GROUNDS } from '../lib/grounds'
import StatuteModal from '../components/StatuteModal'
import {
  DefectiveGoodsIcon,
  OverchargingIcon,
  HazardousGoodsIcon,
  MisleadingAdIcon,
} from '../components/EvidenceIcons'

const EVIDENCE_TAGS = [
  { Icon: DefectiveGoodsIcon, label: 'Defective or deficient goods' },
  { Icon: OverchargingIcon, label: 'Overcharging past the listed price' },
  { Icon: HazardousGoodsIcon, label: 'Hazardous goods, sold knowingly' },
  { Icon: MisleadingAdIcon, label: 'Misleading advertisement' },
]

export default function Home() {
  const [openGroundId, setOpenGroundId] = useState<string | null>(null)
  const openGround = GROUNDS.find((g) => g.id === openGroundId) ?? null

  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 grid md:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
        <div>
          <h1 className="font-display text-5xl md:text-6xl leading-[1.05] tracking-tight text-ink">
            Deficient product.
            <br />
            Deficient service.
            <br />
            <span className="italic text-seal">Real recourse.</span>
          </h1>
          <p className="mt-7 text-lg text-ink max-w-lg font-medium">
            Companies count on complaints being too much effort to pursue — especially the ones that
            do it repeatedly. Consumer X exists so you can push back, on equal footing, using the law
            that already protects you.
          </p>
          <p className="mt-4 text-lg text-ink-soft max-w-lg">
            Tell us what happened once. We work out which Consumer Commission your case belongs in,
            draft the notice that goes to the company, and take it all the way to filing if they
            don't respond.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/file"
              className="bg-ink text-paper px-7 py-3.5 rounded-full font-medium hover:bg-seal transition-colors"
            >
              Start your complaint — it's free
            </Link>
            <a href="#how-it-works" className="text-ink-soft font-medium hover:text-ink transition-colors">
              See how it works ↓
            </a>
          </div>
          <p className="mt-6 text-sm text-ink-soft/80">
            No advocate required to file. No cost unless the company ignores you — and if they do, we
            step in.
          </p>
        </div>

        {/* Signature element: a "notice" document with a stamp */}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="bg-white border border-line rounded-sm shadow-[6px_6px_0_0_var(--color-line)] p-7 rotate-1">
            <p className="case-number text-xs text-ink-soft">REF/CX/2026/00417</p>
            <p className="font-display text-xl mt-3 text-ink">Notice of Deficiency</p>
            <div className="mt-4 space-y-2">
              <div className="h-2.5 bg-paper-dim rounded-full w-full" />
              <div className="h-2.5 bg-paper-dim rounded-full w-[92%]" />
              <div className="h-2.5 bg-paper-dim rounded-full w-[76%]" />
              <div className="h-2.5 bg-paper-dim rounded-full w-[85%]" />
            </div>
            <p className="mt-5 text-xs text-ink-soft">Response required within</p>
            <p className="font-display text-3xl text-ink">30 days</p>
          </div>
          <div className="seal absolute -right-6 -bottom-6 w-28 h-28 bg-paper border-seal text-seal shadow-lg -rotate-12">
            <span className="text-center text-xs font-semibold leading-tight">
              SENT ON
              <br />
              YOUR BEHALF
            </span>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-3">
            {EVIDENCE_TAGS.map(({ Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 bg-white/70 border border-line rounded-lg p-3"
              >
                <Icon className="w-5 h-5 text-seal shrink-0" />
                <span className="text-xs font-medium text-ink leading-snug">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-ink text-paper py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="case-number text-marigold-dim text-sm mb-3">THE PROCESS</p>
          <h2 className="font-display text-3xl md:text-4xl mb-14 max-w-xl">
            Three stages, one continuous case file.
          </h2>
          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                n: '01',
                title: 'File and find out',
                body:
                  'Enter the details of your case and upload evidence. We tell you, free, which Commission (District, State, or National) your claim belongs in, how long you have left to file under the 2-year limitation period, and exactly what to do next.',
              },
              {
                n: '02',
                title: 'Notice, then wait',
                body:
                  'We identify the company\u2019s grievance contact and send a pre-litigation notice at no cost. They get 30 days to respond.',
              },
              {
                n: '03',
                title: 'Formal filing, if needed',
                body:
                  'No response? Pay a single upfront fee and we assemble the filing, involve an advocate, and carry it through to resolution.',
              },
            ].map((step) => (
              <div key={step.n} className="border-t border-paper/20 pt-6">
                <p className="case-number text-marigold-dim text-2xl mb-4">{step.n}</p>
                <h3 className="font-display text-xl mb-2">{step.title}</h3>
                <p className="text-paper/70 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GROUNDS */}
      <section id="grounds" className="mx-auto max-w-6xl px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">SEVEN STATUTORY GROUNDS</p>
        <h2 className="font-display text-3xl md:text-4xl mb-4 max-w-xl">
          If your case fits one of these, you likely have a claim.
        </h2>
        <p className="text-ink-soft max-w-2xl mb-12">
          Every complaint accepted under the Consumer Protection Act, 2019 falls under Section 2(6).
          We ask a few questions and match your situation automatically.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {GROUNDS.map((g) => (
            <button
              key={g.id}
              onClick={() => setOpenGroundId(g.id)}
              className="text-left border border-line rounded-lg p-5 bg-white/60 hover:bg-white hover:shadow-sm transition"
            >
              <p className="case-number text-xs text-seal mb-2">{g.section}</p>
              <h3 className="font-display text-lg text-ink mb-1.5">{g.label}</h3>
              <p className="text-sm text-ink-soft leading-relaxed mb-3">{g.description}</p>
              <p className="text-xs font-medium text-ink-soft underline underline-offset-2">
                Read the exact text of the Act
              </p>
            </button>
          ))}
        </div>
      </section>

      {openGround && <StatuteModal ground={openGround} onClose={() => setOpenGroundId(null)} />}

      {/* PRICING */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">PRICING</p>
        <h2 className="font-display text-3xl md:text-4xl mb-12 max-w-xl">
          You pay when there's a case worth fighting.
        </h2>
        <div className="grid md:grid-cols-4 gap-5">
          {[
            { title: 'Intake & evidence', price: 'Free', note: 'Always free, no matter the outcome' },
            { title: 'Success & recovery estimate', price: '₹499', note: 'One-time, optional assessment' },
            { title: 'Pre-litigation notice', price: 'Free', note: 'Drafted and sent on your behalf' },
            { title: 'Filing, if no response', price: '₹5,000', note: 'Covers filing and advocate involvement' },
          ].map((tier) => (
            <div key={tier.title} className="border border-line rounded-lg p-6 bg-white/60 flex flex-col">
              <p className="text-sm text-ink-soft mb-3">{tier.title}</p>
              <p className="font-display text-3xl text-ink mb-3">{tier.price}</p>
              <p className="text-xs text-ink-soft mt-auto">{tier.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="bg-marigold-dim/40 border border-marigold rounded-2xl px-10 py-14 text-center">
          <h2 className="font-display text-3xl md:text-4xl text-ink mb-4">
            Your two-year window doesn't wait.
          </h2>
          <p className="text-ink-soft max-w-xl mx-auto mb-8">
            Complaints must be filed within two years of the incident. Start now and we'll tell you
            exactly where things stand.
          </p>
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

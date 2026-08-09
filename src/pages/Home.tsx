import { useState } from 'react'
import { Link } from 'react-router-dom'
import { GROUNDS } from '../lib/grounds'
import { GROUP_CLAIMS } from '../lib/groups'
import StatuteModal from '../components/StatuteModal'
import Chip, { statusTone } from '../components/Chip'
import {
  DefectiveGoodsIcon,
  OverchargingIcon,
  HazardousGoodsIcon,
  MisleadingAdIcon,
} from '../components/EvidenceIcons'

const HOME_CLUSTERS = [GROUP_CLAIMS[0], GROUP_CLAIMS[1], GROUP_CLAIMS[3]] // Vayu, Nimbus, Zephyr

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
            Tell us what happened once. We work out which Consumer Commission your case belongs in
            and draft the notice to the company, ready for you to send — and where others have been
            wronged the same way, we bring your claims together so the company faces all of you at
            once.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              to="/file"
              className="bg-ink text-paper px-7 py-3.5 rounded-full font-medium hover:bg-seal transition-colors"
            >
              Start your claim — it's free
            </Link>
            <Link to="/claim-aggregation" className="text-ink-soft font-medium hover:text-ink transition-colors">
              Browse group claims →
            </Link>
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
              READY TO
              <br />
              SEND
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

      {/* AGGREGATION BAND */}
      <section id="aggregation" className="mx-auto max-w-6xl px-6 pt-4 pb-4">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <div>
            <p className="case-number text-seal text-sm mb-3">STRENGTH IN NUMBERS</p>
            <h2 className="font-display text-3xl md:text-4xl max-w-2xl text-ink">
              A company can wait out one of you. Not a hundred of you.
            </h2>
          </div>
          <Link to="/claim-aggregation" className="text-ink-soft font-medium hover:text-ink whitespace-nowrap">
            See all group claims →
          </Link>
        </div>
        <p className="text-ink-soft max-w-2xl mt-3 mb-8">
          When many people are wronged the same way by the same company, Consumer X groups the claims
          — by company, product and failure — and puts one combined number in front of the brand.
          Isolated complaints get ignored. Concentrated liability gets settled.
        </p>
        <div className="grid sm:grid-cols-3 gap-5">
          {HOME_CLUSTERS.map((g) => (
            <Link
              key={g.id}
              to="/claim-aggregation"
              className={`border border-line rounded-lg bg-white/70 p-5 hover:bg-white hover:shadow-sm transition ${
                g.status === 'collecting' ? 'border-l-4 border-l-seal' : 'border-l-4 border-l-marigold'
              }`}
            >
              <Chip tone={statusTone(g.status)}>{g.statusLabel.toUpperCase()}</Chip>
              <h3 className="font-display text-lg text-ink mt-3 mb-1">{g.company}</h3>
              <p className="text-sm text-ink-soft">{g.section}</p>
              <div className="flex justify-between mt-4 text-sm">
                <span>
                  <span className="font-semibold text-ink">{g.count.toLocaleString('en-IN')}</span>{' '}
                  <span className="text-ink-soft">claimants</span>
                </span>
                <span>
                  <span className="font-semibold text-ink">{g.combinedValue}</span>{' '}
                  <span className="text-ink-soft">combined</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="bg-ink text-paper py-20 mt-16">
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
            { title: 'Intake & eligibility', price: 'Free', note: 'Always free, no matter the outcome' },
            { title: 'Recovery assessment', price: '₹499', note: 'One-time, optional' },
            { title: 'Join a group claim', price: '₹5,000', note: 'Fixed fee, no cut of your recovery' },
            { title: 'Pursue individually', price: '₹5,500', note: 'Individual filing + advocate' },
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

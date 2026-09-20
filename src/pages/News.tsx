import { useMemo, useState } from 'react'
import Chip from '../components/Chip'
import { NEWS_SEED, CATEGORY_LABEL, type NewsArticle, type NewsCategory } from '../lib/newsSeed'

function TricolorRule() {
  return (
    <div
      className="h-1 w-24 rounded-full mx-auto"
      style={{
        background:
          'linear-gradient(to right, var(--color-marigold), var(--color-paper-dim), var(--color-verdict))',
      }}
    />
  )
}

const CATEGORY_TONE: Record<NewsCategory, 'gold' | 'seal' | 'verdict'> = {
  law: 'gold',
  breach: 'seal',
  action: 'verdict',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Host name shown next to the "Read on …" link, e.g. livelaw.in. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <article className="border border-line rounded-2xl bg-paper-dim/40 p-6 md:p-7 transition-colors hover:border-ink/25">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="case-number text-[11px] tracking-wide text-ink-soft uppercase">
          {article.source} · {formatDate(article.publishedAt)}
        </span>
        <Chip tone={CATEGORY_TONE[article.category]}>{CATEGORY_LABEL[article.category]}</Chip>
      </div>

      <h2 className="font-display text-xl md:text-2xl leading-snug tracking-tight text-ink mb-3">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-seal transition-colors"
        >
          {article.title}
        </a>
      </h2>

      <p className="text-ink-soft leading-relaxed mb-5">{article.summary}</p>

      <div className="flex flex-wrap items-center gap-2">
        {article.companies.map((c) => (
          <Chip key={c} tone="navy">
            {c}
          </Chip>
        ))}
        {article.sectors.map((s) => (
          <Chip key={s} tone="gold" className="opacity-90">
            {s}
          </Chip>
        ))}
      </div>

      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-5 text-sm font-medium text-seal hover:text-ink transition-colors"
      >
        Read on {hostOf(article.url)} <span aria-hidden>↗</span>
      </a>
    </article>
  )
}

export default function News() {
  const [category, setCategory] = useState<NewsCategory | 'all'>('all')
  const [sector, setSector] = useState<string | null>(null)

  // Every sector present in the corpus, for the filter row.
  const allSectors = useMemo(
    () => [...new Set(NEWS_SEED.flatMap((a) => a.sectors))].sort((a, b) => a.localeCompare(b)),
    [],
  )

  const articles = useMemo(() => {
    return NEWS_SEED.filter(
      (a) =>
        (category === 'all' || a.category === category) &&
        (sector === null || a.sectors.includes(sector)),
    ).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
  }, [category, sector])

  const tabs: Array<{ key: NewsCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'law', label: CATEGORY_LABEL.law },
    { key: 'breach', label: CATEGORY_LABEL.breach },
    { key: 'action', label: CATEGORY_LABEL.action },
  ]

  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center">
        <p className="case-number text-seal text-sm mb-5 tracking-wide">CONSUMER WATCH</p>
        <h1 className="font-display text-4xl md:text-5xl leading-[1.15] tracking-tight text-ink mb-6">
          What the papers are reporting.
        </h1>
        <p className="text-lg text-ink-soft max-w-2xl mx-auto mb-8">
          A curated index of third-party reporting on consumer rights in India — new laws and rules,
          findings against companies, and consumers taking action under the Consumer Protection Act.
          We summarise and link; the full story stays with the publisher.
        </p>
        <TricolorRule />
      </section>

      {/* CONTROLS */}
      <section className="mx-auto max-w-3xl px-6">
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setCategory(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                category === t.key
                  ? 'bg-ink text-paper border-ink'
                  : 'border-line text-ink-soft hover:text-ink hover:border-ink/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center items-center gap-2 mb-2">
          <span className="case-number text-[11px] uppercase tracking-wide text-ink-soft mr-1">
            Sector
          </span>
          <button
            type="button"
            onClick={() => setSector(null)}
            className={`case-number text-[11px] tracking-wide px-3 py-1 rounded-full border transition-colors ${
              sector === null
                ? 'bg-ink/5 border-ink/25 text-ink'
                : 'border-line text-ink-soft hover:border-ink/30'
            }`}
          >
            All
          </button>
          {allSectors.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSector((cur) => (cur === s ? null : s))}
              className={`case-number text-[11px] tracking-wide px-3 py-1 rounded-full border transition-colors ${
                sector === s
                  ? 'bg-ink/5 border-ink/25 text-ink'
                  : 'border-line text-ink-soft hover:border-ink/30'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* LIST */}
      <section className="mx-auto max-w-3xl px-6 pt-6 pb-16">
        <p className="case-number text-[11px] uppercase tracking-wide text-ink-soft mb-4">
          {articles.length} article{articles.length === 1 ? '' : 's'}
        </p>

        <div className="flex flex-col gap-5">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
          {articles.length === 0 && (
            <p className="text-ink-soft text-center py-10">
              No articles match this filter yet.
            </p>
          )}
        </div>

        <p className="text-xs text-ink-soft/80 mt-10 leading-relaxed border-t border-line pt-6">
          Summaries are written by Consumer X for awareness only and attribute the reporting source;
          full articles remain on the publishers' websites. This page is a news index, not legal
          advice. Companies are named as reported by third-party sources.
        </p>
      </section>
    </>
  )
}

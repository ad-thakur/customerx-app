import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import NewsCard from '../components/NewsCard'
import { useAuth } from '../lib/AuthContext'
import { fetchPublished, type NewsItem } from '../lib/newsApi'
import { NEWS_SEED, CATEGORY_LABEL, type NewsCategory } from '../lib/newsSeed'
import { BRAND_NAME } from '../lib/brand'

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

export default function News() {
  const { user } = useAuth()
  // Start with the curated seed so the page is never blank; swap in live
  // published articles once the API returns any.
  const [articles, setArticles] = useState<NewsItem[]>(NEWS_SEED)
  const [category, setCategory] = useState<NewsCategory | 'all'>('all')
  const [sector, setSector] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchPublished()
      .then((list) => {
        if (alive && list.length) setArticles(list)
      })
      .catch(() => {
        /* API not reachable yet — keep the seed. */
      })
    return () => {
      alive = false
    }
  }, [])

  // Sectors present within the selected category, so the filter row never
  // offers a sector that would return nothing. Switching category resets it.
  const allSectors = useMemo(
    () =>
      [
        ...new Set(
          articles
            .filter((a) => category === 'all' || a.category === category)
            .flatMap((a) => a.sectors),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [articles, category],
  )

  const visible = useMemo(
    () =>
      articles
        .filter(
          (a) =>
            (category === 'all' || a.category === category) &&
            (sector === null || a.sectors.includes(sector)),
        )
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')),
    [articles, category, sector],
  )

  const tabs: Array<{ key: NewsCategory | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'law', label: CATEGORY_LABEL.law },
    { key: 'breach', label: CATEGORY_LABEL.breach },
    { key: 'action', label: CATEGORY_LABEL.action },
  ]

  return (
    <>
      {/* HERO */}
      <section className="mx-auto max-w-3xl px-6 pt-16 pb-10 text-center relative">
        {user && (
          <Link
            to="/news/review"
            className="absolute right-6 top-16 hidden sm:inline-block case-number text-[11px] uppercase tracking-wide text-ink-soft hover:text-ink transition-colors"
          >
            Review queue →
          </Link>
        )}
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
              onClick={() => {
                setCategory(t.key)
                setSector(null)
              }}
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
          {visible.length} article{visible.length === 1 ? '' : 's'}
        </p>

        <div className="flex flex-col gap-5">
          {visible.map((a) => (
            <NewsCard key={a.id} article={a} />
          ))}
          {visible.length === 0 && (
            <p className="text-ink-soft text-center py-10">No articles match this filter yet.</p>
          )}
        </div>

        <p className="text-xs text-ink-soft/80 mt-10 leading-relaxed border-t border-line pt-6">
          Summaries are written by {BRAND_NAME} for awareness only and attribute the reporting source;
          full articles remain on the publishers' websites. This page is a news index, not legal
          advice. Companies are named as reported by third-party sources.
        </p>
      </section>
    </>
  )
}

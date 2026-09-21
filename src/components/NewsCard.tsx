import type { ReactNode } from 'react'
import Chip from './Chip'
import { CATEGORY_LABEL, type NewsCategory } from '../lib/newsSeed'
import type { NewsItem } from '../lib/newsApi'

const CATEGORY_TONE: Record<NewsCategory, 'gold' | 'seal' | 'verdict'> = {
  law: 'gold',
  breach: 'seal',
  action: 'verdict',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Host shown next to the "Read on …" link, e.g. livelaw.in. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** One article card. `footer` lets the review queue add approve/reject actions. */
export default function NewsCard({ article, footer }: { article: NewsItem; footer?: ReactNode }) {
  const date = formatDate(article.publishedAt)
  return (
    <article className="border border-line rounded-2xl bg-paper-dim/40 p-6 md:p-7 transition-colors hover:border-ink/25">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="case-number text-[11px] tracking-wide text-ink-soft uppercase">
          {article.source}
          {date ? ` · ${date}` : ''}
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

      {(article.companies.length > 0 || article.sectors.length > 0) && (
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
      )}

      <div className="flex items-center justify-between gap-3 mt-5 flex-wrap">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-seal hover:text-ink transition-colors"
        >
          Read on {hostOf(article.url)} <span aria-hidden>↗</span>
        </a>
        {footer}
      </div>
    </article>
  )
}

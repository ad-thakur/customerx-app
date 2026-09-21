import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

// Same connection convention as precedentStore.ts — Railway injects DATABASE_URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export type NewsCategory = 'law' | 'breach' | 'action'
export type NewsStatus = 'draft' | 'published' | 'rejected'

export interface NewsArticle {
  id: string
  url: string
  title: string
  source: string
  /** YYYY-MM-DD, or null when the source gave no date. */
  publishedAt: string | null
  summary: string
  companies: string[]
  sectors: string[]
  category: NewsCategory
  status: NewsStatus
}

/** Stable id for an article, derived from its URL so re-fetches map to one row. */
export function articleId(url: string): string {
  return crypto.createHash('sha1').update(url).digest('hex').slice(0, 16)
}

export async function initNewsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      url TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      source TEXT NOT NULL,
      published_at DATE,
      summary TEXT NOT NULL,
      companies TEXT[] NOT NULL DEFAULT '{}',
      sectors TEXT[] NOT NULL DEFAULT '{}',
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS news_articles_status_idx ON news_articles (status)`)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS news_articles_published_idx ON news_articles (published_at DESC)`,
  )
}

function rowToArticle(r: {
  id: string
  url: string
  title: string
  source: string
  published_at: Date | null
  summary: string
  companies: string[]
  sectors: string[]
  category: string
  status: string
}): NewsArticle {
  return {
    id: r.id,
    url: r.url,
    title: r.title,
    source: r.source,
    publishedAt: r.published_at ? r.published_at.toISOString().slice(0, 10) : null,
    summary: r.summary,
    companies: r.companies,
    sectors: r.sectors,
    category: r.category as NewsCategory,
    status: r.status as NewsStatus,
  }
}

/** Every URL already seen, so the agent skips articles it has processed. */
export async function knownUrls(): Promise<Set<string>> {
  const res = await pool.query<{ url: string }>(`SELECT url FROM news_articles`)
  return new Set(res.rows.map((r) => r.url))
}

/**
 * Insert a freshly-curated article as a draft. Idempotent on URL — a re-run
 * never creates a duplicate and never resurrects one that was rejected.
 * Returns true only when a new row was actually written.
 */
export async function insertDraft(a: Omit<NewsArticle, 'id' | 'status'>): Promise<boolean> {
  const res = await pool.query(
    `INSERT INTO news_articles
       (id, url, title, source, published_at, summary, companies, sectors, category, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
     ON CONFLICT (url) DO NOTHING`,
    [
      articleId(a.url),
      a.url,
      a.title,
      a.source,
      a.publishedAt,
      a.summary,
      a.companies,
      a.sectors,
      a.category,
    ],
  )
  return (res.rowCount ?? 0) > 0
}

async function listByStatus(status: NewsStatus, limit: number): Promise<NewsArticle[]> {
  const res = await pool.query(
    `SELECT id, url, title, source, published_at, summary, companies, sectors, category, status
       FROM news_articles
      WHERE status = $1
      ORDER BY published_at DESC NULLS LAST, ingested_at DESC
      LIMIT $2`,
    [status, limit],
  )
  return res.rows.map(rowToArticle)
}

/** Public feed for the /news page. */
export function listPublished(limit = 60): Promise<NewsArticle[]> {
  return listByStatus('published', limit)
}

/** Review queue — drafts awaiting a human decision. */
export function listDrafts(limit = 100): Promise<NewsArticle[]> {
  return listByStatus('draft', limit)
}

/** Approve or reject a draft. Only affects rows still in 'draft'. */
export async function setStatus(id: string, status: NewsStatus): Promise<boolean> {
  const res = await pool.query(
    `UPDATE news_articles SET status = $2 WHERE id = $1 AND status = 'draft'`,
    [id, status],
  )
  return (res.rowCount ?? 0) > 0
}

export async function closeNewsPool(): Promise<void> {
  await pool.end()
}

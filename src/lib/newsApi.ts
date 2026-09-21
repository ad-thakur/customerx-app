// Client for the Consumer Watch API (server/src/index.ts).
//
// Public reads need no auth; the review queue and publish/reject actions send
// the signed-in bearer token and require a news admin (NEWS_ADMIN_EMAILS).

import { getSession } from './auth'
import type { NewsCategory } from './newsSeed'

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export interface NewsItem {
  id: string
  url: string
  title: string
  source: string
  publishedAt: string | null
  summary: string
  companies: string[]
  sectors: string[]
  category: NewsCategory
}

function authHeaders(): Record<string, string> {
  const s = getSession()
  return s ? { Authorization: `Bearer ${s}` } : {}
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    return body.error ?? fallback
  } catch {
    return fallback
  }
}

/** Published articles for the public /news page. */
export async function fetchPublished(): Promise<NewsItem[]> {
  const res = await fetch(`${API}/api/news`)
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to load news (${res.status})`))
  const data = (await res.json()) as { articles: NewsItem[] }
  return data.articles
}

/** The review queue — agent proposals awaiting approval. Admin only. */
export async function fetchDrafts(): Promise<NewsItem[]> {
  const res = await fetch(`${API}/api/news/drafts`, { headers: authHeaders() })
  if (!res.ok) throw new Error(await errorMessage(res, `Failed to load drafts (${res.status})`))
  const data = (await res.json()) as { articles: NewsItem[] }
  return data.articles
}

/** Approve (publish) or reject a draft. Admin only. */
export async function reviewArticle(id: string, action: 'publish' | 'reject'): Promise<void> {
  const res = await fetch(`${API}/api/news/${id}/${action}`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await errorMessage(res, `Could not ${action} (${res.status})`))
}

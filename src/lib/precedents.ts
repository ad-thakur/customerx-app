import type { GroundId } from './types'

export interface PrecedentResult {
  title: string
  docUrl: string
  court: string
  snippet: string
}

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

/**
 * Searches the ingested e-Jagriti corpus.
 *
 * Always pass the case's `grounds` — the server maps them to e-Jagriti case
 * categories and searches only within those. Keyword matching alone ranges
 * over the whole corpus and returns plausible-looking but unrelated judgments,
 * which is worse than returning nothing.
 */
export async function fetchPrecedents(
  query: string,
  grounds: GroundId[] = [],
): Promise<PrecedentResult[]> {
  const params = new URLSearchParams({ q: query })
  if (grounds.length > 0) params.set('grounds', grounds.join(','))

  const res = await fetch(`${API}/api/precedents?${params}`)
  if (!res.ok) {
    throw new Error('Could not reach the precedent search service.')
  }
  return res.json()
}

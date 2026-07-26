export interface PrecedentResult {
  title: string
  docUrl: string
  court: string
  snippet: string
}

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export async function fetchPrecedents(query: string): Promise<PrecedentResult[]> {
  const res = await fetch(`${API}/api/precedents?q=${encodeURIComponent(query)}`)
  if (!res.ok) {
    throw new Error('Could not reach the precedent search service.')
  }
  return res.json()
}

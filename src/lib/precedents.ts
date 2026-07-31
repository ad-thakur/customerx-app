export interface PrecedentResult {
  title: string
  docUrl: string
  court: string
  snippet: string
}

export async function fetchPrecedents(query: string): Promise<PrecedentResult[]> {
  const res = await fetch(`/api/precedents?q=${encodeURIComponent(query)}`)
  if (!res.ok) {
    throw new Error('Could not reach the precedent search service.')
  }
  return res.json()
}

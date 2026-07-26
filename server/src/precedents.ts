// Indian Kanoon precedent search — ported from the Vite dev middleware so it
// works in production. Prototype-grade HTML scraping; switch to the paid API
// (api.indiankanoon.org) before real launch, per the concept note.

import * as cheerio from 'cheerio'

export interface PrecedentResult {
  title: string
  docUrl: string
  court: string
  snippet: string
}

const INDIAN_KANOON_BASE = 'https://indiankanoon.org'

export async function searchPrecedents(query: string): Promise<PrecedentResult[]> {
  const searchUrl = `${INDIAN_KANOON_BASE}/search/?formInput=${encodeURIComponent(query)}`
  const response = await fetch(searchUrl, {
    headers: {
      'User-Agent':
        'ConsumerX-Prototype/1.0 (precedent research feature; contact grievance@consumerx.in)',
    },
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Indian Kanoon search failed with status ${response.status}`)
  }

  const html = await response.text()
  const $ = cheerio.load(html)
  const results: PrecedentResult[] = []

  $('article.result').each((_, el) => {
    const titleLink = $(el).find('h4.result_title a').first()
    const title = titleLink.text().trim()
    const href = titleLink.attr('href')
    if (!title || !href) return

    const docId = href.match(/\/doc(?:fragment)?\/(\d+)\//)?.[1]
    const docUrl = docId ? `${INDIAN_KANOON_BASE}/doc/${docId}/` : `${INDIAN_KANOON_BASE}${href}`
    const court = $(el).find('.docsource').first().text().trim()
    const snippet = $(el).find('.headline').first().text().replace(/\s+/g, ' ').trim()

    results.push({ title, docUrl, court, snippet })
  })

  return results.slice(0, 6)
}

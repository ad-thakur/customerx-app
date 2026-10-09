// Where the news agent looks for consumer-rights coverage.
//
// We use RSS, not scraping: Google News search feeds (broad, and they surface
// Times of India / Indian Express etc. even though those sites block direct
// crawlers) plus a few direct publisher feeds for clean links. Add or remove
// feeds here — the agent treats every item as a candidate and lets the LLM
// filter for genuine relevance.

export interface NewsFeed {
  url: string
  /** Fallback source label when an item doesn't carry its own. */
  label: string
}

/** A Google News RSS search feed for India / English. */
function gnews(query: string): NewsFeed {
  const q = encodeURIComponent(`${query} when:180d`)
  return {
    url: `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`,
    label: 'Google News',
  }
}

export const NEWS_FEEDS: NewsFeed[] = [
  gnews('consumer protection India'),
  gnews('CCPA consumer protection authority penalty'),
  gnews('NCDRC consumer commission order compensation'),
  gnews('consumer court India company compensation deficiency service'),
  gnews('unfair trade practice misleading advertisement India consumer'),
  gnews('consumer forum orders company refund India'),
  // Direct publisher feeds (clean article URLs).
  { url: 'https://www.livelaw.in/consumer-cases/rss', label: 'LiveLaw' },
  { url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3', label: 'PIB' },
]

/**
 * Terms that, if present in a candidate's title, make it very likely relevant —
 * used only as a cheap pre-filter hint; the LLM makes the final call.
 */
export const RELEVANCE_HINTS = [
  'consumer',
  'ncdrc',
  'ccpa',
  'consumer court',
  'consumer forum',
  'consumer commission',
  'deficiency in service',
  'unfair trade',
  'misleading',
  'refund',
  'compensation',
  'consumer protection',
]

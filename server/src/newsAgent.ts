/**
 * News agent — the recurring job behind the Consumer Watch page.
 *
 * Once a day (Railway cron) it pulls consumer-rights coverage from the RSS
 * feeds in newsSources.ts, skips anything already seen, and asks Claude to
 * decide whether each item is genuinely relevant and, if so, to write a
 * neutral, attributed summary and pull out the company/sector tags. Everything
 * it keeps is written as a **draft** — nothing appears on the public page until
 * a human approves it in the review queue. So this job never publishes; it only
 * proposes.
 *
 * Run (from server/):
 *   DATABASE_URL=… ANTHROPIC_API_KEY=… node dist/newsAgent.js [--limit 40] [--throttle 800]
 */
import Anthropic from '@anthropic-ai/sdk'
import * as cheerio from 'cheerio'
import { NEWS_FEEDS, type NewsFeed } from './newsSources.js'
import {
  initNewsTable,
  insertDraft,
  knownUrls,
  closeNewsPool,
  type NewsCategory,
} from './newsStore.js'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  const v = i !== -1 ? Number(process.argv[i + 1]) : NaN
  return Number.isFinite(v) ? v : fallback
}

interface Candidate {
  title: string
  url: string
  source: string
  publishedAt: string | null
  snippet: string
}

/** Best-effort RFC-822 → YYYY-MM-DD. */
function toIsoDate(pubDate: string): string | null {
  const d = new Date(pubDate)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Google News titles are "Headline - Publisher"; strip the trailing source. */
function cleanTitle(title: string): string {
  return title.replace(/\s+-\s+[^-]{2,40}$/, '').trim() || title.trim()
}

function parseFeed(xml: string, feed: NewsFeed): Candidate[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const out: Candidate[] = []
  $('item').each((_, el) => {
    const item = $(el)
    const rawTitle = item.find('title').first().text().trim()
    const link = item.find('link').first().text().trim()
    if (!rawTitle || !link) return
    const source = item.find('source').first().text().trim() || feed.label
    const pub = item.find('pubDate').first().text().trim()
    const snippet = cheerio
      .load(item.find('description').first().text() || '')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500)
    out.push({
      title: cleanTitle(rawTitle),
      url: link,
      source,
      publishedAt: pub ? toIsoDate(pub) : null,
      snippet,
    })
  })
  return out
}

async function fetchFeed(feed: NewsFeed): Promise<Candidate[]> {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'ConsumerX-news/0.1 (+https://consumerx.co.in)' },
    })
    if (!res.ok) {
      console.warn(`  ! ${feed.label}: HTTP ${res.status}`)
      return []
    }
    return parseFeed(await res.text(), feed)
  } catch (err) {
    console.warn(`  ! ${feed.label}: ${(err as Error).message}`)
    return []
  }
}

interface Curation {
  relevant: boolean
  category: NewsCategory
  summary: string
  companies: string[]
  sectors: string[]
}

const SYSTEM = `You curate an Indian consumer-rights news index. For one article (title + snippet), decide if it is genuinely about consumer protection in India — new consumer laws/rules or regulator guidance, a finding/penalty against a company, or a consumer (or group) acting against a company under the Consumer Protection Act. General business news, unrelated crime, or non-India stories are NOT relevant.

If relevant, write a NEUTRAL, attributed 1–2 sentence summary (≤55 words). Never assert a wrongdoing as fact in your own voice — attribute it ("According to <source>…", "A consumer commission held…"). Do not editorialise. Extract company names actually named, and 1–3 sector tags (e.g. Airlines, Banking, E-commerce, Insurance, Healthcare, Real estate, Food & beverages, Telecom, Misleading ads, Regulation).

Reply ONLY with JSON, no markdown:
{"relevant": boolean, "category": "law"|"breach"|"action", "summary": string, "companies": string[], "sectors": string[]}
If not relevant, return {"relevant": false, "category": "law", "summary": "", "companies": [], "sectors": []}.`

function extractJson(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

async function curate(client: Anthropic, c: Candidate): Promise<Curation | null> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Source: ${c.source}\nTitle: ${c.title}\nSnippet: ${c.snippet || '(none)'}`,
      },
    ],
  })
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  try {
    const parsed = JSON.parse(extractJson(text)) as Curation
    if (!['law', 'breach', 'action'].includes(parsed.category)) parsed.category = 'law'
    parsed.companies = Array.isArray(parsed.companies) ? parsed.companies.slice(0, 6) : []
    parsed.sectors = Array.isArray(parsed.sectors) ? parsed.sectors.slice(0, 4) : []
    return parsed
  } catch {
    console.warn(`  ! could not parse model output for "${c.title.slice(0, 60)}"`)
    return null
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set — the agent needs it to curate.')
    process.exit(1)
  }
  const client = new Anthropic({ apiKey })
  const limit = arg('limit', 40)
  const throttle = arg('throttle', 800)

  await initNewsTable()
  const seen = await knownUrls()
  console.log(`${seen.size} articles already on file. Fetching ${NEWS_FEEDS.length} feeds…\n`)

  // Gather candidates across all feeds, de-duplicating by URL within the run.
  const candidates = new Map<string, Candidate>()
  for (const feed of NEWS_FEEDS) {
    const items = await fetchFeed(feed)
    for (const item of items) {
      if (!seen.has(item.url) && !candidates.has(item.url)) candidates.set(item.url, item)
    }
    console.log(`  ${feed.label}: ${items.length} items`)
    await sleep(500)
  }

  const fresh = [...candidates.values()].slice(0, limit)
  console.log(`\n${candidates.size} new candidates; curating up to ${fresh.length}.\n`)

  let drafted = 0
  let skipped = 0
  let failed = 0
  for (const c of fresh) {
    try {
      const curation = await curate(client, c)
      if (!curation || !curation.relevant || !curation.summary) {
        skipped++
      } else if (
        await insertDraft({
          url: c.url,
          title: c.title,
          source: c.source,
          publishedAt: c.publishedAt,
          summary: curation.summary,
          companies: curation.companies,
          sectors: curation.sectors,
          category: curation.category,
        })
      ) {
        drafted++
        console.log(`  + [${curation.category}] ${c.title.slice(0, 70)} — ${c.source}`)
      } else {
        skipped++ // race: already inserted by a prior run
      }
    } catch (err) {
      failed++
      console.error(`  x ${c.title.slice(0, 60)}: ${(err as Error).message}`)
    }
    await sleep(throttle)
  }

  console.log(
    `\nDone. ${drafted} new draft${drafted === 1 ? '' : 's'} for review, ` +
      `${skipped} skipped (not relevant / duplicate), ${failed} failed.`,
  )
  await closeNewsPool()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

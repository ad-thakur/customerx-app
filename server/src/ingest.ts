/**
 * Ingest a small dataset of consumer-case judgments from e-Jagriti into Postgres.
 *
 * Usage (from server/):
 *   DATABASE_URL=postgres://… npm run ingest -- [options]
 *
 * Options:
 *   --category "DEFECTIVE GOODS"   case category to ingest (default: DEFECTIVE GOODS)
 *   --commission 11000000          commission id (default: NCDRC)
 *   --from 2024-01-01              disposal date range start (default: 2 years ago)
 *   --to   2026-08-03              disposal date range end (default: today)
 *   --pages 2                      number of pages to fetch (default: 2)
 *   --size 10                      page size (default: 10; responses are large — keep small)
 *
 * Run this from a residential/office connection (your laptop is fine). It writes to the
 * same DATABASE_URL Postgres the Railway API uses, so run it with the Railway connection
 * string to populate production.
 */
// pdf-parse's package entry has a debug block that breaks under ESM; import the lib directly.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import {
  COMMISSION_NCDRC,
  resolveCategoryId,
  searchCasesByCategory,
  type EJagritiCaseRecord,
} from './ejagriti.js'
import {
  initPrecedentTable,
  upsertPrecedent,
  countPrecedents,
  closePrecedentPool,
} from './precedentStore.js'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400_000)
  return d.toISOString().slice(0, 10)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function extractJudgmentText(rec: EJagritiCaseRecord): Promise<string | null> {
  const b64 = rec.judgmentOrderDocumentBase64
  if (!b64) return null
  try {
    const parsed = await pdfParse(Buffer.from(b64, 'base64'))
    const text = parsed.text?.replace(/\s+\n/g, '\n').trim()
    return text && text.length > 0 ? text : null
  } catch (err) {
    console.warn(`  ! could not parse judgment PDF for ${rec.caseNumber}: ${(err as Error).message}`)
    return null
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at your Postgres (e.g. the Railway connection string).')
    process.exit(1)
  }

  const category = arg('category', 'DEFECTIVE GOODS')
  const commissionId = Number(arg('commission', String(COMMISSION_NCDRC)))
  const fromDate = arg('from', isoDaysAgo(730))
  const toDate = arg('to', new Date().toISOString().slice(0, 10))
  const pages = Number(arg('pages', '2'))
  const size = Number(arg('size', '10'))
  const commissionLabel = commissionId === COMMISSION_NCDRC ? 'NCDRC' : String(commissionId)

  console.log(`Resolving category "${category}"…`)
  const categoryId = await resolveCategoryId(category)
  console.log(`Category id: ${categoryId}. Ingesting ${pages} page(s) × ${size} from ${commissionLabel}, disposed ${fromDate} → ${toDate}.`)

  await initPrecedentTable()

  let inserted = 0
  let updated = 0
  for (let page = 0; page < pages; page++) {
    console.log(`Fetching page ${page + 1}/${pages} (this can take 20-40s)…`)
    const records = await searchCasesByCategory({
      commissionId,
      categoryId,
      fromDate,
      toDate,
      page,
      size,
    })
    if (records.length === 0) {
      console.log('No more records — stopping.')
      break
    }

    for (const rec of records) {
      const text = await extractJudgmentText(rec)
      const { judgmentOrderDocumentBase64: _pdf, ...meta } = rec
      const result = await upsertPrecedent({
        caseNumber: rec.caseNumber,
        commission: commissionLabel,
        category,
        complainant: rec.complainantName,
        respondent: rec.respondentName,
        complainantAdvocate: rec.complainantAdvocateName,
        respondentAdvocate: rec.respondentAdvocateName,
        filingDate: rec.caseFilingDate,
        disposalDate: rec.dateOfDisposal,
        judgmentDate: rec.judgemtmentDate,
        outcome: rec.caseStageName,
        judgmentText: text,
        rawMeta: meta,
      })
      result === 'inserted' ? inserted++ : updated++
      console.log(`  ${result === 'inserted' ? '+' : '~'} ${rec.caseNumber} — ${rec.caseStageName ?? 'stage unknown'}${text ? ` (${text.length.toLocaleString()} chars of judgment text)` : ' (no judgment PDF)'}`)
    }

    // Be polite to a government service.
    if (page < pages - 1) await sleep(3000)
  }

  const total = await countPrecedents(category)
  console.log(`Done. ${inserted} inserted, ${updated} updated. ${total} "${category}" cases now in precedent_cases.`)
  await closePrecedentPool()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

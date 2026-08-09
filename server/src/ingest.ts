/**
 * Ingest consumer-case judgments from e-Jagriti into Postgres.
 *
 * Usage (from server/):
 *   DATABASE_URL=postgres://… npm run ingest -- [options]
 *
 * Selecting what to ingest (combine freely; all are additive):
 *   --ground deficient_service     every category mapped to a statutory ground
 *                                  (see categories.ts). Repeatable.
 *   --category "DEFECTIVE GOODS"   an explicit category name. Repeatable.
 *   --category-id 473              an explicit category id, for names that are
 *                                  duplicated in e-Jagriti's master list.
 *   (default, if none given: DEFECTIVE GOODS)
 *
 * Discovery:
 *   --list-categories [text]       print matching categories and exit. Use this
 *                                  rather than guessing at names.
 *
 * Scope:
 *   --commission 11000000          commission id (default: NCDRC)
 *   --from 2024-01-01              disposal date range start (default: 2 years ago)
 *   --to   2026-08-03              disposal date range end (default: today)
 *   --pages 5                      pages per category (default: 2)
 *   --size 10                      page size (default: 10; responses embed full
 *                                  judgment PDFs — keep this small)
 *
 * Run this from a residential/office connection (your laptop is fine). It writes to the
 * same DATABASE_URL Postgres the Railway API uses, so run it with the Railway connection
 * string to populate production.
 *
 * Examples:
 *   npm run ingest -- --list-categories advertis
 *   npm run ingest -- --ground deficient_service --pages 5
 *   npm run ingest -- --ground misleading_ad --ground deficient_service --pages 5
 */
// pdf-parse's package entry has a debug block that breaks under ESM; import the lib directly.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import {
  COMMISSION_NCDRC,
  findCategories,
  resolveCategoryId,
  searchCasesByCategory,
  type EJagritiCaseRecord,
} from './ejagriti.js'
import { GROUND_CATEGORIES, isGroundId, type CategoryRef } from './categories.js'
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

/** All values for a repeatable flag, e.g. --ground a --ground b. */
function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

/**
 * Builds the de-duplicated list of categories to ingest from --ground,
 * --category and --category-id. Falls back to DEFECTIVE GOODS so the old
 * no-argument invocation keeps working.
 */
function requestedCategories(): CategoryRef[] {
  const out = new Map<string, CategoryRef>()

  for (const g of args('ground')) {
    if (!isGroundId(g)) {
      console.error(
        `Unknown ground "${g}". Expected one of: ${Object.keys(GROUND_CATEGORIES).join(', ')}`,
      )
      process.exit(1)
    }
    for (const c of GROUND_CATEGORIES[g]) out.set(c.name, c)
  }

  for (const name of args('category')) {
    if (!out.has(name)) out.set(name, { name })
  }

  for (const raw of args('category-id')) {
    const id = Number(raw)
    if (!Number.isFinite(id)) {
      console.error(`--category-id expects a number, got "${raw}"`)
      process.exit(1)
    }
    out.set(`#${id}`, { name: `#${id}`, id })
  }

  return out.size > 0 ? [...out.values()] : [{ name: 'DEFECTIVE GOODS' }]
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
  // --list-categories is a read-only lookup against e-Jagriti; no database needed.
  if (hasFlag('list-categories')) {
    const query = arg('list-categories', '')
    const found = await findCategories(query.startsWith('--') ? '' : query)
    console.log(`${found.length} categor${found.length === 1 ? 'y' : 'ies'} matching "${query || '*'}":\n`)
    for (const c of found) {
      console.log(`  ${String(c.case_category_id).padStart(6)}  ${c.case_category_name_en}`)
    }
    return
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at your Postgres (e.g. the Railway connection string).')
    process.exit(1)
  }

  const categories = requestedCategories()
  const commissionId = Number(arg('commission', String(COMMISSION_NCDRC)))
  const fromDate = arg('from', isoDaysAgo(730))
  const toDate = arg('to', new Date().toISOString().slice(0, 10))
  const pages = Number(arg('pages', '2'))
  const size = Number(arg('size', '10'))
  const commissionLabel = commissionId === COMMISSION_NCDRC ? 'NCDRC' : String(commissionId)

  console.log(
    `Ingesting ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} ` +
      `(${categories.map((c) => c.name).join(', ')}) — up to ${pages * size} cases each ` +
      `from ${commissionLabel}, disposed ${fromDate} → ${toDate}.\n`,
  )

  await initPrecedentTable()

  const summary: Array<{ category: string; inserted: number; updated: number; total: number }> = []

  for (const ref of categories) {
    console.log(`\n=== ${ref.name} ===`)
    let categoryId: number
    let category = ref.name
    try {
      if (ref.name.startsWith('#') && ref.id !== undefined) {
        categoryId = ref.id
        category = `#${ref.id}`
      } else {
        categoryId = await resolveCategoryId(ref.name, ref.id)
      }
    } catch (err) {
      // One bad category name shouldn't abandon the rest of the run.
      console.error(`  ! skipping: ${(err as Error).message}`)
      continue
    }
    console.log(`  category id ${categoryId}`)

    const counts = await ingestCategory({
      category,
      categoryId,
      commissionId,
      commissionLabel,
      fromDate,
      toDate,
      pages,
      size,
    })
    summary.push({ category, ...counts, total: await countPrecedents(category) })

    // Be polite to a government service between categories too.
    await sleep(3000)
  }

  console.log('\n=== summary ===')
  for (const r of summary) {
    console.log(`  ${r.category.padEnd(28)} +${r.inserted} new, ~${r.updated} updated, ${r.total} total`)
  }
  console.log(`  ${'ALL CATEGORIES'.padEnd(28)} ${await countPrecedents()} rows in precedent_cases`)
  await closePrecedentPool()
}

interface IngestOptions {
  category: string
  categoryId: number
  commissionId: number
  commissionLabel: string
  fromDate: string
  toDate: string
  pages: number
  size: number
}

async function ingestCategory(o: IngestOptions): Promise<{ inserted: number; updated: number }> {
  const { category, categoryId, commissionId, commissionLabel, fromDate, toDate, pages, size } = o
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

  return { inserted, updated }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

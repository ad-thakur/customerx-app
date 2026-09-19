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
 *   --all-mapped                   every distinct category referenced by any
 *                                  ground in categories.ts. Prefer this over
 *                                  listing names by hand — it cannot drift when
 *                                  the mapping changes.
 *   (default, if none given: DEFECTIVE GOODS)
 *
 * Discovery:
 *   --list-categories [text]       print matching categories and exit. Use this
 *                                  rather than guessing at names.
 *   --probe                        for each selected category, fetch a single
 *                                  record and report whether the category has
 *                                  any cases at all in the window. No database
 *                                  writes. Use this before committing to a long
 *                                  run — e-Jagriti's master list contains many
 *                                  categories that no NCDRC case is filed under.
 *   --probe-range 1-45             probe every category id in a range, showing
 *                                  each one's name. Use this to discover which
 *                                  part of the master list a commission
 *                                  actually files under.
 *   --list-commissions [text]      print State Commissions (and their ids) and exit.
 *   --count                        report how many judgements exist for each
 *                                  selected category on each selected commission,
 *                                  without downloading or storing them. Uses a
 *                                  binary search over pages, so a category of any
 *                                  size costs about a dozen requests. Run this
 *                                  before deciding how large a corpus to build.
 *
 * Scope:
 *   --commission 11000000          commission id (default: NCDRC)
 *   --commission-name DELHI        commission by name; repeatable. "NCDRC" works.
 *   --all-states                   every State Commission and circuit bench (55)
 *   --districts-of KARNATAKA       every District Commission under a state
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
 *   npm run ingest -- --count --all-mapped --from 2010-01-01
 *   npm run ingest -- --count --all-states --category "HOUSE HOLD GOODS" --from 2015-01-01
 */
// pdf-parse's package entry has a debug block that breaks under ESM; import the lib directly.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import {
  COMMISSION_NCDRC,
  commissionNames,
  countCasesByCategory,
  fetchDistrictCommissions,
  fetchStateCommissions,
  findCategories,
  resolveCategoryId,
  resolveCommission,
  searchCaseByNumber,
  searchCasesByCategory,
  type EJagritiCaseRecord,
} from './ejagriti.js'
import { allCategories, GROUND_CATEGORIES, isGroundId, type CategoryRef } from './categories.js'
import {
  initPrecedentTable,
  upsertPrecedent,
  countPrecedents,
  listTextlessCases,
  updateJudgmentText,
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

  // Derived from GROUND_CATEGORIES rather than typed out, so a survey or ingest
  // always covers exactly what retrieval can actually search.
  if (hasFlag('all-mapped')) {
    for (const c of allCategories()) out.set(c.name, c)
  }

  const range = arg('probe-range', '')
  if (range) {
    const [lo, hi] = range.split('-').map(Number)
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) {
      console.error(`--probe-range expects "low-high", e.g. 1-45 (got "${range}")`)
      process.exit(1)
    }
    for (let id = lo; id <= hi; id++) out.set(`#${id}`, { name: `#${id}`, id })
  }

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

export interface CommissionRef {
  id: number
  label: string
}

/**
 * The commissions a run should target, from --commission / --commission-name /
 * --all-states / --districts-of. Defaults to NCDRC so existing invocations are
 * unchanged.
 */
async function requestedCommissions(): Promise<CommissionRef[]> {
  const out = new Map<number, CommissionRef>()

  for (const raw of args('commission')) {
    const id = Number(raw)
    if (!Number.isFinite(id)) {
      console.error(`--commission expects a number, got "${raw}". Use --commission-name for names.`)
      process.exit(1)
    }
    out.set(id, { id, label: String(id) })
  }

  for (const name of args('commission-name')) {
    const c = await resolveCommission(name)
    out.set(c.id, c)
  }

  if (hasFlag('all-states')) {
    for (const c of await fetchStateCommissions()) {
      if (c.activeStatus) out.set(c.commissionId, { id: c.commissionId, label: c.commissionNameEn.trim() })
    }
  }

  for (const stateName of args('districts-of')) {
    const state = await resolveCommission(stateName)
    for (const d of await fetchDistrictCommissions(state.id)) {
      if (d.activeStatus) {
        out.set(d.commissionId, {
          id: d.commissionId,
          label: `${d.commissionNameEn.trim()} (${state.label})`,
        })
      }
    }
  }

  if (out.size === 0) out.set(COMMISSION_NCDRC, { id: COMMISSION_NCDRC, label: 'NCDRC' })

  // Numeric ids given bare get their real names, so the commission column never
  // ends up storing "11270000" where the UI expects a readable label.
  if ([...out.values()].some((c) => c.label === String(c.id))) {
    const names = await commissionNames(true)
    for (const [id, c] of out) {
      if (c.label === String(id)) out.set(id, { id, label: names.get(id) ?? String(id) })
    }
  }

  return [...out.values()]
}

function isoDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86400_000)
  return d.toISOString().slice(0, 10)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * e-Jagriti's `judgmentOrderDocumentBase64` is misnamed: for many cases it is a
 * raw HTML fragment holding the order text, not a base64 PDF. Convert that HTML
 * to plain text while keeping the document's line shape.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // Turn block-level tag ends into line breaks so the text keeps its shape.
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractJudgmentText(rec: EJagritiCaseRecord): Promise<string | null> {
  const raw = rec.judgmentOrderDocumentBase64
  if (!raw) return null

  // Two formats arrive under the same field. An HTML fragment begins with a tag;
  // a base64 PDF begins "JVBERi" ("%PDF" encoded). Treating HTML as base64 (the
  // old behaviour) fed garbage to the PDF parser and lost the text entirely.
  if (raw.trimStart().startsWith('<')) {
    const text = htmlToText(raw)
    return text.length > 0 ? text : null
  }

  try {
    const parsed = await pdfParse(Buffer.from(raw, 'base64'))
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

  // --probe-range implies probe mode: it selects ids to inspect, never to ingest.
  const probing = hasFlag('probe') || arg('probe-range', '') !== ''

  if (hasFlag('list-commissions')) {
    const query = arg('list-commissions', '')
    const q = (query.startsWith('--') ? '' : query).trim().toLowerCase()
    const states = (await fetchStateCommissions()).filter(
      (c) => !q || c.commissionNameEn.toLowerCase().includes(q),
    )
    console.log(`${states.length} State Commission(s) matching "${q || '*'}":\n`)
    console.log(`  ${String(COMMISSION_NCDRC).padStart(9)}  NCDRC (national)`)
    for (const c of states) {
      console.log(
        `  ${String(c.commissionId).padStart(9)}  ${c.commissionNameEn.trim()}` +
          (c.circuitAdditionBenchStatus ? '  [bench]' : ''),
      )
    }
    console.log('\nDistrict Commissions: --districts-of "<state name>"')
    return
  }

  // --count reads only; it never writes, so no database is required.
  const counting = hasFlag('count')

  if (!probing && !counting && !process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at your Postgres (e.g. the Railway connection string).')
    process.exit(1)
  }

  // Second pass: fill judgment_text for rows the bulk ingest left empty, by
  // re-fetching each by case number (see backfillJudgmentText). Needs the DB.
  if (hasFlag('backfill-text')) {
    await backfillJudgmentText()
    return
  }

  const categories = requestedCategories()
  // Probe paths still use a single commission; the count and ingest paths use
  // requestedCommissions() so they can span states and districts.
  const commissionId = Number(arg('commission', String(COMMISSION_NCDRC)))
  const fromDate = arg('from', isoDaysAgo(730))
  const toDate = arg('to', new Date().toISOString().slice(0, 10))
  const pages = Number(arg('pages', '2'))
  const size = Number(arg('size', '10'))
  const commissionLabel = commissionId === COMMISSION_NCDRC ? 'NCDRC' : String(commissionId)

  if (counting) {
    const commissions = await requestedCommissions()
    console.log(
      `Counting ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} across ` +
        `${commissions.length} commission(s), disposed ${fromDate} → ${toDate}. No writes.\n`,
    )

    let grandTotal = 0
    let grandRequests = 0
    for (const commission of commissions) {
      console.log(`\n=== ${commission.label} (${commission.id}) ===`)
      let commissionTotal = 0

      for (const ref of categories) {
        let categoryId: number
        try {
          categoryId =
            ref.name.startsWith('#') && ref.id !== undefined
              ? ref.id
              : await resolveCategoryId(ref.name, ref.id)
        } catch (err) {
          console.log(`  ${ref.name.padEnd(32)} — ${(err as Error).message}`)
          continue
        }

        try {
          const { total, requests, capped } = await countCasesByCategory({
            commissionId: commission.id,
            categoryId,
            fromDate,
            toDate,
            size,
          })
          commissionTotal += total
          grandRequests += requests
          console.log(
            `  ${ref.name.padEnd(32)} ${String(total).padStart(6)}${capped ? '+' : ' '}` +
              `   (${requests} requests)`,
          )
        } catch (err) {
          console.log(`  ${ref.name.padEnd(32)}      ? — ${(err as Error).message}`)
        }
        await sleep(1500)
      }

      console.log(`  ${'—'.padEnd(32)} ${String(commissionTotal).padStart(6)}   subtotal`)
      grandTotal += commissionTotal
    }

    console.log(`\n${grandTotal} judgements available across all selections.`)
    console.log(`Cost of this survey: ${grandRequests} requests.`)
    console.log(
      `Ingesting all of them would be ~${Math.ceil(grandTotal / size)} page fetches ` +
        `(~${Math.ceil((grandTotal / size) * 33 / 60)} minutes at 33s/page).`,
    )
    return
  }

  if (probing) {
    console.log(
      `Probing ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} against ` +
        `${commissionLabel}, disposed ${fromDate} → ${toDate}. No writes.\n`,
    )
    // Resolve ids back to names once, so probing by id is readable.
    const master = await findCategories()
    const nameById = new Map(master.map((c) => [c.case_category_id, c.case_category_name_en]))

    for (const ref of categories) {
      let categoryId: number
      let label = ref.name
      try {
        if (ref.name.startsWith('#') && ref.id !== undefined) {
          categoryId = ref.id
          label = nameById.get(ref.id) ?? `#${ref.id} (not in master list)`
        } else {
          categoryId = await resolveCategoryId(ref.name, ref.id)
        }
      } catch (err) {
        console.log(`  ${ref.name.padEnd(30)} — ${(err as Error).message}`)
        continue
      }
      try {
        const found = await searchCasesByCategory({
          commissionId,
          categoryId,
          fromDate,
          toDate,
          page: 0,
          size: 1,
        })
        const first = found[0]
        if (first) {
          console.log(
            `  ${String(categoryId).padStart(5)}  ${label.padEnd(34)} HAS CASES — ` +
              `e.g. ${first.caseNumber} (disposed ${first.dateOfDisposal ?? '?'})`,
          )
        } else {
          console.log(`  ${String(categoryId).padStart(5)}  ${label.padEnd(34)} —`)
        }
      } catch (err) {
        console.log(`  ${String(categoryId).padStart(5)}  ${label.padEnd(34)} ! ${(err as Error).message}`)
      }
      await sleep(1500)
    }
    console.log('\nCategories showing "none in this window" are either unused by this commission')
    console.log('or outside the date range — widen it with --from 2015-01-01 before ruling them out.')
    return
  }

  const commissions = await requestedCommissions()

  console.log(
    `Ingesting ${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} ` +
      `(${categories.map((c) => c.name).join(', ')}) across ${commissions.length} commission(s) ` +
      `— up to ${pages * size} cases each, disposed ${fromDate} → ${toDate}.\n`,
  )

  await initPrecedentTable()

  const summary: Array<{ category: string; inserted: number; updated: number; total: number }> = []

  for (const commission of commissions) {
    if (commissions.length > 1) console.log(`\n######## ${commission.label} ########`)

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
        commissionId: commission.id,
        commissionLabel: commission.label,
        fromDate,
        toDate,
        pages,
        size,
      })
      summary.push({ category, ...counts, total: await countPrecedents(category) })

      // Be polite to a government service between categories too.
      await sleep(3000)
    }
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

/**
 * Second-pass text recovery (--backfill-text).
 *
 * The bulk ingest left many rows with judgment_text NULL: the category search
 * returned their order as an unparseable PDF. Fetched by case number instead,
 * those same orders come back as HTML we can extract. This walks every text-less
 * row, re-fetches it by number, and fills the column in place. It only writes
 * rows that are still empty, so it is fully resumable — re-running continues
 * from wherever it stopped and never rewrites text already recovered.
 *
 *   --concurrency 4   parallel in-flight fetches (default 4)
 *   --throttle 300    ms each worker waits between cases (default 300)
 *   --commission id   commission to search (default NCDRC)
 */
async function backfillJudgmentText(): Promise<void> {
  const commissionId = Number(arg('commission', String(COMMISSION_NCDRC)))
  const concurrency = Math.max(1, Number(arg('concurrency', '4')))
  const throttleMs = Number(arg('throttle', '300'))

  const cases = await listTextlessCases()
  console.log(
    `${cases.length.toLocaleString()} cases without judgment text. Re-fetching each by case ` +
      `number (concurrency ${concurrency}) and filling the column in place.\n`,
  )

  let filled = 0
  let noText = 0
  let failed = 0
  let processed = 0
  let cursor = 0

  async function worker(): Promise<void> {
    // `cursor++` is atomic here — there is no await between reading and
    // incrementing it — so each case is claimed by exactly one worker.
    for (let i = cursor++; i < cases.length; i = cursor++) {
      const c = cases[i]
      // Bound the case-number search to its disposal year; fall back to the full
      // corpus range when the row has no disposal date.
      const yr = c.disposalDate?.slice(0, 4)
      const fromDate = yr ? `${yr}-01-01` : '2008-01-01'
      const toDate = yr ? `${yr}-12-31` : new Date().toISOString().slice(0, 10)

      try {
        const records = await searchCaseByNumber({ caseNumber: c.caseNumber, commissionId, fromDate, toDate })
        const rec = records.find((r) => r.caseNumber === c.caseNumber) ?? records[0]
        const text = rec ? await extractJudgmentText(rec) : null
        if (text) {
          if (await updateJudgmentText(c.caseNumber, text)) {
            filled++
            console.log(`  + ${c.caseNumber} — ${text.length.toLocaleString()} chars`)
          }
        } else {
          noText++
          console.log(`  ! ${c.caseNumber} — no recoverable text`)
        }
      } catch (err) {
        failed++
        console.error(`  x ${c.caseNumber} — ${(err as Error).message}`)
      }

      if (++processed % 200 === 0) {
        console.log(
          `… ${processed}/${cases.length} — filled ${filled}, no-text ${noText}, failed ${failed}`,
        )
      }
      if (throttleMs > 0) await sleep(throttleMs)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, cases.length) }, worker))

  console.log(
    `\nDone. Filled ${filled.toLocaleString()}, no recoverable text ${noText.toLocaleString()}, ` +
      `failed ${failed.toLocaleString()}, of ${cases.length.toLocaleString()}.`,
  )
  await closePrecedentPool()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

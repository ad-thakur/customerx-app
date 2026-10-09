/**
 * Sweep every judgement delivered by one state's consumer commissions — the
 * State Commission, its circuit/regional benches and all its District
 * Commissions — into precedent_cases.
 *
 * Unlike ingest.ts, which walks category by category, this pulls *all*
 * judgements per commission (free-text search with an empty value) so cases
 * e-Jagriti files under no category are not missed. Categories are attached
 * from a cheap metadata-only lookup (see listCaseNumbersInCategory); cases with
 * none are stored as UNCATEGORISED and still get related_categories from their
 * text, so precedent search can find them.
 *
 * Usage (from server/, after `npm run build`):
 *   DATABASE_URL=postgres://… node dist/ingestState.js --state MAHARASHTRA [options]
 *
 *   --state MAHARASHTRA     State Commission name, as e-Jagriti lists it, or
 *                           NCDRC for the National Commission alone
 *   --from 2020-01-01       disposal window start (default 2020-01-01)
 *   --to   2026-09-25       disposal window end (default today)
 *   --only "Mumbai"         restrict to commissions whose name contains this
 *                           (repeatable), e.g. --only Mumbai --only MAHARASHTRA
 *   --no-districts          skip District Commissions
 *   --no-benches            skip circuit and regional benches
 *   --concurrency 3         commission-years fetched in parallel (default 3)
 *   --size 10               page size; each record embeds a ~0.5-1 MB PDF
 *   --category-max 50       highest category id to map (all observed use ≤ 50)
 *   --force                 redo commission-years already marked finished
 *   --dry-run [pages]       no database: fetch and parse a few pages per task
 *                           and print what would be written (default 1 page)
 *   --out rows.ndjson       no database: append rows to a local file instead
 *                           (resumable — finished tasks are recorded in it too)
 *   --load rows.ndjson      upsert a file written by --out into DATABASE_URL and
 *                           mark its finished tasks, so a later sweep skips them
 *   --load-concurrency 8    parallel upserts during --load (default 8)
 *   --time-limit 180        stop after this many minutes; an unfinished task is
 *                           left unmarked and redone on the next run
 *
 * Work is split into commission × disposal-year tasks, newest year first. Each
 * finished task is recorded in ingest_progress, so the run is resumable: restart
 * it with the same arguments and it picks up where it stopped. Writes go
 * through the idempotent upsertPrecedent, keyed on case number.
 */
import { appendFileSync, createReadStream, existsSync } from 'node:fs'
import {
  COMMISSION_NCDRC,
  fetchCaseCategories,
  fetchDistrictCommissions,
  fetchStateCommissions,
  listCaseNumbersInCategory,
  searchAllJudgments,
  searchCaseByNumber,
  type EJagritiCaseRecord,
} from './ejagriti.js'
import { crossReferenceCategories } from './categories.js'
import { extractJudgmentText } from './judgmentText.js'
import {
  UNCATEGORISED,
  closePrecedentPool,
  countPrecedents,
  existingCaseNumbers,
  finishedTasks,
  initPrecedentTable,
  initProgressTable,
  markTaskFinished,
  upsertPrecedent,
} from './precedentStore.js'

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : fallback
}

function args(name: string): string[] {
  const out: string[] = []
  process.argv.forEach((a, i) => {
    if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1])
  })
  return out
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Commission {
  id: number
  /** Stored in precedent_cases.commission. */
  label: string
}

interface Task {
  commission: Commission
  year: number
  fromDate: string
  toDate: string
  key: string
}

/** The state's principal seat, its benches and its District Commissions. */
async function discoverCommissions(state: string): Promise<Commission[]> {
  // The National Commission has no benches or districts. Its label matches the
  // rows the category ingest (ingest.ts) already wrote.
  if (state.trim().toUpperCase() === 'NCDRC') return [{ id: COMMISSION_NCDRC, label: 'NCDRC' }]

  const states = await fetchStateCommissions()
  const wanted = state.trim().toLowerCase()
  const principal = states.find(
    (c) => c.commissionNameEn.trim().toLowerCase() === wanted && !c.circuitAdditionBenchStatus,
  )
  if (!principal) {
    const names = states.filter((c) => !c.circuitAdditionBenchStatus).map((c) => c.commissionNameEn.trim())
    throw new Error(`State Commission "${state}" not found. Known: ${names.join(', ')}`)
  }
  const stateName = principal.commissionNameEn.trim()
  const out: Commission[] = [{ id: principal.commissionId, label: `${stateName} State Commission` }]

  if (!hasFlag('no-benches')) {
    // Benches share the principal seat's trailing six digits: 11270000 → 33270000.
    const suffix = principal.commissionId % 1_000_000
    for (const b of states) {
      if (b.commissionId !== principal.commissionId && b.commissionId % 1_000_000 === suffix) {
        out.push({ id: b.commissionId, label: `${stateName} State Commission — ${b.commissionNameEn.trim()}` })
      }
    }
  }

  if (!hasFlag('no-districts')) {
    for (const d of await fetchDistrictCommissions(principal.commissionId)) {
      out.push({ id: d.commissionId, label: `${d.commissionNameEn.trim()} District Commission, ${stateName}` })
    }
  }

  const only = args('only').map((o) => o.toLowerCase())
  return only.length ? out.filter((c) => only.some((o) => c.label.toLowerCase().includes(o))) : out
}

function buildTasks(commissions: Commission[], from: string, to: string): Task[] {
  const tasks: Task[] = []
  const firstYear = Number(from.slice(0, 4))
  const lastYear = Number(to.slice(0, 4))
  // Newest first, so the most useful recent judgements land earliest.
  for (let year = lastYear; year >= firstYear; year--) {
    for (const commission of commissions) {
      const fromDate = year === firstYear ? from : `${year}-01-01`
      const toDate = year === lastYear ? to : `${year}-12-31`
      tasks.push({ commission, year, fromDate, toDate, key: `sweep:${commission.id}:${year}` })
    }
  }
  return tasks
}

/** case number → category name, for every categorised case in the window. */
async function categoryMap(
  task: Task,
  categories: Array<{ id: number; name: string }>,
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  for (const c of categories) {
    const cases = await listCaseNumbersInCategory({
      commissionId: task.commission.id,
      categoryId: c.id,
      fromDate: task.fromDate,
      toDate: task.toDate,
    })
    for (const n of cases) if (!map.has(n)) map.set(n, c.name)
  }
  return map
}

/**
 * The listing's embedded order first; if that yields nothing (no document, or a
 * PDF with no text layer), one refetch by case number, which sometimes returns
 * the order as HTML instead.
 */
async function judgmentText(rec: EJagritiCaseRecord, task: Task): Promise<string | null> {
  const text = await extractJudgmentText(rec)
  if (text) return text
  try {
    const [again] = await searchCaseByNumber({
      caseNumber: rec.caseNumber,
      commissionId: task.commission.id,
      fromDate: task.fromDate,
      toDate: task.toDate,
    })
    if (again?.judgmentOrderDocumentBase64 && again.judgmentOrderDocumentBase64 !== rec.judgmentOrderDocumentBase64) {
      return await extractJudgmentText(again)
    }
  } catch (err) {
    console.warn(`  ! refetch of ${rec.caseNumber} failed: ${(err as Error).message}`)
  }
  return null
}

/**
 * e-Jagriti has typos in its dates (a judgement dated "0023-08-19"). Anything
 * before the 1986 Act or in the future is treated as unknown.
 */
function plausibleDate(d: string | null): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return null
  const year = Number(d.slice(0, 4))
  return year >= 1986 && year <= new Date().getFullYear() + 1 ? d.slice(0, 10) : null
}

/** Thrown between pages once --time-limit has passed. */
class TimeUp extends Error {}

/** Task keys already finished in an --out file (streamed: it outgrows a string). */
async function finishedInFile(path: string): Promise<Set<string>> {
  const done = new Set<string>()
  if (!existsSync(path)) return done
  for await (const line of ndjsonLines(path)) {
    if (line.startsWith('{"task"')) done.add(JSON.parse(line).task)
  }
  return done
}

/**
 * Lines of an NDJSON file, split on \n only. node:readline also breaks on
 * U+2028/U+2029, which JSON.stringify leaves unescaped and judgment text does
 * contain, so it would cut a record in half.
 */
async function* ndjsonLines(path: string): AsyncGenerator<string> {
  let buf = ''
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) !== -1) {
      yield buf.slice(0, nl)
      buf = buf.slice(nl + 1)
    }
  }
  if (buf) yield buf
}

/** JSON for one NDJSON line, with the Unicode line separators escaped. */
function ndjson(value: unknown): string {
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + '\n'
}

/** Upsert every row in an --out file, then mark its finished tasks. */
async function load(path: string): Promise<void> {
  await initPrecedentTable()
  await initProgressTable()
  // Rows are upserted one statement each over the network; run several at once
  // (the pool allows 10 connections) or a remote load crawls.
  const parallel = Number(arg('load-concurrency', '8'))
  // A re-load after an interrupted one skips cases already in the table.
  const existing = hasFlag('force') ? new Set<string>() : await existingCaseNumbers()
  let rows = 0
  let skipped = 0
  let failed = 0
  const tasks: Array<{ task: string; cases: number }> = []
  const inFlight = new Set<Promise<void>>()
  for await (const line of ndjsonLines(path)) {
    if (!line.trim()) continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      // A sweep killed mid-write can leave one truncated line; its case is
      // re-fetched because the task was never marked finished.
      console.warn(`  ! skipping unreadable line (${line.length} chars)`)
      continue
    }
    if (rec.task) {
      tasks.push(rec)
      continue
    }
    if (existing.has(rec.row.caseNumber)) {
      skipped++
      continue
    }
    existing.add(rec.row.caseNumber) // the file can hold a case twice
    const job = upsertPrecedent(rec.row)
      .then(() => {
        if (++rows % 1000 === 0) console.log(`  … ${rows.toLocaleString()} rows loaded`)
      })
      .catch((err) => {
        failed++
        console.error(`  ! failed to load ${rec.row?.caseNumber}: ${(err as Error).message}`)
      })
      .finally(() => inFlight.delete(job))
    inFlight.add(job)
    if (inFlight.size >= parallel) await Promise.race(inFlight)
  }
  await Promise.all(inFlight)
  if (skipped) console.log(`  (${skipped.toLocaleString()} rows already in the table, skipped)`)
  // Only mark tasks once all rows are in, and not at all if any row failed.
  if (failed === 0) for (const t of tasks) await markTaskFinished(t.task, t.cases)
  console.log(
    `Loaded ${rows.toLocaleString()} rows, ${failed} failed; ` +
      `${failed === 0 ? `marked ${tasks.length} tasks finished` : 'no tasks marked — fix and re-load'}. ` +
      `${(await countPrecedents()).toLocaleString()} rows in precedent_cases.`,
  )
  await closePrecedentPool()
}

/**
 * One page of judgements. A page embeds every order as base64, so a page of 10
 * can run to 50+ MB and outlast the request timeout however often it is
 * retried. When that happens, fetch the same ten cases one at a time (page
 * size 1 addresses them individually); a case that still fails is skipped and
 * counted, which leaves the task unfinished so a later run retries it.
 */
async function fetchPage(
  task: Task,
  page: number,
  size: number,
): Promise<{ records: EJagritiCaseRecord[]; end: boolean; skipped: number }> {
  const base = { commissionId: task.commission.id, fromDate: task.fromDate, toDate: task.toDate }
  try {
    const records = await searchAllJudgments({ ...base, page, size })
    return { records, end: records.length < size, skipped: 0 }
  } catch (err) {
    console.warn(
      `  ! [${task.commission.label} ${task.year}] page ${page} failed (${(err as Error).message}); fetching its cases one by one`,
    )
  }
  const records: EJagritiCaseRecord[] = []
  let skipped = 0
  for (let i = 0; i < size; i++) {
    try {
      const [rec] = await searchAllJudgments({ ...base, page: page * size + i, size: 1 })
      if (!rec) return { records, end: true, skipped }
      records.push(rec)
    } catch (err) {
      skipped++
      console.error(
        `  ! [${task.commission.label} ${task.year}] case ${page * size + i} skipped: ${(err as Error).message}`,
      )
    }
  }
  return { records, end: false, skipped }
}

interface TaskResult {
  cases: number
  withText: number
  failed: number
}

async function runTask(
  task: Task,
  categories: Array<{ id: number; name: string }>,
  opts: { size: number; dryRunPages: number | null; out: string | null; deadline: number },
): Promise<TaskResult> {
  const tag = `[${task.commission.label} ${task.year}]`
  const catOf = await categoryMap(task, categories)
  const result: TaskResult = { cases: 0, withText: 0, failed: 0 }

  for (let page = 0; ; page++) {
    if (opts.dryRunPages !== null && page >= opts.dryRunPages) break
    if (Date.now() > opts.deadline) throw new TimeUp()
    const { records, end, skipped } = await fetchPage(task, page, opts.size)
    result.failed += skipped

    for (const rec of records) {
      result.cases++
      const text = await judgmentText(rec, task)
      if (text) result.withText++
      const category = catOf.get(rec.caseNumber) ?? UNCATEGORISED
      const { judgmentOrderDocumentBase64: _doc, ...meta } = rec
      const row = {
        caseNumber: rec.caseNumber,
        commission: task.commission.label,
        category,
        complainant: rec.complainantName?.trim() || null,
        respondent: rec.respondentName?.trim() || null,
        complainantAdvocate: rec.complainantAdvocateName?.trim() || null,
        respondentAdvocate: rec.respondentAdvocateName?.trim() || null,
        filingDate: plausibleDate(rec.caseFilingDate),
        disposalDate: plausibleDate(rec.dateOfDisposal),
        // Judgement and disposal dates coincide in practice; fall back when the
        // judgement date is missing or mistyped.
        judgmentDate: plausibleDate(rec.judgemtmentDate) ?? plausibleDate(rec.dateOfDisposal),
        outcome: rec.caseStageName,
        judgmentText: text,
        // Keep the commission id alongside the API's own fields so rows can be
        // filtered by exact commission later, not just by label.
        rawMeta: { ...meta, commissionId: task.commission.id },
        relatedCategories: crossReferenceCategories(text, category),
      }

      if (opts.dryRunPages !== null) {
        console.log(
          `  ${tag} ${rec.caseNumber} · ${category} · ${row.disposalDate} · ` +
            `${row.complainant ?? '?'} v ${row.respondent ?? '?'} · ` +
            `${text ? `${text.length.toLocaleString()} chars` : 'NO TEXT'} · related ${JSON.stringify(row.relatedCategories)}`,
        )
        continue
      }
      try {
        if (opts.out) appendFileSync(opts.out, ndjson({ row }))
        else await upsertPrecedent(row)
      } catch (err) {
        result.failed++
        console.error(`  ! ${tag} failed to save ${rec.caseNumber}: ${(err as Error).message}`)
      }
    }

    if (end) break
    await sleep(1000) // be polite to a government service
  }

  return result
}

async function main(): Promise<void> {
  const state = arg('state', 'MAHARASHTRA')
  const from = arg('from', '2020-01-01')
  const to = arg('to', new Date().toISOString().slice(0, 10))
  const size = Number(arg('size', '10'))
  const concurrency = Number(arg('concurrency', '3'))
  const categoryMax = Number(arg('category-max', '50'))
  const dryRunPages = hasFlag('dry-run') ? Number(arg('dry-run', '1')) : null
  const out = arg('out', '') || null
  const minutes = Number(arg('time-limit', '0'))
  const deadline = minutes > 0 ? Date.now() + minutes * 60_000 : Infinity
  const loadPath = arg('load', '')

  if ((loadPath || (dryRunPages === null && !out)) && !process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at your Postgres (e.g. the Railway connection string).')
    process.exit(1)
  }

  if (loadPath) return load(loadPath)

  const commissions = await discoverCommissions(state)
  const categories = (await fetchCaseCategories())
    .filter((c) => c.case_category_id <= categoryMax)
    .map((c) => ({ id: c.case_category_id, name: c.case_category_name_en.trim() }))

  let tasks = buildTasks(commissions, from, to)
  if (out && !hasFlag('force')) {
    const done = await finishedInFile(out)
    tasks = tasks.filter((t) => !done.has(t.key))
  } else if (dryRunPages === null && !out) {
    await initPrecedentTable()
    await initProgressTable()
    if (!hasFlag('force')) {
      const done = await finishedTasks()
      tasks = tasks.filter((t) => !done.has(t.key))
    }
  }

  console.log(
    `${state}: ${commissions.length} commissions, disposed ${from} → ${to}. ` +
      `${tasks.length} commission-years to sweep, ${concurrency} at a time` +
      `${dryRunPages !== null ? ` — DRY RUN, ${dryRunPages} page(s) each, no writes` : ''}` +
      `${out ? ` — writing to ${out}` : ''}.\n`,
  )
  for (const c of commissions) console.log(`  ${String(c.id).padStart(8)}  ${c.label}`)
  console.log()

  const totals: TaskResult = { cases: 0, withText: 0, failed: 0 }
  const failedTasks: string[] = []
  let next = 0
  let completed = 0

  async function worker(): Promise<void> {
    while (next < tasks.length) {
      const task = tasks[next++]
      const tag = `[${task.commission.label} ${task.year}]`
      try {
        const r = await runTask(task, categories, { size, dryRunPages, out, deadline })
        totals.cases += r.cases
        totals.withText += r.withText
        totals.failed += r.failed
        // A task with failed writes is left unfinished so a re-run retries it.
        if (r.failed === 0 && out) appendFileSync(out, ndjson({ task: task.key, cases: r.cases }))
        else if (r.failed === 0 && dryRunPages === null) await markTaskFinished(task.key, r.cases)
        completed++
        console.log(
          `✓ ${tag} ${r.cases} judgements, ${r.withText} with text` +
            `${r.failed ? `, ${r.failed} FAILED` : ''} — ${completed}/${tasks.length} tasks, ` +
            `${totals.cases.toLocaleString()} cases so far`,
        )
      } catch (err) {
        if (err instanceof TimeUp) {
          console.log(`⏱ ${tag} stopped at the time limit — will be redone on the next run`)
          next = tasks.length
          continue
        }
        failedTasks.push(task.key)
        console.error(`✗ ${tag} abandoned: ${(err as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  console.log('\n=== summary ===')
  console.log(`  ${totals.cases.toLocaleString()} judgements, ${totals.withText.toLocaleString()} with text, ${totals.failed} failed writes`)
  if (failedTasks.length) {
    console.log(`  ${failedTasks.length} task(s) abandoned — re-run to retry: ${failedTasks.join(', ')}`)
  }
  if (dryRunPages === null && !out) {
    console.log(`  ${(await countPrecedents()).toLocaleString()} rows in precedent_cases`)
    await closePrecedentPool()
  }
  if (failedTasks.length) process.exitCode = 1
}

// pdf.js (inside pdf-parse) rejects promises it never awaits when a PDF is
// corrupt ("bad XRef entry"), which escapes extractJudgmentText's try/catch and
// would otherwise kill an hours-long sweep. The affected case is already stored
// without text; log and carry on.
process.on('unhandledRejection', (reason) => {
  console.warn(`  ! ignored stray PDF error: ${(reason as Error)?.message ?? reason}`)
})

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

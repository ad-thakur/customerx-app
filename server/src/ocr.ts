/**
 * OCR the scanned judgement orders that the sweeps stored without text.
 *
 * Many orders — older ones especially, and every order from some districts —
 * are uploaded to e-Jagriti as page images with no text layer, so pdf-parse
 * returns nothing. This re-fetches each such order by case number, renders its
 * pages with poppler (pdftoppm) and reads them with Tesseract (English, Marathi
 * and Hindi), then fills judgment_text in place.
 *
 * Needs `pdftoppm` and `tesseract` (with the eng, mar and hin language data) on
 * PATH — see nixpacks.toml for the Railway build.
 *
 * Usage (from server/, after `npm run build:ingest`):
 *   DATABASE_URL=postgres://… node dist/ocr.js [options]
 *
 *   --concurrency 8      orders OCR'd in parallel (each runs one tesseract at a time)
 *   --max-pages 30       pages read per order; long tails are rare and costly
 *   --dpi 200            render resolution
 *   --limit 20           stop after this many orders (for a smoke test)
 *
 * Resumable: every order tried — filled or not — is recorded in ingest_progress
 * as `ocr:<case number>`, and only still-empty rows are ever written.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { searchCaseByNumber } from './ejagriti.js'
import { crossReferenceCategories } from './categories.js'
import { extractJudgmentText } from './judgmentText.js'
import {
  closePrecedentPool,
  fillJudgmentText,
  initProgressTable,
  listOcrCandidates,
  markTaskFinished,
  type OcrCandidate,
} from './precedentStore.js'

const run = promisify(execFile)

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const concurrency = Number(arg('concurrency', '8'))
const maxPages = Number(arg('max-pages', '30'))
const dpi = Number(arg('dpi', '200'))
const limit = Number(arg('limit', '0'))

/** Fewer than this many characters is noise (a stamp, a page number), not text. */
const MIN_TEXT = 200

// pdf.js inside pdf-parse can reject promises it never awaits on a corrupt PDF;
// that must not end a run that takes hours.
process.on('unhandledRejection', (reason) => {
  console.warn(`  ! ignored stray PDF error: ${(reason as Error)?.message ?? reason}`)
})

/** Render a PDF's pages to PNG and OCR them in order. */
async function ocrPdf(pdf: Buffer): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-'))
  try {
    await writeFile(join(dir, 'order.pdf'), pdf)
    await run('pdftoppm', ['-r', String(dpi), '-gray', '-png', '-l', String(maxPages), 'order.pdf', 'page'], {
      cwd: dir,
      timeout: 300_000,
    })
    const pages = (await readdir(dir)).filter((f) => f.endsWith('.png')).sort()
    const texts: string[] = []
    for (const page of pages) {
      const { stdout } = await run('tesseract', [page, 'stdout', '-l', 'eng+mar+hin', '--psm', '3'], {
        cwd: dir,
        timeout: 300_000,
        maxBuffer: 32 * 1024 * 1024,
        // One thread per tesseract; parallelism comes from --concurrency.
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      })
      texts.push(stdout)
    }
    return texts
      .join('\n')
      .replace(/\u0000/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

type Outcome = 'filled' | 'empty' | 'no-document' | 'failed'

async function ocrCase(c: OcrCandidate): Promise<{ outcome: Outcome; chars: number }> {
  const year = c.disposalDate ? Number(c.disposalDate.slice(0, 4)) : new Date().getFullYear()
  const records = await searchCaseByNumber({
    caseNumber: c.caseNumber,
    commissionId: c.commissionId,
    fromDate: `${year - 1}-01-01`,
    toDate: `${year + 1}-12-31`,
  })
  const rec = records.find((r) => r.caseNumber === c.caseNumber)
  const doc = rec?.judgmentOrderDocumentBase64
  if (!rec || !doc) return { outcome: 'no-document', chars: 0 }

  // The refetch sometimes returns a readable order (HTML, or a PDF with a text
  // layer) where the original listing did not; use that before OCR.
  let text = await extractJudgmentText(rec)
  if (!text || text.length < MIN_TEXT) {
    if (doc.trimStart().startsWith('<')) return { outcome: 'empty', chars: 0 }
    text = await ocrPdf(Buffer.from(doc, 'base64'))
  }
  if (text.length < MIN_TEXT) return { outcome: 'empty', chars: text.length }

  const filled = await fillJudgmentText(c.caseNumber, text, crossReferenceCategories(text, c.category))
  return { outcome: filled ? 'filled' : 'empty', chars: text.length }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.')
    process.exit(1)
  }
  await initProgressTable()
  let queue = await listOcrCandidates()
  if (limit > 0) queue = queue.slice(0, limit)
  console.log(
    `OCR: ${queue.length.toLocaleString()} scanned orders to read, ${concurrency} at a time ` +
      `(≤${maxPages} pages each, ${dpi} dpi).\n`,
  )

  const counts: Record<Outcome, number> = { filled: 0, empty: 0, 'no-document': 0, failed: 0 }
  const started = Date.now()
  let next = 0

  async function worker(): Promise<void> {
    while (next < queue.length) {
      const c = queue[next++]
      try {
        const { outcome, chars } = await ocrCase(c)
        counts[outcome]++
        await markTaskFinished(`ocr:${c.caseNumber}`, chars)
        if (outcome === 'filled') console.log(`  + ${c.caseNumber} — ${chars.toLocaleString()} chars`)
        else console.log(`  · ${c.caseNumber} — ${outcome}`)
      } catch (err) {
        // Not marked, so the next run retries it.
        counts.failed++
        console.error(`  ! ${c.caseNumber}: ${(err as Error).message}`)
      }
      const done = counts.filled + counts.empty + counts['no-document'] + counts.failed
      if (done % 100 === 0) {
        const perHour = Math.round(done / ((Date.now() - started) / 3_600_000))
        console.log(
          `— ${done.toLocaleString()}/${queue.length.toLocaleString()} · filled ${counts.filled.toLocaleString()} · ` +
            `${perHour.toLocaleString()}/hour`,
        )
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker))

  console.log(
    `\nDone. Filled ${counts.filled.toLocaleString()}, unreadable ${counts.empty.toLocaleString()}, ` +
      `no document ${counts['no-document'].toLocaleString()}, failed ${counts.failed.toLocaleString()} ` +
      `(failed ones are retried on the next run).`,
  )
  await closePrecedentPool()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

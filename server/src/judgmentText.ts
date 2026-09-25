/**
 * Turning e-Jagriti's order document into plain judgment text. Shared by the
 * category ingest (ingest.ts) and the per-state sweep (ingestState.ts).
 */
// pdf-parse's package entry has a debug block that breaks under ESM; import the lib directly.
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import type { EJagritiCaseRecord } from './ejagriti.js'

/**
 * e-Jagriti's `judgmentOrderDocumentBase64` is misnamed: for some cases it is a
 * base64-encoded PDF, but for most it is a raw HTML fragment holding the order
 * text. Convert that HTML to plain text.
 */
export function htmlToText(html: string): string {
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

/** Postgres TEXT cannot hold U+0000, which some PDFs' text layers contain. */
function stripNul(s: string): string {
  return s.replace(/\u0000/g, '')
}

export async function extractJudgmentText(rec: EJagritiCaseRecord): Promise<string | null> {
  const raw = rec.judgmentOrderDocumentBase64
  if (!raw) return null

  // Two formats come back under the same field. A base64 PDF begins "JVBERi"
  // ("%PDF" encoded); an HTML fragment begins with a tag.
  const head = raw.trimStart().slice(0, 20).toLowerCase()
  const looksHtml = head.startsWith('<')

  if (looksHtml) {
    const text = stripNul(htmlToText(raw))
    if (text.length > 0) return text
    console.warn(`  ! empty HTML order for ${rec.caseNumber}`)
    return null
  }

  try {
    const parsed = await pdfParse(Buffer.from(raw, 'base64'))
    const text = stripNul(parsed.text ?? '').replace(/\s+\n/g, '\n').trim()
    return text && text.length > 0 ? text : null
  } catch (err) {
    console.warn(`  ! could not parse judgment PDF for ${rec.caseNumber}: ${(err as Error).message}`)
    return null
  }
}

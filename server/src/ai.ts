// AI layer for the ₹499 assessment.
//
// Positioning (per the founder memo): the model is a cost-of-ops reducer, not
// the product claim. The rules engine produces the verdict — band, range,
// drivers. The model only (a) ranks/annotates retrieved precedents against
// the case facts and (b) writes a plain-language narrative around numbers it
// is given and must not change. AI switched off (aiSwitch.ts), or any failure →
// the assessment ships rules-only. "AI legal advice" is exactly the
// regulatory posture to avoid.

import Anthropic from '@anthropic-ai/sdk'
import type { AiAssessment, Assessment, CaseRecord } from './types.js'
import { GROUND_LABELS, readGrounds } from './caseLogic.js'
import type { PrecedentResult } from './precedents.js'
import { aiEnabled } from './aiSwitch.js'

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001'

const SYSTEM = `You write short, factual, cautious summaries for an Indian consumer-grievance product. You are NOT a lawyer and must never give legal advice, predict court outcomes as certainties, or invent facts, case law, or statutory text. You work only from the structured inputs provided. The numeric assessment (band, recovery range) was produced by a deterministic rules engine — you must repeat those numbers exactly and never alter or second-guess them. Write in plain English at a 10th-grade reading level. Refer to the consumer as "you". Output ONLY valid JSON matching the requested schema — no markdown, no commentary.`

interface AiOutput {
  narrative: string
  precedents: { title: string; docUrl: string; court: string; note: string }[]
}

export async function generateAiAssessment(
  c: CaseRecord,
  rules: Omit<Assessment, 'ai' | 'paidAt' | 'receiptId'>,
  precedents: PrecedentResult[],
): Promise<AiAssessment | null> {
  if (!aiEnabled()) return null
  const apiKey = process.env.ANTHROPIC_API_KEY

  try {
    const client = new Anthropic({ apiKey })

    const input = {
      case: {
        grounds: readGrounds(c.intake).map((g) => GROUND_LABELS[g]),
        narrative: c.intake.narrative.slice(0, 1500),
        companyName: c.intake.companyName,
        claimAmount: c.intake.claimAmount,
        consequentialLoss: c.intake.consequentialLoss,
        evidenceCategories: c.intake.evidence.map((e) => e.category),
        commission: c.routing.commissionLabel,
        limitationDaysRemaining: c.routing.limitation.daysRemaining,
        limitationExpired: c.routing.limitation.expired,
        evidenceScore: c.routing.evidenceScore,
      },
      rulesAssessment: {
        band: rules.band,
        rangeLowINR: rules.rangeLow,
        rangeHighINR: rules.rangeHigh,
        recommendedRoute: rules.route,
        drivers: rules.drivers,
      },
      retrievedPrecedents: precedents.map((p) => ({
        title: p.title,
        docUrl: p.docUrl,
        court: p.court,
        snippet: p.snippet,
      })),
    }

    const prompt = `Structured case inputs:
${JSON.stringify(input, null, 2)}

Tasks:
1. "narrative": 2 short paragraphs (max 130 words total). Paragraph 1: what the rules-engine assessment means for this specific case, citing the band and the exact range ₹${rules.rangeLow.toLocaleString('en-IN')}–₹${rules.rangeHigh.toLocaleString('en-IN')}. Paragraph 2: the single most useful next step given the evidence drivers. Hedge appropriately ("comparable cases", "typically") — never promise an outcome.
2. "precedents": from retrievedPrecedents ONLY, pick up to 3 most relevant to this case. For each: copy title/docUrl/court unchanged, and write "note" (max 30 words) on why it is relevant to THIS case. If none are relevant, return [].

Return JSON: {"narrative": string, "precedents": [{"title": string, "docUrl": string, "court": string, "note": string}]}`

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      // Tolerate accidental code fencing despite instructions.
      .replace(/^```(?:json)?\s*/, '')
      .replace(/\s*```$/, '')

    const parsed = JSON.parse(text) as AiOutput
    if (typeof parsed.narrative !== 'string' || !Array.isArray(parsed.precedents)) return null

    // Guardrail: only allow precedent URLs that actually came from retrieval —
    // the model must not introduce sources.
    const allowedUrls = new Set(precedents.map((p) => p.docUrl))
    const safePrecedents = parsed.precedents
      .filter((p) => allowedUrls.has(p.docUrl))
      .slice(0, 3)
      .map((p) => ({
        title: String(p.title),
        docUrl: String(p.docUrl),
        court: String(p.court ?? ''),
        note: String(p.note ?? '').slice(0, 300),
      }))

    return {
      narrative: parsed.narrative.slice(0, 1200),
      precedents: safePrecedents,
      model: MODEL,
      generatedAt: new Date().toISOString(),
    }
  } catch (err) {
    // Any AI failure degrades gracefully to the rules-only assessment.
    console.error('AI assessment generation failed:', (err as Error).message)
    return null
  }
}

// ---------------------------------------------------------------------------
// Notice drafting assistance.
//
// The deterministic draftsman (frontend: lib/noticeDraft.ts) remains the author
// of the notice — its structure, numbered paragraphs, statutory citations and
// the ₹ figures/dates are fixed by rules and must never be touched by the model.
// The AI only assists with the *language* the complainant is allowed to edit:
//
//   - fillNoticeGaps:  resolve the [BRACKETED] placeholders the draftsman leaves
//                      where the intake didn't supply a specific — but ONLY from
//                      the client's own inputs. Never invent a fact.
//   - rewordNoticeText: restate a passage the user selected, same meaning,
//                       different phrasing/tone. Never change a figure or date.
//
// Both are suggest-and-accept on the frontend: nothing the model returns is
// written into the legal document without the user explicitly accepting it.
// ---------------------------------------------------------------------------

const DRAFT_SYSTEM = `You assist a self-represented consumer in India with the *wording* of a pre-litigation legal notice under the Consumer Protection Act, 2019. You are NOT a lawyer and give no legal advice. Hard rules, without exception:
- Work ONLY from the client inputs provided. NEVER invent a fact: no invoice/order numbers, no payment modes, no amounts, no interest rates, no dates, no product names, no representations that the client did not give you.
- NEVER add, remove, or alter any ₹ amount, any date, any percentage, or any statutory section number. Reproduce them exactly as they appear.
- Keep the same legal meaning. Do not overstate, do not concede, do not add new allegations.
- Write in clear, formal Indian legal-notice English. Refer to the notice-giver in the first person ("I", "me") — this notice is sent by the consumer personally.
- If you genuinely cannot fill a placeholder from the inputs, leave a short, plain placeholder in square brackets describing what the client must supply (e.g. "[your invoice number]"). Do not guess.
Output ONLY valid JSON in the exact schema requested — no markdown, no commentary.`

/** Extracts every ₹ money token so we can prove the model didn't touch figures. */
function moneyTokens(s: string): string[] {
  return (s.match(/₹\s?[\d,]+/g) ?? []).map((t) => t.replace(/\s/g, ''))
}

/** All bracketed placeholders in a string. */
function placeholders(s: string): string[] {
  return s.match(/\[[^\]\n]{2,}\]/g) ?? []
}

function newClient(): Anthropic | null {
  if (!aiEnabled()) return null
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function extractJson(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
}

/** The subset of intake the drafting model is allowed to see. */
function draftContext(c: CaseRecord) {
  return {
    complainantName: c.intake.fullName || null,
    complainantLocation: [c.intake.city, c.intake.state].filter(Boolean).join(', ') || null,
    companyName: c.intake.companyName || null,
    grounds: readGrounds(c.intake).map((g) => GROUND_LABELS[g]),
    narrative: (c.intake.narrative ?? '').slice(0, 2000),
    transactionDate: c.intake.transactionDate || null,
    incidentDate: c.intake.incidentDate || null,
    claimAmountINR: c.intake.claimAmount,
    consequentialLossINR: c.intake.consequentialLoss,
    evidenceOnRecord: (c.intake.evidence ?? []).map((e) => e.category),
  }
}

export interface NoticeBlockInput {
  id: string
  text: string
  hint?: string
}

/**
 * Fills the [BRACKETED] placeholders in the given blocks from the client's
 * inputs. Returns only the blocks it could improve, as {id, text}. A block
 * whose ₹ figures changed, or which the model didn't actually improve, is
 * dropped — better to leave the honest placeholder than to accept a bad fill.
 */
export async function fillNoticeGaps(
  c: CaseRecord,
  blocks: NoticeBlockInput[],
): Promise<{ id: string; text: string }[]> {
  const client = newClient()
  if (!client || blocks.length === 0) return []

  try {
    const prompt = `Client inputs:
${JSON.stringify(draftContext(c), null, 2)}

Below are paragraphs of the client's legal notice that still contain [BRACKETED] placeholders. For each, return the SAME paragraph with the placeholders replaced by specifics drawn strictly from the client inputs above. Obey every rule in the system prompt — especially: never invent facts, never change any ₹ amount, date, percentage or section number. If a placeholder cannot be filled from the inputs, leave a short plain "[what the client must supply]" placeholder.

Paragraphs (JSON):
${JSON.stringify(
  blocks.map((b) => ({ id: b.id, text: b.text, guidance: b.hint ?? null })),
  null,
  2,
)}

Return JSON: {"filled": [{"id": string, "text": string}]}. Omit any paragraph you did not change.`

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1600,
      system: DRAFT_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = JSON.parse(extractJson(msg)) as { filled?: { id: string; text: string }[] }
    if (!Array.isArray(parsed.filled)) return []

    const byId = new Map(blocks.map((b) => [b.id, b.text]))
    const out: { id: string; text: string }[] = []
    for (const f of parsed.filled) {
      const original = byId.get(String(f.id))
      const text = typeof f.text === 'string' ? f.text.slice(0, 8000) : ''
      if (original === undefined || !text.trim()) continue
      // Guardrail: the model may not add/alter/drop money figures.
      if (moneyTokens(original).sort().join('|') !== moneyTokens(text).sort().join('|')) continue
      // Only surface a genuine improvement: some placeholder must have been resolved.
      if (placeholders(text).length >= placeholders(original).length) continue
      if (text.trim() === original.trim()) continue
      out.push({ id: String(f.id), text })
    }
    return out
  } catch (err) {
    console.error('Notice gap-fill failed:', (err as Error).message)
    return []
  }
}

/**
 * Restates a passage the user selected — same meaning, different wording. Returns
 * up to 3 variants. Any variant that alters a ₹ figure is discarded.
 */
export async function rewordNoticeText(
  c: CaseRecord,
  text: string,
  instruction?: string,
): Promise<string[]> {
  const client = newClient()
  const passage = (text ?? '').trim()
  if (!client || !passage) return []

  try {
    const tone = (instruction ?? '').trim().slice(0, 200) || 'Keep the same tone; just improve clarity and flow.'
    const prompt = `Client inputs (for context only — do not add facts from here that aren't already in the passage):
${JSON.stringify(draftContext(c), null, 2)}

Restate the passage below for the client's legal notice. Instruction: ${tone}
Obey every system-prompt rule: same legal meaning, no new facts, and every ₹ amount, date, percentage and section number reproduced exactly. Preserve any [BRACKETED] placeholders unless the instruction is to fill them from the client inputs.

Passage:
"""
${passage.slice(0, 4000)}
"""

Return JSON: {"variants": [string, ...]} with 2 to 3 rephrasings, best first.`

    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system: DRAFT_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    })

    const parsed = JSON.parse(extractJson(msg)) as { variants?: unknown }
    if (!Array.isArray(parsed.variants)) return []

    const want = moneyTokens(passage).sort().join('|')
    return parsed.variants
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().slice(0, 8000))
      .filter((v) => moneyTokens(v).sort().join('|') === want)
      .slice(0, 3)
  } catch (err) {
    console.error('Notice reword failed:', (err as Error).message)
    return []
  }
}

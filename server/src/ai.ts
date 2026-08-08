// AI layer for the ₹499 assessment.
//
// Positioning (per the founder memo): the model is a cost-of-ops reducer, not
// the product claim. The rules engine produces the verdict — band, range,
// drivers. The model only (a) ranks/annotates retrieved precedents against
// the case facts and (b) writes a plain-language narrative around numbers it
// is given and must not change. No ANTHROPIC_API_KEY (or any failure) →
// the assessment ships rules-only. "AI legal advice" is exactly the
// regulatory posture to avoid.

import Anthropic from '@anthropic-ai/sdk'
import type { AiAssessment, Assessment, CaseRecord } from './types.js'
import { GROUND_LABELS, readGrounds } from './caseLogic.js'
import type { PrecedentResult } from './precedents.js'

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
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

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

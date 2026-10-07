// ---------------------------------------------------------------------------
// AI precedent review.
//
// The statistical estimate in brandAnalysis.ts counts outcomes of keyword
// matches. This goes further: Claude is given the complaint and tools over the
// precedent_cases table, searches it the way a researcher would (different
// phrasings, the product, the defect, the brand itself), reads the operative
// part of the judgments that look close, and returns
//
//   - how a commission would likely decide this complaint, and why
//   - the relief typically awarded in the cases it relied on
//   - the precedents themselves, each with why it is comparable
//
// Guardrails: the model can only cite case numbers its own tool calls
// returned — anything else is dropped — and every cited case is re-read from
// the database for its title, date and outcome, so nothing shown is invented.
// It is framed as a suggestion from published judgments, not legal advice.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk'
import { categoriesForGrounds } from './categories.js'
import { GROUND_LABELS } from './caseLogic.js'
import { classifyOutcome, type ExtractedFacts, type Outcome } from './brandAnalysis.js'
import { readJudgment, searchCorpus, type Brand, type Complaint } from './brandStore.js'
import type { GroundId } from './types.js'

const MODEL = process.env.BRAND_AI_MODEL ?? 'claude-opus-5-5'
const MAX_TURNS = 12

export type ReviewOutcome = 'consumer_likely' | 'partly_consumer' | 'brand_likely' | 'uncertain'

export interface ReviewPrecedent {
  caseNumber: string
  title: string
  date: string | null
  outcome: Outcome
  relevance: string
  relief: string | null
}

export interface AiReview {
  status: 'pending' | 'done' | 'failed' | 'disabled'
  outcome?: ReviewOutcome
  confidence?: 'low' | 'medium' | 'high'
  suggestion?: string
  likelyRelief?: string | null
  keyFactors?: string[]
  precedents?: ReviewPrecedent[]
  searches?: number
  casesRead?: number
  model?: string
  generatedAt: string
  error?: string
}

const GROUND_IDS = Object.keys(GROUND_LABELS) as GroundId[]

const SYSTEM = `You are a research assistant to the complaints team of an Indian consumer brand. You have tools over a database of judgments from Indian consumer commissions (mostly the NCDRC). Your job: find the past cases most similar to the complaint in front of you, read them, and say how a consumer commission would likely decide this complaint if it were filed.

How to work:
- Search several times with different phrasings: the product, the specific defect or service failure, the legal ground, and the brand itself (use the party filter). Short, specific queries work best — a few distinctive words, not sentences.
- Read the judgments that look closest (read_judgment) before relying on them. The operative part at the end states the result and any amounts awarded.
- Prefer cases that match on both the product/service and the kind of failure. Note where a case differs.
- Be calibrated. If the comparable cases are thin or mixed, say so and use "uncertain" or a low confidence.
- You are not giving legal advice and must not state an outcome as certain. Never invent cases, facts or amounts — cite only cases your searches returned.

When done, call submit_review exactly once. Cite 3–6 precedents if you found that many relevant ones; fewer is fine if that is all that is genuinely comparable.`

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_precedents',
    description:
      'Full-text search over consumer-commission judgments. Returns up to `limit` cases with parties, date, stage and a matching snippet. Use short, distinctive queries. Optionally restrict to legal grounds and/or to cases where a named company was a party.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'A few distinctive words, e.g. "washing machine drum error repeated repair".' },
        grounds: {
          type: 'array',
          items: { type: 'string', enum: GROUND_IDS },
          description: 'Restrict to the e-Jagriti categories for these grounds. Omit to search all categories.',
        },
        party: { type: 'string', description: 'Only cases where this company name appears as a party, e.g. the brand.' },
        limit: { type: 'integer', minimum: 1, maximum: 15 },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_judgment',
    description:
      'Read one judgment: parties, dates, the opening (facts) and the operative part (result, amounts awarded, costs).',
    input_schema: {
      type: 'object',
      properties: { case_number: { type: 'string' } },
      required: ['case_number'],
    },
  },
  {
    name: 'submit_review',
    description: 'Submit the final review. Call once, at the end.',
    input_schema: {
      type: 'object',
      properties: {
        outcome: { type: 'string', enum: ['consumer_likely', 'partly_consumer', 'brand_likely', 'uncertain'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        suggestion: {
          type: 'string',
          description: 'Two short paragraphs, max 140 words: the likely result and why, drawing on the precedents; then what the brand should weigh.',
        },
        likely_relief: {
          type: ['string', 'null'],
          description: 'If the consumer would likely succeed: the relief typically awarded in the comparable cases (refund/replacement, compensation range, costs). Null otherwise.',
        },
        key_factors: { type: 'array', items: { type: 'string' }, description: '3–5 short factors that drive the result.' },
        precedents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              case_number: { type: 'string' },
              relevance: { type: 'string', description: 'One sentence: why this case is comparable, and any important difference.' },
              relief: { type: ['string', 'null'], description: 'What was awarded, if stated in the judgment.' },
            },
            required: ['case_number', 'relevance'],
          },
        },
      },
      required: ['outcome', 'confidence', 'suggestion', 'key_factors', 'precedents'],
    },
  },
]

function toDate(d: Date | string | null): string | null {
  if (!d) return null
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

interface SubmitInput {
  outcome: ReviewOutcome
  confidence: 'low' | 'medium' | 'high'
  suggestion: string
  likely_relief?: string | null
  key_factors: string[]
  precedents: { case_number: string; relevance: string; relief?: string | null }[]
}

export async function reviewPrecedents(c: Complaint, brand: Brand, facts: ExtractedFacts): Promise<AiReview> {
  const now = () => new Date().toISOString()
  if (!process.env.ANTHROPIC_API_KEY) return { status: 'disabled', generatedAt: now() }

  const client = new Anthropic()
  const seen = new Set<string>()
  let searches = 0
  let casesRead = 0

  const runTool = async (name: string, input: Record<string, unknown>): Promise<string> => {
    if (name === 'search_precedents') {
      searches++
      const grounds = (Array.isArray(input.grounds) ? input.grounds : []).filter((g): g is GroundId =>
        GROUND_IDS.includes(g as GroundId),
      )
      const hits = await searchCorpus({
        query: String(input.query ?? '').slice(0, 300),
        categories: grounds.length ? categoriesForGrounds(grounds) : null,
        party: typeof input.party === 'string' ? input.party.slice(0, 120) : null,
        limit: Math.min(15, Math.max(1, Number(input.limit) || 8)),
      })
      hits.forEach((h) => seen.add(h.caseNumber))
      if (hits.length === 0) return 'No matching judgments. Try fewer or different words, or drop the grounds filter.'
      return JSON.stringify(
        hits.map((h) => ({
          case_number: h.caseNumber,
          parties: `${h.complainant ?? '?'} v. ${h.respondent ?? '?'}`,
          category: h.category,
          stage: h.stage,
          outcome_for_consumer: classifyOutcome(h.caseNumber, h.stage, h.complainant, h.tail),
          date: toDate(h.judgmentDate),
          snippet: h.snippet.replace(/<\/?b>/g, '').slice(0, 400),
        })),
      )
    }
    if (name === 'read_judgment') {
      const j = await readJudgment(String(input.case_number ?? ''))
      if (!j) return 'No judgment with that case number.'
      casesRead++
      seen.add(j.caseNumber)
      return JSON.stringify({
        case_number: j.caseNumber,
        commission: j.commission,
        category: j.category,
        parties: `${j.complainant ?? '?'} v. ${j.respondent ?? '?'}`,
        stage: j.stage,
        filed: toDate(j.filingDate),
        decided: toDate(j.judgmentDate),
        opening: j.opening,
        operative_part: j.length > 2500 ? j.operative : '(see opening — short judgment)',
      })
    }
    return `Unknown tool ${name}`
  }

  const brief = {
    brand: brand.name,
    brand_registered_names: brand.aliases,
    complaint: {
      subject: c.subject,
      text: c.body.slice(0, 5000),
      product: facts.product || c.product || null,
      amount_paid_inr: facts.amount,
      purchase_date: facts.purchaseDate,
      received: c.receivedAt.slice(0, 10),
    },
    extracted: {
      likely_grounds: facts.grounds,
      has_invoice: facts.hasInvoice,
      has_photos: facts.hasPhotos,
      prior_contacts: facts.priorContacts,
      repair_attempts: facts.serviceVisits,
      within_warranty: facts.withinWarranty,
    },
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Complaint to review:\n${JSON.stringify(brief, null, 2)}\n\nResearch comparable judgments and submit your review.`,
    },
  ]

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Server-side refusal fallback (beta): if the model declines, the API
      // re-runs the request on a fallback model inside the same call.
      const msg = (await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming)) as unknown as Anthropic.Message

      if ((msg.stop_reason as string) === 'refusal') throw new Error('The model declined this request')

      // Pass the assistant turn back unchanged (thinking blocks included).
      messages.push({ role: 'assistant', content: msg.content as Anthropic.MessageParam['content'] })

      const uses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      const submit = uses.find((u) => u.name === 'submit_review')
      if (submit) return finalise(submit.input as SubmitInput)

      if (uses.length === 0) {
        messages.push({ role: 'user', content: 'Please call submit_review with your conclusions now.' })
        continue
      }

      const results: Anthropic.ToolResultBlockParam[] = []
      for (const u of uses) {
        try {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: await runTool(u.name, u.input as Record<string, unknown>) })
        } catch (err) {
          results.push({ type: 'tool_result', tool_use_id: u.id, content: `Tool error: ${(err as Error).message}`, is_error: true })
        }
      }
      // All results for the turn go back in one user message.
      messages.push({ role: 'user', content: results })
    }
    throw new Error('Review did not finish within the turn limit')
  } catch (err) {
    console.error(`[brand-review] ${c.id}:`, (err as Error).message)
    return { status: 'failed', error: (err as Error).message.slice(0, 200), generatedAt: now() }
  }

  async function finalise(out: SubmitInput): Promise<AiReview> {
    // Only cases the tools actually returned — the model may not introduce sources.
    const cited = (Array.isArray(out.precedents) ? out.precedents : [])
      .filter((p) => p && typeof p.case_number === 'string' && seen.has(p.case_number))
      .slice(0, 6)
    const precedents: ReviewPrecedent[] = []
    for (const p of cited) {
      const j = await readJudgment(p.case_number)
      if (!j) continue
      precedents.push({
        caseNumber: j.caseNumber,
        title: `${j.complainant ?? 'Complainant'} v. ${j.respondent ?? 'Respondent'}`,
        date: toDate(j.judgmentDate),
        outcome: classifyOutcome(j.caseNumber, j.stage, j.complainant, j.operative),
        relevance: String(p.relevance ?? '').slice(0, 400),
        relief: typeof p.relief === 'string' ? p.relief.slice(0, 300) : null,
      })
    }
    const outcomes: ReviewOutcome[] = ['consumer_likely', 'partly_consumer', 'brand_likely', 'uncertain']
    return {
      status: 'done',
      outcome: outcomes.includes(out.outcome) ? out.outcome : 'uncertain',
      confidence: ['low', 'medium', 'high'].includes(out.confidence) ? out.confidence : 'low',
      suggestion: String(out.suggestion ?? '').slice(0, 1500),
      likelyRelief: typeof out.likely_relief === 'string' ? out.likely_relief.slice(0, 400) : null,
      keyFactors: (Array.isArray(out.key_factors) ? out.key_factors : []).map((f) => String(f).slice(0, 200)).slice(0, 6),
      precedents,
      searches,
      casesRead,
      model: MODEL,
      generatedAt: now(),
    }
  }
}

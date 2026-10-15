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
import type { ExtractedFacts, PrecedentView } from './brandAnalysis.js'
import { classifyOutcome, isMeritsCase, type Outcome } from './outcome.js'
import { readJudgment, searchCorpus, type Brand, type Complaint } from './brandStore.js'
import type { Meter } from './brandAi.js'
import type { GroundId } from './types.js'
import { aiEnabled } from './aiSwitch.js'

const MODEL = process.env.BRAND_AI_MODEL ?? 'claude-opus-5-5'
const MAX_TURNS = 8

export type ReviewOutcome = 'consumer_likely' | 'partly_consumer' | 'brand_likely' | 'uncertain'

export interface ReviewPrecedent {
  caseNumber: string
  title: string
  /** e.g. "NCDRC", "Pune District Commission, MAHARASHTRA". */
  court?: string
  date: string | null
  outcome: Outcome
  relevance: string
  relief: string | null
}

export interface AiReview {
  /** 'limit' = the brand's monthly AI-analysis allowance was used up. */
  status: 'pending' | 'done' | 'failed' | 'disabled' | 'limit'
  /** The consumer has changed the complaint since this review ran. */
  outdated?: boolean
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

Which courts to rely on: the National Commission (NCDRC) carries the most weight. Base the review mainly on NCDRC judgments — about 80–90% of the precedents you cite — and use State or District Commission judgments for the remaining 10–20%, only where they are genuinely close. If there are no comparable State or District cases, cite only NCDRC ones. search_precedents returns mostly NCDRC cases unless you ask for court "local".

Reading each precedent's outcome, from the consumer's side:
- "consumer": the commission awarded the consumer anything — a refund, replacement, repair, compensation or costs, in full or in part — or dismissed the business's appeal against such an award.
- "brand": the consumer's complaint was dismissed or rejected (including on limitation or maintainability), or the business's appeal was allowed.
- "settled" or "withdrawn" where the order says so.
Every precedent you cite must have one of these outcomes, read from its operative part. Do not cite a case whose result you could not determine.

Work efficiently: you already have a shortlist of comparable cases with their outcomes. Call several tools at once in a single turn where you can (e.g. read three judgments together), and submit within about four turns.

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
        court: {
          type: 'string',
          enum: ['ncdrc', 'local', 'all'],
          description: 'ncdrc = National Commission only; local = State and District Commissions only; all (default) = mostly NCDRC with about a fifth from State/District.',
        },
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
              outcome: {
                type: 'string',
                enum: ['consumer', 'brand', 'settled', 'withdrawn'],
                description: 'Who prevailed, read from the operative part. Any relief awarded to the consumer = consumer.',
              },
            },
            required: ['case_number', 'relevance', 'outcome'],
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
  precedents: { case_number: string; relevance: string; relief?: string | null; outcome?: string }[]
}

export async function reviewPrecedents(
  c: Complaint,
  brand: Brand,
  facts: ExtractedFacts,
  meter?: Meter,
  shortlist: PrecedentView[] = [],
): Promise<AiReview> {
  const now = () => new Date().toISOString()
  if (!aiEnabled()) return { status: 'disabled', generatedAt: now() }

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
      const base = {
        query: String(input.query ?? '').slice(0, 300),
        categories: grounds.length ? categoriesForGrounds(grounds) : null,
        party: typeof input.party === 'string' ? input.party.slice(0, 120) : null,
      }
      const limit = Math.min(15, Math.max(1, Number(input.limit) || 8))
      const court = input.court === 'ncdrc' || input.court === 'local' ? input.court : 'all'
      // Default: NCDRC-led, with about one State/District case per four national ones.
      const found =
        court === 'all'
          ? (
              await Promise.all([
                searchCorpus({ ...base, limit, court: 'ncdrc' }),
                searchCorpus({ ...base, limit: Math.max(1, Math.round(limit / 4)), court: 'local' }),
              ])
            ).flat()
          : await searchCorpus({ ...base, limit, court })
      const hits = found.filter((h) => isMeritsCase(h.caseNumber))
      hits.forEach((h) => seen.add(h.caseNumber))
      if (hits.length === 0) return 'No matching judgments. Try fewer or different words, or drop the grounds filter.'
      return JSON.stringify(
        hits.map((h) => ({
          case_number: h.caseNumber,
          court: h.commission,
          parties: `${h.complainant ?? '?'} v. ${h.respondent ?? '?'}`,
          category: h.category,
          stage: h.stage,
          outcome_for_consumer: classifyOutcome(h.caseNumber, h.stage, h.complainant, h.tail, h.respondent),
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

  // A head start: the comparable cases the statistical analysis already found,
  // with their outcomes, so the agent reads and refines rather than searching
  // from nothing.
  shortlist.forEach((p) => seen.add(p.caseNumber))
  const start = shortlist.slice(0, 15).map((p) => ({
    case_number: p.caseNumber,
    court: p.court,
    parties: p.title,
    outcome_for_consumer: p.outcome,
    date: p.date,
    snippet: p.snippet.slice(0, 240),
  }))

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content:
        `Complaint to review:\n${JSON.stringify(brief, null, 2)}\n\n` +
        (start.length
          ? `Comparable cases already found (mostly NCDRC):\n${JSON.stringify(start, null, 2)}\n\nRead the closest of these, search further only where they are thin, and submit your review.`
          : 'Research comparable judgments and submit your review.'),
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

      if (meter) {
        meter.input += msg.usage?.input_tokens ?? 0
        meter.output += msg.usage?.output_tokens ?? 0
      }
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

      // The agent's tool calls in one turn are independent: run them together.
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        uses.map(async (u): Promise<Anthropic.ToolResultBlockParam> => {
          try {
            return { type: 'tool_result', tool_use_id: u.id, content: await runTool(u.name, u.input as Record<string, unknown>) }
          } catch (err) {
            return { type: 'tool_result', tool_use_id: u.id, content: `Tool error: ${(err as Error).message}`, is_error: true }
          }
        }),
      )
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
      .filter((p) => p && typeof p.case_number === 'string' && seen.has(p.case_number) && isMeritsCase(p.case_number))
      .slice(0, 8)
    const modelOutcome: Record<string, Outcome> = { consumer: 'consumer', brand: 'business', settled: 'settled', withdrawn: 'withdrawn' }
    const read = await Promise.all(cited.map((p) => readJudgment(p.case_number)))
    const all: ReviewPrecedent[] = []
    cited.forEach((p, i) => {
      const j = read[i]
      if (!j) return
      // The rules read the operative order first; where they can't, the
      // agent's own reading of it (it has just read the judgment) is used. A
      // precedent with no determinable result is not shown at all.
      const ruled = classifyOutcome(j.caseNumber, j.stage, j.complainant, j.operative, j.respondent)
      const outcome = ruled !== 'unknown' ? ruled : (modelOutcome[String(p.outcome)] ?? 'unknown')
      if (outcome === 'unknown') return
      all.push({
        caseNumber: j.caseNumber,
        title: `${j.complainant ?? 'Complainant'} v. ${j.respondent ?? 'Respondent'}`,
        court: j.commission,
        date: toDate(j.judgmentDate),
        outcome,
        relevance: String(p.relevance ?? '').slice(0, 400),
        relief: typeof p.relief === 'string' ? p.relief.slice(0, 300) : null,
      })
    })
    // Keep the mix NCDRC-led: State/District precedents at most a fifth of
    // those shown (at least one allowed), or all of them if no NCDRC case fits.
    const nationalP = all.filter((p) => p.court === 'NCDRC')
    const localP = all.filter((p) => p.court !== 'NCDRC')
    const localCap = nationalP.length ? Math.max(1, Math.floor((nationalP.length + 1) / 4)) : localP.length
    const precedents = [...nationalP, ...localP.slice(0, localCap)].slice(0, 6)
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

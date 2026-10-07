// ---------------------------------------------------------------------------
// Optional AI layer for the brand dashboard.
//
// Same rule as ai.ts on the consumer side: the model never produces the
// numbers. It does two things the keyword rules do badly —
//
//   1. extractFacts(): reads a free-text complaint (often a forwarded email)
//      and pulls out product, amount, dates and evidence signals.
//   2. writeNarrative(): two short paragraphs explaining the deterministic
//      analysis to a support lead, and a polished first-response draft.
//
// AI switched off (aiSwitch.ts), or any failure → the rules-based path is used and the
// dashboard still works end to end.
// ---------------------------------------------------------------------------

import Anthropic from '@anthropic-ai/sdk'
import { extractFactsByRules, type ComplaintAnalysis, type ExtractedFacts } from './brandAnalysis.js'
import type { Brand, Complaint, OfferKind } from './brandStore.js'
import type { GroundId } from './types.js'
import { aiEnabled } from './aiSwitch.js'

const MODEL = process.env.BRAND_AI_MODEL ?? 'claude-opus-5-5'

const GROUND_IDS: GroundId[] = [
  'defective_goods',
  'deficient_service',
  'unfair_trade_practice',
  'overcharging',
  'spurious_goods',
  'hazardous_goods',
  'misleading_ad',
]

function client(): Anthropic | null {
  return aiEnabled() ? new Anthropic() : null
}

/** Running token count for one analysis, so usage can be billed and costed. */
export interface Meter {
  input: number
  output: number
}

export function newMeter(): Meter {
  return { input: 0, output: 0 }
}

async function askJson<T>(system: string, prompt: string, maxTokens: number, meter?: Meter): Promise<T | null> {
  const c = client()
  if (!c) return null
  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  if (meter) {
    meter.input += msg.usage?.input_tokens ?? 0
    meter.output += msg.usage?.output_tokens ?? 0
  }
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/, '')
    .replace(/\s*```$/, '')
  return JSON.parse(text) as T
}

/* -------------------------------------------------------------------------- */

const EXTRACT_SYSTEM = `You extract structured facts from consumer complaints sent to an Indian company. Work only from the complaint text. Never invent facts; when something is not stated, use null or false. Output ONLY valid JSON, no markdown.`

/**
 * Facts from the complaint, by Claude when available, merged over the rules
 * result so a field the model leaves blank still gets the keyword answer.
 */
export async function extractFacts(c: Complaint, meter?: Meter): Promise<ExtractedFacts> {
  const rules = extractFactsByRules(c)
  try {
    const out = await askJson<Partial<ExtractedFacts>>(
      EXTRACT_SYSTEM,
      `Complaint received by the company:
Subject: ${c.subject}
Product field: ${c.product || '(not given)'}
Order reference field: ${c.orderRef || '(not given)'}
Amount field: ${c.amountClaimed ?? '(not given)'}
Purchase date field: ${c.purchaseDate ?? '(not given)'}
---
${c.body.slice(0, 6000)}
---

Return JSON with exactly these keys:
{
  "grounds": array of 1-3 from ${JSON.stringify(GROUND_IDS)}, most central first,
  "product": short product or service name (string, "" if unknown),
  "amount": rupees paid for the product/service in dispute (number or null) — NOT the compensation demanded,
  "purchaseDate": "YYYY-MM-DD" or null,
  "hasInvoice": does the consumer state they have an invoice, bill, receipt or order number,
  "hasPhotos": do they mention photos, videos or screenshots,
  "hasTicket": do they cite a complaint/ticket/reference number from the company,
  "priorContacts": how many times they say they already contacted the company (number),
  "serviceVisits": how many repair/service attempts they describe (number),
  "withinWarranty": true, false, or null if not stated,
  "threatensLegal": do they mention consumer court, legal notice, lawyer, or legal action,
  "abusive": is the tone predominantly abusive,
  "demandsDisproportionate": is the compensation demanded wildly out of proportion (over ~10x) to the amount paid,
  "specificIssue": do they describe a concrete defect or service failure,
  "summary": one neutral sentence (max 30 words) summarising the complaint
}`,
      2000,
      meter,
    )
    if (!out) return rules
    const grounds = (Array.isArray(out.grounds) ? out.grounds : []).filter((g): g is GroundId =>
      GROUND_IDS.includes(g as GroundId),
    )
    const num = (v: unknown, d: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
    return {
      grounds: grounds.length ? grounds.slice(0, 3) : rules.grounds,
      product: typeof out.product === 'string' && out.product ? out.product.slice(0, 120) : rules.product,
      amount: c.amountClaimed ?? num(out.amount, rules.amount),
      purchaseDate:
        c.purchaseDate ??
        (typeof out.purchaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out.purchaseDate)
          ? out.purchaseDate
          : rules.purchaseDate),
      hasInvoice: bool(out.hasInvoice, rules.hasInvoice) || Boolean(c.orderRef),
      hasPhotos: bool(out.hasPhotos, rules.hasPhotos),
      hasTicket: bool(out.hasTicket, rules.hasTicket),
      priorContacts: num(out.priorContacts, rules.priorContacts) ?? 0,
      serviceVisits: num(out.serviceVisits, rules.serviceVisits) ?? 0,
      withinWarranty:
        typeof out.withinWarranty === 'boolean' ? out.withinWarranty : rules.withinWarranty,
      threatensLegal: bool(out.threatensLegal, rules.threatensLegal),
      abusive: bool(out.abusive, rules.abusive),
      demandsDisproportionate: bool(out.demandsDisproportionate, rules.demandsDisproportionate),
      specificIssue: bool(out.specificIssue, rules.specificIssue),
      summary: typeof out.summary === 'string' ? out.summary.slice(0, 300) : rules.summary,
      extractedBy: 'ai',
    }
  } catch (err) {
    console.error('[brand-ai] fact extraction failed:', (err as Error).message)
    return rules
  }
}

/* -------------------------------------------------------------------------- */

const NARRATIVE_SYSTEM = `You brief a customer-support lead at an Indian consumer brand on an incoming complaint. You are not a lawyer and must not present anything as legal advice or a certain outcome. The numbers you are given were computed by a deterministic model; repeat them exactly and never change them. Plain, direct business English. Output ONLY valid JSON, no markdown.`

export async function writeNarrative(
  c: Complaint,
  brand: Brand,
  a: Omit<ComplaintAnalysis, 'narrative'>,
  meter?: Meter,
): Promise<string | null> {
  try {
    const out = await askJson<{ narrative: string }>(
      NARRATIVE_SYSTEM,
      `Brand: ${brand.name}
Complaint summary: ${a.facts.summary}
Analysis (fixed numbers): ${JSON.stringify({
        consumerWinPct: a.prediction.consumerWinPct,
        basis: a.prediction.basis,
        factors: a.prediction.factors.map((f) => `${f.effect === 'up' ? '+' : '−'} ${f.label}`),
        frivolity: a.frivolity,
        forum: a.exposure.forum,
        expectedCostIfContested: a.exposure.expectedCostIfContested,
        recommended: a.actions.find((x) => x.recommended),
      })}

Write "narrative": two short paragraphs, max 110 words total. First: what is driving the likelihood figure for this complaint. Second: why the recommended action is the sensible next step, in cost terms. Return {"narrative": string}.`,
      1500,
      meter,
    )
    return out && typeof out.narrative === 'string' ? out.narrative.slice(0, 1200) : null
  } catch (err) {
    console.error('[brand-ai] narrative failed:', (err as Error).message)
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* First response                                                              */
/* -------------------------------------------------------------------------- */

const OFFER_LINES: Record<OfferKind, (v: string) => string> = {
  refund: (v) => `we would like to offer you a full refund of ${v}`,
  partial_refund: (v) => `we would like to offer you a refund of ${v}`,
  replacement: (v) => `we would like to replace the product for you${v ? `, together with a goodwill gift card (total value ${v})` : ''}`,
  repair: () => `we would like to arrange a priority repair visit by a senior technician within 72 hours`,
  service: (v) => `we will complete the pending service within 48 hours, and a named service lead will confirm your appointment${v ? `. As an apology for the delay, we would also like to offer you a voucher worth ${v}` : ''}`,
  gift_card: (v) => `we would like to offer you store credit of ${v}, which you can use on anything in our store`,
  promo: (v) => `as a gesture of goodwill, we would like to offer you a voucher worth ${v}`,
}

export type ResponseMode = 'offer' | 'request_info' | 'decline' | 'advise' | 'plain'

export function templateResponse(
  c: Complaint,
  brand: Brand,
  trackUrl: string,
  offer: { kind: OfferKind; value: number } | null,
  mode: ResponseMode,
): string {
  const first = c.consumerName.split(' ')[0] || 'there'
  const lines = [
    `Dear ${first},`,
    '',
    `Thank you for writing to us, and we are sorry for the trouble you have had${c.product ? ` with your ${c.product}` : ''}. Your complaint has been registered under reference ${c.id}.`,
    '',
  ]
  if (mode === 'decline') {
    lines.push(
      'We have reviewed your complaint carefully. Based on the information provided, we are unable to offer compensation in this case.',
      '[Briefly set out the reason — for example, the product is outside its warranty period, the issue is not covered, or the order was delivered as described.]',
      '',
      'If there is something we have missed, please add the details at the link below and we will look at it again.',
      '',
    )
  }
  if (mode === 'advise') {
    lines.push(
      'We have looked into what you have described. Here is our understanding of the position, and what we suggest:',
      '[Explain the position — warranty terms, what was promised, what happened on your side.]',
      '[Suggested next steps — troubleshooting, the right service channel, or a discounted paid repair.]',
      '',
      'If this does not resolve things, reply at the link below and we will take it further.',
      '',
    )
  }
  if (mode === 'request_info') {
    lines.push(
      'So that we can resolve this quickly, could you please share your order number or invoice, and any photos of the issue? You can add them directly at the link below.',
      '',
    )
  }
  if (offer) {
    const v = offer.value ? `₹${offer.value.toLocaleString('en-IN')}` : ''
    lines.push(
      `Having looked into what happened, ${OFFER_LINES[offer.kind](v)}. You can accept or decline this offer at the link below.`,
      '',
    )
  }
  lines.push(
    'You can follow this complaint, read our responses, add details or correct anything we have got wrong here:',
    trackUrl,
    '',
    'This tracking page is provided by ConsumerX, an independent platform. Using it is free and does not affect any of your rights as a consumer.',
    '',
    'Warm regards,',
    `Customer Care, ${brand.name}`,
  )
  return lines.join('\n')
}

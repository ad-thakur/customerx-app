// ---------------------------------------------------------------------------
// Complaint analysis for brands.
//
// For each incoming complaint this answers the four questions a brand's
// support or legal lead actually has:
//
//   1. If this went to a consumer commission, how would it likely go?
//      — consumer-win likelihood from comparable NCDRC judgments in our
//        corpus, the brand's own record there, and the evidence the consumer
//        appears to hold.
//   2. Is it frivolous?
//      — a checklist of concrete signals, not a verdict.
//   3. What does it cost to fight it, versus to settle it?
//      — exposure model by forum, using the brand's own gross margin to cost
//        replacements and gift cards at what they really cost the brand.
//   4. So what should we do?
//      — ranked actions, each with a cost, including goodwill (gift cards,
//        promo items) where that is the cheapest way to close it.
//
// Same posture as the consumer-side assessment: every number here is
// produced deterministically, so it is explainable and reproducible. The
// optional AI layer (brandAi.ts) only extracts facts from free text and
// writes prose around the numbers. Nothing here is legal advice; the UI says
// so.
// ---------------------------------------------------------------------------

import { categoriesForGrounds } from './categories.js'
import { GROUND_LABELS } from './caseLogic.js'
import { searchLocalPrecedents } from './precedentStore.js'
import {
  brandPrecedentHistory,
  precedentTails,
  type Brand,
  type BrandHistoryRow,
  type Complaint,
  type OfferKind,
} from './brandStore.js'
import type { GroundId } from './types.js'
import type { AiReview } from './brandReview.js'

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Outcome = 'consumer' | 'business' | 'settled' | 'withdrawn' | 'unknown'

export interface ExtractedFacts {
  grounds: GroundId[]
  product: string
  /** Principal in dispute — price paid or amount demanded, rupees. */
  amount: number | null
  purchaseDate: string | null
  hasInvoice: boolean
  hasPhotos: boolean
  hasTicket: boolean
  priorContacts: number
  serviceVisits: number
  withinWarranty: boolean | null
  threatensLegal: boolean
  abusive: boolean
  demandsDisproportionate: boolean
  specificIssue: boolean
  summary: string
  /** 'ai' when Claude extracted these, 'rules' for the keyword fallback. */
  extractedBy: 'ai' | 'rules'
}

export interface PrecedentView {
  caseNumber: string
  title: string
  outcome: Outcome
  stage: string | null
  date: string | null
  snippet: string
  againstThisBrand: boolean
}

export interface Factor {
  label: string
  /** Signed effect on the consumer's odds, for display only. */
  effect: 'up' | 'down'
  weight: 'small' | 'medium' | 'large'
}

export interface ActionOption {
  id: string
  kind: OfferKind | 'request_info' | 'decline' | 'advise' | 'contest'
  title: string
  detail: string
  /** Face value offered to the consumer. */
  faceValue: number
  /** What it actually costs the brand. */
  cost: number
  /** Rough chance this closes the complaint. */
  closeLikelihood: number
  recommended: boolean
}

export interface ComplaintAnalysis {
  version: 1
  facts: ExtractedFacts
  prediction: {
    consumerWinPct: number
    label: 'Likely consumer win' | 'Could go either way' | 'Likely brand win'
    confidence: 'low' | 'medium' | 'high'
    basis: string
    factors: Factor[]
  }
  frivolity: {
    score: number
    label: 'Appears genuine' | 'Needs verification' | 'Possibly frivolous'
    signals: string[]
  }
  exposure: {
    forum: 'District Commission' | 'State Commission' | 'National Commission'
    principal: number
    awardIfLost: { low: number; high: number }
    defenceCost: { low: number; high: number }
    expectedCostIfContested: number
    cheapestResolution: number
    /** Expected cost of leaving it unresolved: filing risk × contested cost + the lost customer. */
    expectedCostIfUnresolved: number
    /** Expected cost of the recommended action, including the chance it fails to close. */
    recommendedExpectedCost: number
    saving: number
  }
  similar: { decided: number; consumerWins: number; cases: PrecedentView[] }
  brandRecord: {
    total: number
    decided: number
    consumerWins: number
    recent: PrecedentView[]
  }
  actions: ActionOption[]
  priority: 'urgent' | 'high' | 'normal' | 'low'
  narrative: string | null
  /** AI review of comparable judgments; runs after the rest, so may be pending. */
  review?: AiReview | null
  generatedAt: string
}

/* -------------------------------------------------------------------------- */
/* Fact extraction — keyword fallback                                         */
/* -------------------------------------------------------------------------- */

const GROUND_PATTERNS: [GroundId, RegExp][] = [
  ['hazardous_goods', /\b(fire|caught fire|burn|burnt|shock|explod|blast|injur|hazard|smoke|spark)/i],
  ['spurious_goods', /\b(fake|counterfeit|duplicate|not genuine|not original|spurious|first copy)/i],
  ['overcharging', /\b(overcharg|more than (the )?mrp|above mrp|extra charge|charged extra|hidden charge|excess(ive)? (amount|price)|double charg)/i],
  ['misleading_ad', /\b(advertis|misleading|false claim|claimed on (the )?(website|box|ad)|promised in|as shown)/i],
  ['unfair_trade_practice', /\b(refus\w* (to )?(refund|replace|honou?r)|no refund|bait|unfair|cheat|fraud|forced to buy|auto[- ]?renew)/i],
  ['defective_goods', /\b(defect|faulty|not working|stopped working|stops (working|mid)|broken|damaged|malfunction|dead on arrival|doa|leak|crack|not turning on|won'?t (start|turn on)|overheat|not cooling|stopped cooling|compressor|error (code )?[a-z]?\d|keeps (coming back|failing)|failed)/i],
  ['deficient_service', /\b(not delivered|delay|late delivery|no response|customer care|technician|installation|service (centre|center)|cancel|did not (come|visit)|rude|ignored|pending since|refund (not|still))/i],
]

function parseAmount(text: string): number | null {
  // ₹45,999 / Rs. 45999 / INR 45,999.00 / 45,999 rupees / 1.2 lakh
  const amounts: number[] = []
  const money = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)|([\d,]+(?:\.\d+)?)\s*(?:\/-|rupees)/gi
  for (const m of text.matchAll(money)) {
    const n = Number((m[1] ?? m[2]).replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) amounts.push(n)
  }
  for (const m of text.matchAll(/([\d.]+)\s*(lakh|lac|crore)/gi)) {
    const n = Number(m[1]) * (/crore/i.test(m[2]) ? 1e7 : 1e5)
    if (Number.isFinite(n)) amounts.push(n)
  }
  return amounts.length ? Math.max(...amounts) : null
}

function parseDate(text: string): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (iso) return iso[0]
  const dmy = text.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  return null
}

function countMatches(text: string, re: RegExp): number {
  return [...text.matchAll(re)].length
}

const WORD_NUMBERS: Record<string, number> = {
  once: 1, twice: 2, thrice: 3, two: 2, three: 3, four: 4, five: 5, six: 6, several: 3, multiple: 3, many: 4,
}

const PRODUCTS = [
  'washing machine', 'refrigerator', 'fridge', 'air conditioner', 'split ac', 'air purifier', 'water purifier',
  'smartwatch', 'smart watch', 'earphones', 'earbuds', 'headphones', 'charger', 'smartphone', 'mobile phone', 'phone',
  'laptop', 'television', 'tv', 'microwave', 'geyser', 'mixer', 'trimmer', 'vacuum cleaner', 'chimney', 'fan',
  'scooter', 'car', 'bike', 'flight', 'insurance policy', 'mattress', 'sofa', 'furniture',
]

function findProduct(text: string): string {
  const lower = text.toLowerCase()
  const hit = PRODUCTS.find((p) => new RegExp(`\\b${p}\\b`).test(lower))
  if (!hit) return ''
  if (hit === 'split ac') return 'Air conditioner'
  return hit.length <= 3 ? hit.toUpperCase() : hit[0].toUpperCase() + hit.slice(1)
}

function countPhrase(text: string, noun: RegExp): number {
  // "3 times", "visited twice", "four visits", "multiple complaints"
  let best = 0
  const re = new RegExp(`(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s+(?:\\w+\\s+){0,2}${noun.source}`, 'gi')
  for (const m of text.matchAll(re)) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : (WORD_NUMBERS[m[1].toLowerCase()] ?? 0)
    best = Math.max(best, n)
  }
  return best
}

export function extractFactsByRules(c: Complaint): ExtractedFacts {
  const text = `${c.subject}\n${c.body}`
  const grounds = GROUND_PATTERNS.filter(([, re]) => re.test(text)).map(([g]) => g)
  // A recognised defect or service failure is what makes a complaint specific;
  // falling back to the catch-all ground is not.
  const recognised = grounds.length > 0
  if (!recognised) grounds.push('deficient_service')

  const amount = c.amountClaimed ?? parseAmount(text)
  const purchaseDate = c.purchaseDate ?? parseDate(text)
  const priorContacts = Math.max(
    countPhrase(text, /(?:times|complaints|calls|emails|follow[- ]?ups)/),
    /\b(complained|called|emailed|raised|escalated)\b/i.test(text) ? 1 : 0,
  )
  const visitedTimes = text.match(
    new RegExp(`(?:visited|came|repaired|serviced)\\s+(?:\\w+\\s+){0,2}?(\\d+|${Object.keys(WORD_NUMBERS).join('|')})\\s+times`, 'i'),
  )
  const serviceVisits = Math.max(
    countPhrase(text, /(?:technician visits|visits|repairs|service (?:visits|calls)|times repaired)/),
    visitedTimes ? (/^\d+$/.test(visitedTimes[1]) ? Number(visitedTimes[1]) : (WORD_NUMBERS[visitedTimes[1].toLowerCase()] ?? 0)) : 0,
  )

  let withinWarranty: boolean | null = null
  if (/(under|within|in) (the )?warranty/i.test(text)) withinWarranty = true
  if (/(out of|expired|beyond) (the )?warranty/i.test(text)) withinWarranty = false

  const demand = parseAmount(
    (text.match(/(?:demand|compensation|claim|seek|want)[^.]{0,80}/gi) ?? []).join(' '),
  )
  const price = c.amountClaimed ?? amount
  const demandsDisproportionate =
    /\b(crore|\d{2,}\s*lakh)\b/i.test(text) && (price ?? 0) < 200_000
      ? true
      : demand !== null && price !== null && demand > price * 10

  const abusive = countMatches(text, /\b(idiot|stupid|useless|pathetic|cheats?|fraudsters?|scam(mers)?|worst)\b/gi) >= 3

  return {
    grounds: [...new Set(grounds)].slice(0, 3),
    product: c.product || findProduct(text),
    amount: price,
    purchaseDate,
    hasInvoice: Boolean(c.orderRef) || /\b(invoice|bill|receipt|order (id|no|number|#)|order\s*#?\s*\w*\d)/i.test(text),
    hasPhotos: /\b(photo|picture|image|video|screenshot|attached|attaching)/i.test(text),
    hasTicket: /\b(ticket|complaint|reference|ref|sr|case)\s*(no\.?|number|id|#)\s*:?\s*[\w-]*\d/i.test(text),
    priorContacts,
    serviceVisits,
    withinWarranty,
    threatensLegal: /\b(consumer (court|forum|commission)|legal notice|lawyer|advocate|sue|court|ncdrc|legal action)/i.test(text),
    abusive,
    demandsDisproportionate,
    specificIssue: recognised && c.body.trim().length >= (abusive ? 200 : 60),
    summary: c.body.replace(/\s+/g, ' ').trim().slice(0, 220),
    extractedBy: 'rules',
  }
}

/* -------------------------------------------------------------------------- */
/* Outcome classification for precedents                                      */
/* -------------------------------------------------------------------------- */

const BUSINESS_NAME =
  /\b(ltd|limited|pvt|private|bank|insurance|corporation|corp|co\.|company|authority|motors|developers|builders|airways|airlines|hospital|telecom|infratech|industries|enterprises|services|board|india)\b/i

/**
 * Who won, from the consumer's side. e-Jagriti's stage name gives the
 * disposition of the proceeding, which has to be read against who brought it:
 * an original complaint (NC/CC) is brought by the consumer, but in an appeal
 * or revision (NC/FA, NC/RP) the appellant may be the business — and then
 * "dismissed" is a consumer win. Where the stage is only "disposed of", the
 * operative order at the end of the judgment is read instead.
 */
export function classifyOutcome(
  caseNumber: string,
  stage: string | null,
  complainant: string | null,
  tail: string | null,
): Outcome {
  const s = (stage ?? '').toUpperCase()
  const t = (tail ?? '').toLowerCase()

  if (/WITHDRAW/.test(s) || /dismissed as withdrawn|withdrawn with liberty/.test(t)) return 'withdrawn'
  if (/SETTLE|COMPROMISE|LOK ADALAT|MEDIAT/.test(s) || /amicabl\w+ settled|settled between the parties/.test(t))
    return 'settled'

  let disposition: 'allowed' | 'dismissed' | null = null
  if (/ALLOW/.test(s)) disposition = 'allowed'
  else if (/DISMISS|REJECT/.test(s)) disposition = 'dismissed'
  else {
    const m = t.match(/(?:complaint|appeal|petition|revision)s?\s+(?:is|are|stands?|is hereby|are hereby)\s+(?:partly |partially )?(allowed|dismissed|rejected)/g)
    const last = m?.[m.length - 1]
    if (last) disposition = /allowed/.test(last) ? 'allowed' : 'dismissed'
  }
  if (!disposition) return 'unknown'

  const original = /\/CC\//i.test(caseNumber)
  const appellantIsBusiness = !original && BUSINESS_NAME.test(complainant ?? '')
  const consumerBrought = original || !appellantIsBusiness
  const broughtWon = disposition === 'allowed'
  return broughtWon === consumerBrought ? 'consumer' : 'business'
}

function toDate(d: Date | string | null): string | null {
  if (!d) return null
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)
}

/* -------------------------------------------------------------------------- */
/* Exposure model                                                             */
/* -------------------------------------------------------------------------- */

// Pecuniary limits under the Consumer Protection (Jurisdiction of the District
// Commission, the State Commission and the National Commission) Rules, 2021.
function forumFor(amount: number): ComplaintAnalysis['exposure']['forum'] {
  if (amount <= 50_00_000) return 'District Commission'
  if (amount <= 2_00_00_000) return 'State Commission'
  return 'National Commission'
}

// Indicative ranges for planning, not quotes. Defence = the brand's own
// counsel through to final order; costs = litigation costs commissions
// typically award a successful complainant.
const FORUM_COSTS = {
  'District Commission': { defence: [25_000, 75_000], costs: [5_000, 25_000], compPct: [0.1, 0.3], compMin: 5_000 },
  'State Commission': { defence: [75_000, 2_00_000], costs: [25_000, 50_000], compPct: [0.1, 0.25], compMin: 25_000 },
  'National Commission': { defence: [2_00_000, 5_00_000], costs: [50_000, 1_00_000], compPct: [0.05, 0.2], compMin: 1_00_000 },
} as const

/** Interest commissions commonly award on the refund, over ~2 years to order. */
const INTEREST_FACTOR = 0.18

function round(n: number): number {
  if (n >= 1_00_000) return Math.round(n / 5_000) * 5_000
  if (n >= 10_000) return Math.round(n / 500) * 500
  return Math.round(n / 100) * 100
}

/* -------------------------------------------------------------------------- */
/* The analysis                                                               */
/* -------------------------------------------------------------------------- */

function logit(p: number) {
  return Math.log(p / (1 - p))
}
function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x))
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null
}

export async function analyseComplaint(
  c: Complaint,
  brand: Brand,
  facts: ExtractedFacts,
): Promise<Omit<ComplaintAnalysis, 'narrative'>> {
  /* ---- Comparable judgments ------------------------------------------- */
  const groundWords = facts.grounds.map((g) => GROUND_LABELS[g]).join(' ')
  // Short, focused queries: every unmatched term dilutes ts_rank, so the full
  // complaint body falls below the relevance floor. The product alone is the
  // most discriminating query; widen only if it finds too little. The ground
  // categories are what keep the results on-topic either way.
  const categories = categoriesForGrounds(facts.grounds)
  let hits: Awaited<ReturnType<typeof searchLocalPrecedents>> = []
  try {
    for (const q of [facts.product, `${facts.product} ${c.subject}`, `${c.subject} ${groundWords}`]) {
      if (!q.trim()) continue
      hits = await searchLocalPrecedents(q, 30, categories)
      if (hits.length >= 3) break
    }
  } catch (err) {
    console.error('[brand] precedent search failed:', (err as Error).message)
  }
  const tails = await precedentTails(hits.map((h) => h.caseNumber)).catch(() => new Map<string, string>())

  const aliasRe = brand.aliases
    .concat(brand.name)
    .filter((a) => a.trim().length >= 4)
    .map((a) => a.trim().toLowerCase())
  const mentionsBrand = (s: string | null) =>
    Boolean(s) && aliasRe.some((a) => s!.toLowerCase().includes(a))

  const similar: (PrecedentView & { rank: number })[] = hits.map((h) => ({
    caseNumber: h.caseNumber,
    title: `${h.complainant ?? 'Complainant'} v. ${h.respondent ?? 'Respondent'}`,
    outcome: classifyOutcome(h.caseNumber, h.outcome, h.complainant, tails.get(h.caseNumber) ?? null),
    stage: h.outcome,
    date: toDate(h.judgmentDate),
    snippet: h.snippet.replace(/<\/?b>/g, '').slice(0, 320),
    againstThisBrand: mentionsBrand(h.respondent) || mentionsBrand(h.complainant),
    rank: h.rank,
  }))

  /* ---- The brand's own record ----------------------------------------- */
  let history: BrandHistoryRow[] = []
  try {
    history = await brandPrecedentHistory([brand.name, ...brand.aliases])
  } catch (err) {
    console.error('[brand] history lookup failed:', (err as Error).message)
  }
  const historyViews: PrecedentView[] = history.map((h) => ({
    caseNumber: h.caseNumber,
    title: `${h.complainant ?? 'Complainant'} v. ${h.respondent ?? 'Respondent'}`,
    outcome: classifyOutcome(h.caseNumber, h.outcome, h.complainant, h.tail),
    stage: h.outcome,
    date: toDate(h.judgmentDate),
    snippet: '',
    againstThisBrand: true,
  }))
  const histDecided = historyViews.filter((h) => h.outcome === 'consumer' || h.outcome === 'business')
  const histWins = histDecided.filter((h) => h.outcome === 'consumer').length

  /* ---- Likelihood ------------------------------------------------------ */
  // Beta prior around the long-run consumer success rate at commissions,
  // updated with comparable decided cases weighted by how close they are.
  const PRIOR_P = 0.6
  const PRIOR_N = 4
  const decided = similar.filter((s) => s.outcome === 'consumer' || s.outcome === 'business')
  const topRank = Math.max(...decided.map((d) => d.rank), 0.0001)
  let a = PRIOR_P * PRIOR_N
  let b = (1 - PRIOR_P) * PRIOR_N
  for (const d of decided) {
    const w = 0.4 + 0.6 * (d.rank / topRank)
    if (d.outcome === 'consumer') a += w
    else b += w
  }
  let p = a / (a + b)

  // Fold in the brand's own record when there is enough of it to mean much.
  if (histDecided.length >= 5) {
    const brandRate = (histWins + 1) / (histDecided.length + 2)
    const w = Math.min(0.35, histDecided.length / 60)
    p = p * (1 - w) + brandRate * w
  }

  const factors: Factor[] = []
  let x = logit(p)
  const nudge = (cond: boolean, delta: number, label: string) => {
    if (!cond) return
    x += delta
    const mag = Math.abs(delta)
    factors.push({
      label,
      effect: delta > 0 ? 'up' : 'down',
      weight: mag >= 0.8 ? 'large' : mag >= 0.35 ? 'medium' : 'small',
    })
  }
  const age = daysSince(facts.purchaseDate)
  nudge(facts.hasInvoice, 0.35, 'Proof of purchase referenced')
  nudge(!facts.hasInvoice, -0.45, 'No invoice or order reference')
  nudge(facts.hasPhotos, 0.25, 'Photos/video of the issue')
  nudge(facts.hasTicket || facts.priorContacts > 0, 0.3, 'Prior complaint to the brand on record')
  nudge(facts.serviceVisits >= 2, 0.6, `${facts.serviceVisits} repair/service attempts already`)
  nudge(facts.withinWarranty === true, 0.4, 'Within warranty')
  nudge(facts.withinWarranty === false, -0.35, 'Out of warranty')
  nudge(age !== null && age > 730, -1.4, 'Over 2 years since purchase (limitation)')
  nudge(facts.grounds.includes('hazardous_goods'), 0.5, 'Safety hazard alleged')
  nudge(!facts.specificIssue, -0.5, 'Issue not specifically described')
  nudge(facts.demandsDisproportionate, -0.5, 'Demand far exceeds the value in dispute')
  nudge(facts.abusive && !facts.specificIssue, -0.4, 'Grievance not substantiated')
  if (histDecided.length >= 5) {
    const rate = histWins / histDecided.length
    factors.push({
      label: `Consumers won ${Math.round(rate * 100)}% of ${histDecided.length} decided cases against ${brand.name}`,
      effect: rate >= 0.5 ? 'up' : 'down',
      weight: 'medium',
    })
  }
  const consumerWinPct = Math.round(Math.min(0.95, Math.max(0.05, sigmoid(x))) * 100)
  const confidence = decided.length >= 10 ? 'high' : decided.length >= 4 ? 'medium' : 'low'
  const consumerWinsSimilar = decided.filter((d) => d.outcome === 'consumer').length

  /* ---- Frivolity ------------------------------------------------------- */
  const signals: string[] = []
  let fscore = 0
  const flag = (cond: boolean, pts: number, text: string) => {
    if (cond) {
      fscore += pts
      signals.push(text)
    }
  }
  flag(!facts.hasInvoice && !c.orderRef, 20, 'No order number or invoice — purchase not yet verified')
  flag(!facts.specificIssue, 20, 'No specific defect or service failure described')
  flag(facts.demandsDisproportionate, 25, 'Compensation demanded is far out of proportion to the value involved')
  flag(age !== null && age > 730, 20, 'Purchase is more than two years old — likely time-barred')
  flag(facts.priorContacts === 0 && !facts.hasTicket, 10, 'No sign the issue was raised with you before')
  flag(facts.abusive && !facts.specificIssue, 10, 'Mostly abuse, little substance')
  flag(c.body.trim().length < 80, 15, 'Very short complaint')
  const frivolityScore = Math.min(100, fscore)
  const frivolityLabel =
    frivolityScore >= 55 ? 'Possibly frivolous' : frivolityScore >= 30 ? 'Needs verification' : 'Appears genuine'

  /* ---- Exposure -------------------------------------------------------- */
  const principal = Math.max(facts.amount ?? 0, 0)
  const forum = forumFor(principal)
  const fc = FORUM_COSTS[forum]
  const compLow = Math.max(fc.compMin, principal * fc.compPct[0])
  const compHigh = Math.max(fc.compMin * 2, principal * fc.compPct[1])
  const awardLow = round(principal + compLow + fc.costs[0])
  const awardHigh = round(principal * (1 + INTEREST_FACTOR) + compHigh + fc.costs[1])
  const defenceLow = fc.defence[0]
  const defenceHigh = fc.defence[1]
  const pWin = consumerWinPct / 100
  const expectedCostIfContested = round(pWin * ((awardLow + awardHigh) / 2) + (defenceLow + defenceHigh) / 2)

  /* ---- Actions --------------------------------------------------------- */
  const margin = Math.min(0.9, Math.max(0, brand.grossMargin))
  const costOfGoods = (face: number) => round(face * (1 - margin))
  const goodwill = round(Math.min(5_000, Math.max(500, principal * 0.1)))
  const actions: ActionOption[] = []
  const isGoods = facts.grounds.some((g) => ['defective_goods', 'spurious_goods', 'hazardous_goods'].includes(g))

  // Also when the amount is unknown (typically a social post): you can't cost
  // a fix until you know what was bought.
  if (frivolityScore >= 30 || principal === 0) {
    actions.push({
      id: 'request_info',
      kind: 'request_info',
      title: 'Ask for the missing details first',
      detail: 'Request the order number, invoice and photos before committing to anything. Costs nothing and filters out claims that are not genuine.',
      faceValue: 0,
      cost: 0,
      closeLikelihood: 0.25,
      recommended: false,
    })
  }
  if (principal > 0 && frivolityScore < 55) {
    if (isGoods) {
      actions.push({
        id: 'replacement_goodwill',
        kind: 'replacement',
        title: `Replace the product + ₹${goodwill.toLocaleString('en-IN')} gift card`,
        detail: `Replacement at cost (${Math.round((1 - margin) * 100)}% of price) plus a goodwill gift card redeemable on your store.`,
        faceValue: principal + goodwill,
        cost: costOfGoods(principal) + costOfGoods(goodwill),
        closeLikelihood: 0.85,
        recommended: false,
      })
      if (facts.serviceVisits < 2 && !facts.grounds.includes('hazardous_goods')) {
        actions.push({
          id: 'repair',
          kind: 'repair',
          title: 'Priority repair within 72 hours',
          detail: 'Senior technician visit with a written commitment. Cheapest fix where the product is repairable and this is the first failure.',
          faceValue: 0,
          cost: round(Math.min(3_000, principal * 0.05) + 500),
          closeLikelihood: 0.5,
          recommended: false,
        })
      }
    }
    const text = `${c.subject}\n${c.body}`
    const refundPending = /refund\w*\s+(?:\w+\s+){0,4}(not|still|yet|pending|never)|not\s+(?:\w+\s+){0,2}refund/i.test(text)
    const servicePending =
      facts.grounds.includes('deficient_service') &&
      /installation|install|not delivered|did not (come|visit)|has not come|no show|appointment/i.test(text)
    if (refundPending) {
      actions.push({
        id: 'pending_refund',
        kind: 'refund',
        title: `Release the pending refund today + ₹${goodwill.toLocaleString('en-IN')} voucher`,
        detail: 'The refund is already owed, so it costs you nothing extra — the delay is the grievance. The voucher acknowledges the wait.',
        faceValue: principal + goodwill,
        cost: costOfGoods(goodwill),
        closeLikelihood: 0.92,
        recommended: false,
      })
    }
    if (servicePending) {
      actions.push({
        id: 'complete_service',
        kind: 'service',
        title: `Complete the pending service within 48 hours + ₹${goodwill.toLocaleString('en-IN')} voucher`,
        detail: 'Escalate to a named service lead with a fixed appointment. Fixing what was paid for is usually all the consumer wants.',
        faceValue: goodwill,
        cost: 1_000 + costOfGoods(goodwill),
        closeLikelihood: 0.85,
        recommended: false,
      })
    }
    if (facts.grounds.includes('overcharging')) {
      const nums = [...text.matchAll(/(?:₹|rs\.?|inr)\s*([\d,]+)/gi)]
        .map((m) => Number(m[1].replace(/,/g, '')))
        .filter((n) => n > 0)
        .sort((x, y) => y - x)
      const excess = nums.length >= 2 && nums[1] < nums[0] ? nums[0] - nums[1] : round(principal * 0.15)
      actions.push({
        id: 'refund_excess',
        kind: 'partial_refund',
        title: `Refund the ₹${excess.toLocaleString('en-IN')} overcharge + apology`,
        detail: 'Return the amount charged above MRP and confirm the store has been corrected. Overcharging is easy to prove and rarely worth defending.',
        faceValue: excess,
        cost: excess + costOfGoods(500),
        closeLikelihood: 0.85,
        recommended: false,
      })
    }
    if (!refundPending) {
      actions.push({
        id: 'refund',
        kind: 'refund',
        title: `Full refund of ₹${principal.toLocaleString('en-IN')}`,
        detail: 'Cleanest close. Collect the product back where applicable.',
        faceValue: principal,
        cost: round(principal),
        closeLikelihood: 0.9,
        recommended: false,
      })
    }
    actions.push({
      id: 'gift_card',
      kind: 'gift_card',
      title: `Store credit of ₹${round(principal * 1.15).toLocaleString('en-IN')} (115%)`,
      detail: `Worth more to the consumer than a refund, and costs you about ₹${costOfGoods(principal * 1.15).toLocaleString('en-IN')} at your margin. Keeps the customer.`,
      faceValue: round(principal * 1.15),
      cost: costOfGoods(principal * 1.15),
      closeLikelihood: 0.55,
      recommended: false,
    })
  }
  // Not every complaint deserves compensation. Where the merit is low, a
  // clear, courteous answer is the right response, and costs nothing.
  // Declining is for complaints that are frivolous or weak on the merits —
  // never for a credible one that just lacks paperwork.
  if (frivolityScore >= 55 || pWin < 0.4) {
    actions.push({
      id: 'decline',
      kind: 'decline',
      title: 'Decline politely — no compensation',
      detail:
        frivolityScore >= 55
          ? 'The complaint shows signs of being frivolous. Acknowledge it, explain your position, and close it without an offer.'
          : 'The claim is weak on the facts given. Explain your position courteously; the consumer can still add details through their link.',
      faceValue: 0,
      cost: 0,
      closeLikelihood: frivolityScore >= 55 ? 0.55 : 0.35,
      recommended: false,
    })
  }
  if (pWin < 0.6) {
    actions.push({
      id: 'advise',
      kind: 'advise',
      title: 'Reply with an explanation and suggestions',
      detail:
        'Set out the facts as you see them and what the consumer can do next — troubleshooting steps, warranty terms, a paid repair at a discount, or the right service channel. No compensation.',
      faceValue: 0,
      cost: 0,
      closeLikelihood: 0.45,
      recommended: false,
    })
  }
  actions.push({
    id: 'goodwill',
    kind: 'promo',
    title: `${frivolityScore >= 55 || pWin < 0.4 ? 'Optional: ' : ''}Apology + ₹${goodwill.toLocaleString('en-IN')} goodwill voucher`,
    detail: 'For service lapses and low-merit complaints where the consumer mainly wants acknowledgement. A gesture, not an admission.',
    faceValue: goodwill,
    cost: costOfGoods(goodwill),
    // A voucher closes a low-merit or minor complaint; it rarely closes a
    // strong one, where the consumer wants the actual problem fixed.
    closeLikelihood: pWin >= 0.6 ? 0.15 : pWin >= 0.4 ? 0.35 : 0.6,
    recommended: false,
  })
  actions.push({
    id: 'contest',
    kind: 'contest',
    title: 'Hold position and defend if filed',
    detail: `Expected cost if contested: ₹${expectedCostIfContested.toLocaleString('en-IN')} (defence fees plus a ${consumerWinPct}% chance of an adverse award).`,
    faceValue: 0,
    cost: expectedCostIfContested,
    closeLikelihood: 0,
    recommended: false,
  })

  // Recommend by expected total cost. An offer that fails to close leaves
  // the unresolved cost behind it: the chance the consumer actually files
  // (higher when they have threatened to, and when their case is strong)
  // times the cost of contesting, plus the customer's future margin, which an
  // unresolved complaint usually loses.
  const fileRate = Math.min(0.6, (facts.threatensLegal ? 0.3 : 0.1) + 0.3 * pWin)
  const lostCustomer = round(Math.max(1_000, principal) * margin)
  const unresolvedCost = fileRate * expectedCostIfContested + lostCustomer
  const expectedTotal = (o: ActionOption) =>
    o.kind === 'contest'
      ? unresolvedCost
      : o.kind === 'request_info'
        ? Infinity // a first step, never the whole answer
        : o.cost + (1 - o.closeLikelihood) * unresolvedCost
  // Low-merit complaints get an answer, not an offer: decline the frivolous
  // ones and explain the weak ones. Everything else is chosen on cost.
  const best =
    (frivolityScore >= 55 && actions.find((o) => o.kind === 'decline')) ||
    (pWin < 0.35 && actions.find((o) => o.kind === 'advise')) ||
    // A credible complaint with no amount: get the order details first.
    (principal === 0 && actions.find((o) => o.kind === 'request_info')) ||
    [...actions].sort((m, n) => expectedTotal(m) - expectedTotal(n))[0]
  best.recommended = true
  actions.sort((m, n) => Number(n.recommended) - Number(m.recommended) || expectedTotal(m) - expectedTotal(n))
  // Asking for documents still comes first when the claim isn't verified yet.
  const ask = actions.findIndex((o) => o.kind === 'request_info')
  if (ask > 0) actions.splice(1, 0, ...actions.splice(ask, 1))

  const settleCosts = actions
    .filter((o) => !['contest', 'request_info', 'decline', 'advise'].includes(o.kind))
    .map((o) => o.cost)
  const cheapestResolution = settleCosts.length ? Math.min(...settleCosts) : 0

  /* ---- Priority -------------------------------------------------------- */
  const priority: ComplaintAnalysis['priority'] =
    facts.grounds.includes('hazardous_goods') || (facts.threatensLegal && pWin >= 0.6)
      ? 'urgent'
      : pWin >= 0.6 || principal >= 1_00_000
        ? 'high'
        : frivolityScore >= 55
          ? 'low'
          : 'normal'

  const basis =
    decided.length > 0
      ? `${decided.length} comparable decided NCDRC case${decided.length === 1 ? '' : 's'} (consumer won ${consumerWinsSimilar})` +
        (histDecided.length >= 5 ? `, plus ${histDecided.length} decided cases involving ${brand.name}` : '')
      : 'No close comparable judgments — based on general commission outcomes and the evidence described'

  return {
    version: 1,
    facts,
    prediction: {
      consumerWinPct,
      label:
        consumerWinPct >= 60 ? 'Likely consumer win' : consumerWinPct <= 40 ? 'Likely brand win' : 'Could go either way',
      confidence,
      basis,
      factors,
    },
    frivolity: { score: frivolityScore, label: frivolityLabel, signals },
    exposure: {
      forum,
      principal,
      awardIfLost: { low: awardLow, high: awardHigh },
      defenceCost: { low: defenceLow, high: defenceHigh },
      expectedCostIfContested,
      cheapestResolution,
      expectedCostIfUnresolved: round(unresolvedCost),
      recommendedExpectedCost: round(expectedTotal(best)),
      saving: round(Math.max(0, unresolvedCost - expectedTotal(best))),
    },
    similar: {
      decided: decided.length,
      consumerWins: consumerWinsSimilar,
      cases: similar.slice(0, 8).map(({ rank: _rank, ...v }) => v),
    },
    brandRecord: {
      total: historyViews.length,
      decided: histDecided.length,
      consumerWins: histWins,
      recent: historyViews.slice(0, 6),
    },
    actions,
    priority,
    generatedAt: new Date().toISOString(),
  }
}

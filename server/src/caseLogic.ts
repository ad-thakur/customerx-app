// Case state machine + assessment/offer generation.
// Ported from the frontend's simulated caseStore — the server is now the
// source of truth; the "company side" of the loop remains simulated on a
// user-advanceable demo clock.

import type { Assessment, CaseRecord, CaseStatus, CaseView, GroundId, Offer } from './types.js'

export const MILESTONES = {
  emailDelivered: 1,
  postAcknowledged: 3,
  noticeOpened: 5,
  offerReceived: 12,
  windowCloses: 30,
} as const

function realDaysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export function noticeDaysElapsed(c: CaseRecord): number {
  if (!c.notice) return 0
  return realDaysSince(c.notice.sentAt) + c.clockOffsetDays
}

export function caseStatus(c: CaseRecord): CaseStatus {
  if (c.resolution) return 'resolved'
  if (!c.notice) return 'draft'
  const elapsed = noticeDaysElapsed(c)
  if (elapsed >= MILESTONES.windowCloses) return 'window_closed'
  if (elapsed >= MILESTONES.offerReceived) return 'offer_received'
  return 'awaiting_response'
}

export function nextMilestoneOffset(c: CaseRecord): number | null {
  if (!c.notice || c.resolution) return null
  const elapsed = noticeDaysElapsed(c)
  const days = Object.values(MILESTONES).sort((a, b) => a - b)
  const next = days.find((d) => d > elapsed)
  return next === undefined ? null : next - elapsed
}

function roundToNice(n: number): number {
  if (n >= 100_000) return Math.round(n / 5000) * 5000
  if (n >= 10_000) return Math.round(n / 500) * 500
  return Math.round(n / 100) * 100
}

export function buildRulesAssessment(c: CaseRecord): Omit<Assessment, 'ai' | 'paidAt' | 'receiptId'> {
  const claim = c.intake.claimAmount ?? 0
  const cons = c.intake.consequentialLoss ?? 0
  const { band } = c.routing.evidenceScore

  const bandFactor = band === 'strong' ? 0.9 : band === 'moderate' ? 0.75 : 0.5
  const rangeLow = roundToNice(claim * bandFactor)
  const rangeHigh = roundToNice(claim + cons + claim * (band === 'strong' ? 0.25 : 0.12))

  const drivers: Assessment['drivers'] = []
  const has = (cat: string) => c.intake.evidence.some((e) => e.category === cat)

  if (has('invoice'))
    drivers.push({ kind: 'strong', text: 'Proof of purchase on file — the foundation document commissions ask for first.' })
  if (has('correspondence'))
    drivers.push({ kind: 'strong', text: 'Written communication with the company preserved — it fixes their knowledge of the problem in time.' })
  if (!c.routing.limitation.expired)
    drivers.push({ kind: 'strong', text: `Well inside the 2-year limitation window (${c.routing.limitation.daysRemaining.toLocaleString('en-IN')} days remain).` })
  if (has('photo'))
    drivers.push({ kind: 'strong', text: 'Photographic/screenshot evidence of the issue uploaded.' })
  if (!has('warranty'))
    drivers.push({ kind: 'watch', text: 'No warranty card or service agreement uploaded — the invoice may suffice, but the card removes doubt.' })
  if (!has('correspondence'))
    drivers.push({ kind: 'watch', text: 'No written complaint trail with the company yet — send a written complaint before escalating; it strengthens the notice.' })
  if (!has('invoice'))
    drivers.push({ kind: 'watch', text: 'No proof of purchase uploaded — a bank/UPI record or invoice is close to essential before filing.' })
  if (c.routing.limitation.expired)
    drivers.push({ kind: 'watch', text: 'The standard limitation window has passed — a condonation application will be needed, which adds risk.' })

  const route = band === 'weak' ? 'Strengthen evidence first' : 'Notice stage'

  return { band, rangeLow, rangeHigh, route, drivers }
}

export function buildOffer(c: CaseRecord): Offer {
  const claim = c.intake.claimAmount ?? 0
  const goodwill = claim >= 50_000 ? 5_000 : 2_000
  return { amount: claim + goodwill, goodwill, receivedDay: MILESTONES.offerReceived }
}

export function toView(c: CaseRecord): CaseView {
  return {
    ...c,
    derived: {
      status: caseStatus(c),
      noticeDaysElapsed: noticeDaysElapsed(c),
      offer: buildOffer(c),
    },
  }
}

const NOTICE_HEADINGS: Record<GroundId, string> = {
  defective_goods: 'NOTICE OF DEFECT IN GOODS',
  deficient_service: 'NOTICE OF DEFICIENCY IN SERVICE',
  unfair_trade_practice: 'NOTICE OF UNFAIR TRADE PRACTICE',
  overcharging: 'NOTICE OF OVERCHARGING IN EXCESS OF DECLARED PRICE',
  spurious_goods: 'NOTICE REGARDING SALE OF SPURIOUS GOODS',
  hazardous_goods: 'NOTICE REGARDING SALE OF HAZARDOUS GOODS',
  misleading_ad: 'NOTICE REGARDING MISLEADING ADVERTISEMENT',
}

export function noticeHeading(grounds: GroundId[] | null | undefined): string {
  const list = grounds ?? []
  if (list.length === 1) return NOTICE_HEADINGS[list[0]]
  return 'LEGAL NOTICE UNDER THE CONSUMER PROTECTION ACT, 2019'
}

export const GROUND_LABELS: Record<GroundId, string> = {
  defective_goods: 'defective goods',
  deficient_service: 'deficiency in service',
  unfair_trade_practice: 'unfair trade practice',
  overcharging: 'overcharging in excess of declared price',
  spurious_goods: 'spurious goods',
  hazardous_goods: 'hazardous goods',
  misleading_ad: 'misleading advertisement',
}

/**
 * Reads grounds off an intake that may predate the multi-ground migration —
 * older rows in the cases table still carry a single `ground` string.
 */
export function readGrounds(intake: { grounds?: GroundId[]; ground?: GroundId | null }): GroundId[] {
  if (Array.isArray(intake.grounds) && intake.grounds.length > 0) return intake.grounds
  return intake.ground ? [intake.ground] : []
}

export function noticeRef(caseId: string): string {
  const [, year, seq] = caseId.split('-')
  return `REF/CX/${year}/${seq}`
}

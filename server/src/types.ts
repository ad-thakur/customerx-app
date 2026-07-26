// Core data shapes — mirrors src/lib/types.ts on the frontend.
// Keep the two in sync manually until a shared package is worth the ceremony.

export type GroundId =
  | 'defective_goods'
  | 'deficient_service'
  | 'unfair_trade_practice'
  | 'overcharging'
  | 'spurious_goods'
  | 'hazardous_goods'
  | 'misleading_ad'

export type CommissionLevel = 'district' | 'state' | 'national'

export interface EvidenceFileMeta {
  id: string
  name: string
  type: string
  sizeKb: number
  category: 'invoice' | 'photo' | 'correspondence' | 'warranty' | 'other'
  // Note: the server intentionally does NOT store dataUrl contents —
  // file storage is a Phase 1.5+ concern; metadata is enough for scoring.
}

export interface IntakeData {
  fullName: string
  phone: string
  email: string
  city: string
  state: string
  companyName: string
  companyAddress: string
  ground: GroundId | null
  narrative: string
  transactionDate: string
  incidentDate: string
  claimAmount: number | null
  consequentialLoss: number | null
  evidence: EvidenceFileMeta[]
}

export interface RoutingResult {
  commission: CommissionLevel
  commissionLabel: string
  totalClaim: number
  limitation: {
    daysElapsed: number
    daysRemaining: number
    expired: boolean
    withinCondonablePeriod: boolean
  }
  courtFeeEstimate: string
  evidenceScore: {
    score: number
    band: 'strong' | 'moderate' | 'weak'
    missing: string[]
  }
}

export interface AiAssessment {
  narrative: string
  precedents: { title: string; docUrl: string; court: string; note: string }[]
  model: string
  generatedAt: string
}

export interface Assessment {
  paidAt: string
  receiptId: string
  band: 'strong' | 'moderate' | 'weak'
  rangeLow: number
  rangeHigh: number
  route: string
  drivers: { kind: 'strong' | 'watch'; text: string }[]
  ai: AiAssessment | null
}

export interface NoticeMeta {
  sentAt: string
  ref: string
  postId: string
}

export interface Resolution {
  acceptedAt: string
  amount: number
  daysFromNotice: number
  ledgerConsent: boolean
}

export interface CaseRecord {
  id: string
  createdAt: string
  intake: IntakeData
  routing: RoutingResult
  clockOffsetDays: number
  assessment?: Assessment | null
  notice?: NoticeMeta | null
  resolution?: Resolution | null
}

export type CaseStatus =
  | 'draft'
  | 'awaiting_response'
  | 'offer_received'
  | 'window_closed'
  | 'resolved'

export interface Offer {
  amount: number
  goodwill: number
  receivedDay: number
}

/** What the API returns: the record plus server-derived view state. */
export interface CaseView extends CaseRecord {
  derived: {
    status: CaseStatus
    noticeDaysElapsed: number
    offer: Offer
  }
}

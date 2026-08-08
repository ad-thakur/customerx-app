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
  /** Grievance-officer / customer-care address the notice is emailed to. */
  companyEmail: string
  /** Ordered; first entry is the primary ground. Legacy records may carry `ground`. */
  grounds: GroundId[]
  /** @deprecated pre-multi-ground records only — read via readGrounds(). */
  ground?: GroundId | null
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

/** How the complainant dispatched the notice. They send it themselves. */
export type DispatchMethod = 'email' | 'registered_post' | 'courier' | 'other'

export interface NoticeMeta {
  /** When the complainant confirmed dispatch — starts the 30-day clock. */
  sentAt: string
  ref: string
  /** Registered-post tracking number, entered by the complainant. */
  postId: string | null
  methods: DispatchMethod[]
}

/**
 * The complainant's edits to the generated notice, keyed by block id.
 * Stored separately from NoticeMeta so a draft can be revised for as long as
 * it likes before any dispatch is recorded.
 */
export interface NoticeDraft {
  edits: Record<string, string>
  updatedAt: string
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
  noticeDraft?: NoticeDraft | null
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

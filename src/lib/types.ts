export type GroundId =
  | 'defective_goods'
  | 'deficient_service'
  | 'unfair_trade_practice'
  | 'overcharging'
  | 'spurious_goods'
  | 'hazardous_goods'
  | 'misleading_ad'

export interface Ground {
  id: GroundId
  label: string
  section: string
  description: string
  evidenceHints: string[]
  statuteRef: string
  statuteText: string[]
}

export type CommissionLevel = 'district' | 'state' | 'national'

export interface EvidenceFile {
  id: string
  name: string
  type: string
  sizeKb: number
  dataUrl: string
  category: 'invoice' | 'photo' | 'correspondence' | 'warranty' | 'other'
}

export interface IntakeData {
  // Party details
  fullName: string
  phone: string
  email: string
  city: string
  state: string

  // Opposite party
  companyName: string
  companyAddress: string
  /** Grievance-officer / customer-care address the notice is emailed to. */
  companyEmail: string

  // Case details.
  // A single fact pattern often engages more than one statutory ground — a
  // washing machine that fails and is then never serviced is both a defect in
  // goods and a deficiency in service. The first entry is treated as the
  // primary ground for headings and display; all of them are pleaded in the
  // notice. Legacy records carrying a single `ground` are normalised on read
  // (see normalizeIntake in lib/grounds.ts).
  grounds: GroundId[]
  narrative: string
  transactionDate: string // ISO date
  incidentDate: string // ISO date
  claimAmount: number | null
  consequentialLoss: number | null

  // Whether the user chose to join a coordinated group claim (vs. file individually)
  joinGroup: boolean

  evidence: EvidenceFile[]
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
    score: number // 0-100
    band: 'strong' | 'moderate' | 'weak'
    missing: string[]
  }
}

export const emptyIntake: IntakeData = {
  fullName: '',
  phone: '',
  email: '',
  city: '',
  state: '',
  companyName: '',
  companyAddress: '',
  companyEmail: '',
  grounds: [],
  narrative: '',
  transactionDate: '',
  incidentDate: '',
  claimAmount: null,
  consequentialLoss: null,
  joinGroup: false,
  evidence: [],
}

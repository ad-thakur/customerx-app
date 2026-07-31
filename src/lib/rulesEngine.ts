import type { IntakeData, RoutingResult, CommissionLevel } from './types'

// Pecuniary jurisdiction thresholds under CPA 2019.
// Kept as versioned config, NOT hardcoded logic, since these are set by
// government notification and have changed before.
export const JURISDICTION_CONFIG = {
  version: '2019-act-v1',
  districtMax: 5_000_000, // up to ₹50 lakh
  stateMax: 20_000_000, // ₹50 lakh – ₹2 crore
  // above ₹2 crore -> national
}

export const LIMITATION_CONFIG = {
  limitationYears: 2,
  condonableGraceDays: 90, // rough buffer for "sufficient cause" condonation risk banding — not legal certainty
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

export function routeCommission(totalClaim: number): { level: CommissionLevel; label: string } {
  if (totalClaim <= JURISDICTION_CONFIG.districtMax) {
    return { level: 'district', label: 'District Consumer Disputes Redressal Commission (DCDRC)' }
  }
  if (totalClaim <= JURISDICTION_CONFIG.stateMax) {
    return { level: 'state', label: 'State Consumer Disputes Redressal Commission (SCDRC)' }
  }
  return { level: 'national', label: 'National Consumer Disputes Redressal Commission (NCDRC)' }
}

export function estimateCourtFee(totalClaim: number, level: CommissionLevel): string {
  // Indicative bands only — commissions set exact fee schedules; this is
  // shown to the user as an estimate, not a quote.
  if (level === 'district') {
    if (totalClaim <= 500_000) return 'Nil (claims up to ₹5,00,000 are fee-exempt at District Commission)'
    return '₹200 – ₹2,000 (indicative, based on claim value)'
  }
  if (level === 'state') return '₹2,500 – ₹6,000 (indicative)'
  return '₹7,500 (indicative)'
}

export function checkLimitation(incidentDateStr: string, asOf: Date = new Date()) {
  const incidentDate = new Date(incidentDateStr)
  const limitationEnd = new Date(incidentDate)
  limitationEnd.setFullYear(limitationEnd.getFullYear() + LIMITATION_CONFIG.limitationYears)

  const daysElapsed = daysBetween(incidentDate, asOf)
  const daysRemaining = daysBetween(asOf, limitationEnd)
  const expired = daysRemaining < 0
  const withinCondonablePeriod =
    expired && Math.abs(daysRemaining) <= LIMITATION_CONFIG.condonableGraceDays

  return { daysElapsed, daysRemaining, expired, withinCondonablePeriod }
}

export function scoreEvidence(data: IntakeData) {
  let score = 0
  const missing: string[] = []

  // Core narrative
  if (data.narrative && data.narrative.trim().length > 40) score += 15
  else missing.push('A detailed written account of what happened (40+ characters)')

  // Transaction proof
  const hasInvoice = data.evidence.some((e) => e.category === 'invoice')
  if (hasInvoice) score += 30
  else missing.push('Proof of purchase/payment (invoice, receipt, bank/UPI record)')

  // Visual/photographic evidence
  const hasPhoto = data.evidence.some((e) => e.category === 'photo')
  if (hasPhoto) score += 20
  else missing.push('Photos or screenshots of the defect/issue')

  // Correspondence with opposite party
  const hasCorrespondence = data.evidence.some((e) => e.category === 'correspondence')
  if (hasCorrespondence) score += 20
  else missing.push('Written communication with the company (email/chat/complaint ticket)')

  // Warranty/agreement
  const hasWarranty = data.evidence.some((e) => e.category === 'warranty')
  if (hasWarranty) score += 10
  else missing.push('Warranty card or service agreement, if applicable')

  // Amount specified
  if (data.claimAmount && data.claimAmount > 0) score += 5
  else missing.push('A specific claim amount')

  score = Math.min(score, 100)
  const band: 'strong' | 'moderate' | 'weak' = score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'weak'

  return { score, band, missing }
}

export function runRoutingEngine(data: IntakeData): RoutingResult {
  const totalClaim = (data.claimAmount ?? 0) + (data.consequentialLoss ?? 0)
  const { level, label } = routeCommission(totalClaim)
  const limitation = data.incidentDate
    ? checkLimitation(data.incidentDate)
    : { daysElapsed: 0, daysRemaining: LIMITATION_CONFIG.limitationYears * 365, expired: false, withinCondonablePeriod: false }
  const courtFeeEstimate = estimateCourtFee(totalClaim, level)
  const evidenceScore = scoreEvidence(data)

  return {
    commission: level,
    commissionLabel: label,
    totalClaim,
    limitation,
    courtFeeEstimate,
    evidenceScore,
  }
}

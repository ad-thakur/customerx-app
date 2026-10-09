// ---------------------------------------------------------------------------
// Brand plans and AI-analysis allowances.
//
// Every complaint gets the statistical analysis automatically, free. The
// billable unit is one AI case analysis, which runs only when someone on the
// brand's team clicks for it: AI fact extraction, the briefing and the AI
// precedent review together. Running it again uses another. When the
// month's allowance is used up, the button is disabled until it resets.
//
// The allowances below are PLACEHOLDERS: set them to whatever the commercial
// plans turn out to be. A brand-specific limit (brands.monthly_limit)
// overrides its plan's allowance, for custom deals.
// ---------------------------------------------------------------------------

import type { Brand } from './brandStore.js'

export interface Plan {
  id: string
  label: string
  /** AI analyses per calendar month; null = unlimited. */
  monthlyAnalyses: number | null
}

export const PLANS: Plan[] = [
  { id: 'trial', label: 'Trial', monthlyAnalyses: 25 },
  { id: 'starter', label: 'Starter', monthlyAnalyses: 250 },
  { id: 'growth', label: 'Growth', monthlyAnalyses: 1_000 },
  { id: 'enterprise', label: 'Enterprise', monthlyAnalyses: null },
]

export function planFor(brand: Brand): Plan {
  return PLANS.find((p) => p.id === brand.plan) ?? PLANS[0]
}

/** This month's AI-analysis limit for the brand; null means no limit. */
export function analysisLimit(brand: Brand): number | null {
  if (brand.billingModel === 'pay_per_analysis') return brand.monthlyLimit // the brand's own cap
  return brand.monthlyLimit ?? planFor(brand).monthlyAnalyses
}

/**
 * Our cost per million tokens (USD) for the default model, to show admins
 * what each brand costs to serve. Update if BRAND_AI_MODEL changes.
 */
export const MODEL_COST_PER_MTOK = { input: 4, output: 20 }

export function tokenCostUsd(input: number, output: number): number {
  return (input * MODEL_COST_PER_MTOK.input + output * MODEL_COST_PER_MTOK.output) / 1_000_000
}

/** Platform staff who may change any brand's plan (comma-separated emails). */
export function isAdmin(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase())
}

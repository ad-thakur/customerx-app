// ---------------------------------------------------------------------------
// Mapping from our seven statutory grounds to e-Jagriti case categories.
//
// This exists because e-Jagriti's taxonomy does not line up with the Act. Its
// master list mixes *sectors* (MEDICAL, BANKING, TELECOM) with *complaint
// types* (DEFECTIVE GOODS, UNFAIR TRADE PRACTICES), runs to several hundred
// entries, and contains duplicate names under different ids. There is no
// "deficiency in service" category at all — in practice those cases are filed
// under the sector they arose in, which is why deficient_service maps to a
// spread of sectors rather than one label.
//
// The mapping is used for two things:
//
//   1. Ingest — `npm run ingest -- --ground deficient_service` pulls every
//      category listed for that ground.
//   2. Retrieval — precedent search is restricted to the categories mapped
//      from the case's own grounds before full-text ranking, so a washing
//      machine complaint cannot surface an agricultural dispute however the
//      keywords happen to fall.
//
// Category names are matched case-insensitively against the live master list
// at ingest time. Where a name is duplicated in that list, pin the id.
//
// IMPORTANT — most of e-Jagriti's master list is unusable. Probing NCDRC showed
// a hard boundary: categories with low ids (MEDICAL 1, ELECTRICITY 6, BANKING 8,
// TELECOM 9, AIRLINES 10, DEFECTIVE GOODS 19) return cases, while everything
// from roughly id 40 upwards returns nothing even over an 11-year window
// (ADVERTISEMENTS 43, GENERAL INSURANCE 56, REAL ESTATE 76, UNFAIR TRADE
// PRACTICES 174, MISLEADING ADVERTISEMENTS 473). The high ids appear to be a
// consumer-helpline taxonomy that no NCDRC case is filed under.
//
// So only add a category here after `npm run ingest -- --probe` confirms it
// has cases. Mapping a ground to an unused category is worse than mapping it
// to nothing: retrieval filters to it and silently returns empty.
// ---------------------------------------------------------------------------

import type { GroundId } from './types.js'

export interface CategoryRef {
  /** Name as it appears in e-Jagriti's master list, and as stored in the
   *  `category` column of precedent_cases. */
  name: string
  /** Pin the id where the name is ambiguous in the master list. */
  id?: number
}

export const GROUND_CATEGORIES: Record<GroundId, CategoryRef[]> = {
  // Probed 2026-08-09: has cases.
  defective_goods: [{ name: 'DEFECTIVE GOODS', id: 19 }],

  // No single category corresponds to s.2(11) — those cases are filed under
  // the sector they arose in. Probed 2026-08-09: these five return cases;
  // GENERAL INSURANCE (56), LIFE INSURANCE (66) and REAL ESTATE (76) returned
  // nothing and were removed.
  deficient_service: [
    { name: 'MEDICAL', id: 1 },
    { name: 'ELECTRICITY', id: 6 },
    { name: 'BANKING', id: 8 },
    { name: 'TELECOM', id: 9 },
    { name: 'AIRLINES', id: 10 },
  ],

  // UNFAIR TRADE PRACTICES (174) returned nothing over 2015-2026, so these
  // grounds have no confirmed category yet. An empty list means retrieval
  // returns nothing for them and the UI says "No similar cases have been
  // filed" — which is true. It must NOT fall back to searching the whole
  // corpus: that is precisely what surfaced agriculture judgments (id 26) on
  // a washing-machine complaint. Fill these in once --probe-range finds a
  // low-id category that carries such cases.
  unfair_trade_practice: [],

  overcharging: [],

  // ADVERTISEMENTS (43) and MISLEADING ADVERTISEMENTS (473/1125) both returned
  // nothing over 2015-2026 — they are helpline-taxonomy entries, not NCDRC
  // filing categories.
  misleading_ad: [],

  spurious_goods: [{ name: 'DEFECTIVE GOODS', id: 19 }],

  hazardous_goods: [{ name: 'DEFECTIVE GOODS', id: 19 }],
}

/** Category names to search for a set of grounds, de-duplicated. */
export function categoriesForGrounds(grounds: GroundId[]): string[] {
  const out = new Set<string>()
  for (const g of grounds) {
    for (const c of GROUND_CATEGORIES[g] ?? []) out.add(c.name)
  }
  return [...out]
}

/** Every category we know how to ingest, de-duplicated by name. */
export function allCategories(): CategoryRef[] {
  const seen = new Map<string, CategoryRef>()
  for (const refs of Object.values(GROUND_CATEGORIES)) {
    for (const c of refs) if (!seen.has(c.name)) seen.set(c.name, c)
  }
  return [...seen.values()]
}

export function isGroundId(value: string): value is GroundId {
  return Object.prototype.hasOwnProperty.call(GROUND_CATEGORIES, value)
}

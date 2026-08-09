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
// IMPORTANT — only part of e-Jagriti's master list is usable. Probing every id
// 1-45 against NCDRC (2015-2026) showed cases for ids 1-27, 29, 31, 35-38, and
// nothing at all from 39 upwards — ADVERTISEMENTS 43, GENERAL INSURANCE 56,
// REAL ESTATE 76, UNFAIR TRADE PRACTICES 174, MISLEADING ADVERTISEMENTS 473 are
// all empty. The high ids are a consumer-helpline taxonomy that no NCDRC case
// is filed under; the low ids are the real filing categories.
//
// The useful discovery is that ids 19/20/21 — DEFECTIVE GOODS, SERVICE
// DEFICIENCY, UNFAIR TRADE — map almost exactly onto the statutory heads, so
// most grounds resolve to a precise category rather than a proxy.
//
// Mapping deliberately stays narrow. Every extra category widens what can be
// returned as "comparable", and a plausible-looking but unrelated judgment is
// worse than none. Sector categories (MEDICAL 1, BANKING 8, AIRLINES 10,
// INSURANCE 3, HOUSING 5, RAILWAYS 7, FINANCE 11, POSTAL 13, EDUCATION 15) all
// have cases and can be added if recall proves too low — but they let a
// washing-machine complaint reach medical-negligence judgments, which is the
// same failure mode in a milder form.
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
  // Probed 2026-08-09 against NCDRC: all confirmed to have cases.
  //
  // AUTOMOBILES (29) was briefly removed here on the theory that it was the
  // source of car judgments appearing on a washing-machine complaint. Measured
  // against the live API, that was wrong twice over: with it removed,
  // ?grounds=defective_goods returned [] — 62 DEFECTIVE GOODS rows plus 7
  // appliance rows do not clear MIN_RANK on their own — while the car cases
  // kept appearing, because they are filed under SERVICE DEFICIENCY (20), not
  // AUTOMOBILES. Vehicle disputes are pleaded as deficiency in service by the
  // dealer. Removing it cost recall and fixed nothing, so it is back.
  //
  // The real causes of car-heavy results are corpus size and the fact that
  // vehicle disputes are over-represented at NCDRC. The fix is more rows, or
  // matching on the goods described in the intake rather than the ground alone.
  defective_goods: [
    { name: 'DEFECTIVE GOODS', id: 19 },
    { name: 'ELECTRICAL & ELECTRONIC GOODS', id: 27 },
    { name: 'HOUSE HOLD GOODS', id: 37 },
    { name: 'AUTOMOBILES', id: 29 },
  ],

  // s.2(11) has an exact counterpart at id 20. Kept to that rather than the
  // sector categories: a deficiency case is more like another deficiency case
  // than it is like anything else in the same industry.
  deficient_service: [{ name: 'SERVICE DEFICIENCY', id: 20 }],

  unfair_trade_practice: [{ name: 'UNFAIR TRADE', id: 21 }],

  // Charging above the displayed or agreed price is pleaded as an unfair trade
  // practice; there is no separate pricing category with cases.
  overcharging: [{ name: 'UNFAIR TRADE', id: 21 }],

  // Passing off spurious goods as genuine is both a defect and a deceptive
  // practice, and is pleaded under s.2(47).
  spurious_goods: [
    { name: 'DEFECTIVE GOODS', id: 19 },
    { name: 'UNFAIR TRADE', id: 21 },
  ],

  hazardous_goods: [
    { name: 'DEFECTIVE GOODS', id: 19 },
    { name: 'ELECTRICAL & ELECTRONIC GOODS', id: 27 },
  ],

  // There is no advertising category with any cases — ADVERTISEMENTS (43) and
  // MISLEADING ADVERTISEMENTS (473/1125) are both empty. This matches how the
  // ground is actually pleaded: a misleading advertisement is an unfair trade
  // practice under s.2(47), which is what the notice itself argues.
  misleading_ad: [{ name: 'UNFAIR TRADE', id: 21 }],
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

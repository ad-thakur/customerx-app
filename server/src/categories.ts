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
  defective_goods: [
    { name: 'DEFECTIVE GOODS' },
    { name: 'CONSUMER DURABLES' },
    { name: 'AUTOMOBILES' },
  ],

  // No single category corresponds to s.2(11). These are the sectors that
  // generate the bulk of NCDRC deficiency-in-service judgments.
  deficient_service: [
    { name: 'MEDICAL' },
    { name: 'BANKING' },
    { name: 'GENERAL INSURANCE' },
    { name: 'LIFE INSURANCE' },
    { name: 'TELECOM' },
    { name: 'AIRLINES' },
    { name: 'REAL ESTATE' },
    { name: 'ELECTRICITY' },
  ],

  unfair_trade_practice: [{ name: 'UNFAIR TRADE PRACTICES' }],

  overcharging: [{ name: 'UNFAIR TRADE PRACTICES' }, { name: 'LEGAL METROLOGY' }],

  spurious_goods: [{ name: 'DEFECTIVE GOODS' }, { name: 'UNFAIR TRADE PRACTICES' }],

  hazardous_goods: [{ name: 'DEFECTIVE GOODS' }, { name: 'UNFAIR TRADE PRACTICES' }],

  // "MISLEADING ADVERTISEMENTS" appears twice in the master list (473 and
  // 1125); 473 is the long-standing one, so it is pinned.
  misleading_ad: [
    { name: 'MISLEADING ADVERTISEMENTS', id: 473 },
    { name: 'ADVERTISEMENTS' },
    { name: 'UNFAIR TRADE PRACTICES' },
  ],
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

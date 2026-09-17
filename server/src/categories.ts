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

  // s.2(11) deficiency in service. e-Jagriti has an exact counterpart at id 20,
  // but in practice most deficiency cases are filed under the *sector* they
  // arose in (a bank complaint under BANKING, a flight under AIRLINES), not a
  // generic bucket. This mapping used to keep to id 20 alone to stay narrow.
  //
  // That is now reversed on purpose. Retrieval ranks results closest-first by
  // the case's own product/service (see searchLocalPrecedents), so an airline
  // complaint surfaces airline cases first, a bank complaint bank cases first,
  // and only then more distant sectors ("and so forth"). Ranking, not a narrow
  // category list, does the relevance work here — so the populated
  // deficiency-in-service sectors are included in scope rather than excluded.
  // All are --probe-confirmed to have NCDRC cases.
  deficient_service: [
    { name: 'SERVICE DEFICIENCY', id: 20 },
    { name: 'AIRLINES', id: 10 },
    { name: 'BANKING', id: 8 },
    { name: 'MEDICAL', id: 1 },
    { name: 'TELECOM', id: 9 },
    { name: 'ELECTRICITY', id: 6 },
  ],

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

/**
 * Search scope for a set of grounds, de-duplicated: the e-Jagriti categories the
 * grounds map to, plus the ground marker for any of 2(6)(d)–(g). The markers
 * only ever appear in a case's related_categories, so including them here lets a
 * search for, say, overcharging reach an overcharging-tagged case filed under
 * any category — without narrowing the categories it already searched.
 */
export function categoriesForGrounds(grounds: GroundId[]): string[] {
  const out = new Set<string>()
  for (const g of grounds) {
    for (const c of GROUND_CATEGORIES[g] ?? []) out.add(c.name)
    const marker = GROUND_MARKERS[g]
    if (marker) out.add(marker)
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

// ---------------------------------------------------------------------------
// Cross-referencing
//
// A case is filed under one category, but a single complaint often turns on
// more than one ground — an unfair-trade case that also complains of a
// defective product, or a defective-goods case pleaded as deficiency in
// service. We scan the judgment text for the other grounds and tag the case
// with a canonical category for each, so searching one category can still
// surface a case filed under another. These tags are stored in
// precedent_cases.related_categories and OR'd into the search scope.
//
// The tag for each ground is its most representative category name, so it
// overlaps with what categoriesForGrounds() returns for that ground:
//   defective_goods       → 'DEFECTIVE GOODS'
//   deficient_service     → 'SERVICE DEFICIENCY'
//   unfair_trade_practice → 'UNFAIR TRADE'
//
// The unfair-trade tag matters for reach: NCDRC's dedicated UNFAIR TRADE
// category holds only ~65 cases, but the practice is routinely pleaded
// alongside a defect or a deficiency, so many more cases across other
// categories genuinely involve it. Tagging them makes those reachable from an
// unfair-trade search.
// ---------------------------------------------------------------------------

const CROSSREF_GOODS = 'DEFECTIVE GOODS'
const CROSSREF_SERVICE = 'SERVICE DEFICIENCY'
const CROSSREF_UTP = 'UNFAIR TRADE'

/**
 * Markers for grounds that have NO dedicated e-Jagriti category of their own —
 * they are pleaded inside UNFAIR TRADE or DEFECTIVE GOODS. Tagging a case with
 * the marker for each such ground its judgment turns on, and adding that marker
 * to the ground's search scope (see categoriesForGrounds), makes these grounds
 * searchable across whatever category the case happened to be filed under.
 *
 * These are the statutory heads Section 2(6)(d)–(g): overcharging, spurious
 * goods, hazardous goods, and misleading advertisement.
 */
export const GROUND_MARKERS: Partial<Record<GroundId, string>> = {
  overcharging: 'OVERCHARGING',
  spurious_goods: 'SPURIOUS GOODS',
  hazardous_goods: 'HAZARDOUS GOODS',
  misleading_ad: 'MISLEADING ADVERTISEMENT',
}

// Deliberately phrase-based, not single words: "defect"/"service"/"trade"/
// "price" alone appear in almost every consumer judgment. We look for the way
// each ground is actually pleaded so the tags stay meaningful.
const GOODS_SIGNAL =
  /manufactur\w*\s+defect|defective\s+(goods?|product|article|vehicle|car|unit|item|machine)|defect\s+in\s+the\s+(goods?|product|vehicle|car|machine|unit|article)|inherent\s+defect|goods?\s+(were|was|are|is)\s+defective/i
const SERVICE_SIGNAL =
  /deficien\w*\s+(in|of)\s+servic|deficient\s+servic|negligen\w*\s+(in|during)\s+(treatment|service|servic)/i
const UTP_SIGNAL =
  /unfair\s+trade\s+practic|restrictive\s+trade\s+practic|misleading\s+(advertis|representation)|false\s+(representation|promise|claim)|deceptive\s+practic/i

// 2(6)(d)–(g). Tighter than the three above because these grounds are being
// counted, not just cross-linked — a loose match would inflate the totals.
const OVERCHARGING_SIGNAL =
  /overcharg|over-charg|in excess of the (price|m\.?r\.?p|maximum retail|rate|tariff|amount fixed)|(charged|realis\w+|collect\w+|recover\w+)\s+(a\s+)?(price|amount|sum)?\s*in excess|excess\s+(price|amount|charge|realis)|(above|over|exceed\w*)\s+the\s+m\.?r\.?p/i
const SPURIOUS_SIGNAL =
  /spurious goods?|counterfeit|passing[- ]off|sold as genuine|goods?\s+(found|were|are|is|was)\s+(to be\s+)?(spurious|counterfeit|fake|not genuine)|fake\s+(product|goods|article)/i
const HAZARDOUS_SIGNAL =
  /hazardous to (life|life and safety|the public)|unsafe (goods|product|to the public|when used)|contravention of .{0,25}safety standard|dangerous (goods|product|to life)/i
const MISLEADING_AD_SIGNAL =
  /misleading advertis|false advertis|deceptive advertis|(misleading|false|deceptive)\s+(representation|statement|claim)\s+.{0,25}advertis|advertis\w+\s+.{0,30}(false|misleading|deceptive)/i

/**
 * Which *other* grounds a judgment also turns on, by its text — returned as
 * category names (for grounds that map to a category) or ground markers (for
 * 2(6)(d)–(g), which do not). Returns [] when none apply. The case's own
 * category is never returned, so a DEFECTIVE GOODS case is not tagged as also
 * being defective goods.
 */
export function crossReferenceCategories(
  text: string | null | undefined,
  primaryCategory: string,
): string[] {
  if (!text) return []
  const tags = new Set<string>()
  if (GOODS_SIGNAL.test(text)) tags.add(CROSSREF_GOODS)
  if (SERVICE_SIGNAL.test(text)) tags.add(CROSSREF_SERVICE)
  if (UTP_SIGNAL.test(text)) tags.add(CROSSREF_UTP)
  if (OVERCHARGING_SIGNAL.test(text)) tags.add(GROUND_MARKERS.overcharging!)
  if (SPURIOUS_SIGNAL.test(text)) tags.add(GROUND_MARKERS.spurious_goods!)
  if (HAZARDOUS_SIGNAL.test(text)) tags.add(GROUND_MARKERS.hazardous_goods!)
  if (MISLEADING_AD_SIGNAL.test(text)) tags.add(GROUND_MARKERS.misleading_ad!)
  tags.delete(primaryCategory)
  return [...tags]
}

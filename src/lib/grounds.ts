import type { Ground, GroundId } from './types'

export const GROUNDS: Ground[] = [
  {
    id: 'defective_goods',
    label: 'Defective goods',
    section: 'Sec. 2(6)(a)',
    description: 'The product you bought is faulty, broken, or does not work as it should.',
    evidenceHints: ['Purchase invoice or receipt', 'Photos/video of the defect', 'Warranty card', 'Service centre reports'],
    statuteRef: 'Section 2(6)(ii), read with Section 2(10)',
    statuteText: [
      '"complaint" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— ... (ii) the goods bought by him or agreed to be bought by him suffer from one or more defects;',
      '"defect" means any fault, imperfection or shortcoming in the quality, quantity, potency, purity or standard which is required to be maintained by or under any law for the time being in force or under any contract, express or implied, or as is claimed by the trader in any manner whatsoever in relation to any goods or product and the expression "defective" shall be construed accordingly;',
    ],
  },
  {
    id: 'deficient_service',
    label: 'Deficient service',
    section: 'Sec. 2(6)(b)',
    description: 'A service you paid for was incomplete, delayed, or below the standard promised.',
    evidenceHints: ['Payment proof', 'Service agreement or booking confirmation', 'Written communication with the provider'],
    statuteRef: 'Section 2(6)(iii), read with Section 2(11)',
    statuteText: [
      '"complaint" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— ... (iii) the services hired or availed of or agreed to be hired or availed of by him suffer from any deficiency;',
      '"deficiency" means any fault, imperfection, shortcoming or inadequacy in the quality, nature and manner of performance which is required to be maintained by or under any law for the time being in force or has been undertaken to be performed by a person in pursuance of a contract or otherwise in relation to any service and includes— (i) any act of negligence or omission or commission by such person which causes loss or injury to the consumer; and (ii) deliberate withholding of relevant information by such person to the consumer;',
    ],
  },
  {
    id: 'unfair_trade_practice',
    label: 'Unfair trade practice',
    section: 'Sec. 2(6)(c)',
    description: 'The seller misrepresented facts, used deceptive tactics, or engaged in practices that misled you.',
    evidenceHints: ['Advertisement or listing screenshots', 'Correspondence', 'Proof of the actual terms received'],
    statuteRef: 'Section 2(6)(i), read with Section 2(47)',
    statuteText: [
      '"complaint" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— (i) an unfair contract or unfair trade practice or a restrictive trade practice has been adopted by any trader or service provider;',
      '"unfair trade practice" means a trade practice which, for the purpose of promoting the sale, use or supply of any goods or for the provision of any service, adopts any unfair method or unfair or deceptive practice, as further defined and illustrated in Section 2(47).',
    ],
  },
  {
    id: 'overcharging',
    label: 'Overcharging / excess pricing',
    section: 'Sec. 2(6)(d)',
    description: 'You were charged more than the price displayed, agreed, or legally permitted (e.g. above MRP).',
    evidenceHints: ['Bill showing amount charged', 'MRP tag or listed price', 'Price comparison proof'],
    statuteRef: 'Section 2(6)(iv)',
    statuteText: [
      '"complaint" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— ... (iv) a trader or a service provider, as the case may be, has charged for the goods or for the services mentioned in the complaint, a price in excess of the price— (a) fixed by or under any law for the time being in force; or (b) displayed on the goods or any package containing such goods; or (c) displayed on the price list exhibited by him by or under any law for the time being in force; or (d) agreed between the parties;',
    ],
  },
  {
    id: 'spurious_goods',
    label: 'Spurious goods sold as genuine',
    section: 'Sec. 2(6)(e)',
    description: 'What you received was fake, counterfeit, or not what was represented as genuine.',
    evidenceHints: ['Product photos', 'Original listing/advertisement', 'Authentication or lab report if available'],
    statuteRef: 'Section 2(47) — unfair trade practice',
    statuteText: [
      '"unfair trade practice" means a trade practice which, for the purpose of promoting the sale, use or supply of any goods or for the provision of any service, adopts any unfair method or unfair or deceptive practice, including— ... the manufacturing of spurious goods or offering such goods for sale or adopting deceptive practices in the provision of services;',
      'Pursued as a complaint under Section 2(6)(i) (unfair trade practice adopted by a trader or service provider).',
    ],
  },
  {
    id: 'hazardous_goods',
    label: 'Hazardous goods sold knowingly',
    section: 'Sec. 2(6)(f)',
    description: 'The goods sold were unsafe or non-compliant with safety standards, and this was known to the seller.',
    evidenceHints: ['Product safety markings (or absence)', 'Injury/damage evidence', 'Medical or incident report if applicable'],
    statuteRef: 'Section 2(6)(v)',
    statuteText: [
      '"complaint" means any allegation in writing, made by a complainant for obtaining any relief provided by or under this Act, that— ... (v) the goods, which are hazardous to life and safety when used, are being offered for sale to the public— (a) in contravention of standards relating to safety of such goods as required to be complied with, by or under any law for the time being in force; (b) where the trader knows that the goods so offered are unsafe to the public;',
    ],
  },
  {
    id: 'misleading_ad',
    label: 'Misleading advertisement',
    section: 'Sec. 2(6)(g)',
    description: 'An advertisement made false or misleading claims that influenced your purchase.',
    evidenceHints: ['Copy of the advertisement', 'Proof of purchase influenced by it', 'Comparison with actual product/service'],
    statuteRef: 'Section 2(47) — unfair trade practice',
    statuteText: [
      '"unfair trade practice" means a trade practice which, for the purpose of promoting the sale, use or supply of any goods or for the provision of any service, adopts any unfair method or unfair or deceptive practice, including— making a statement, whether orally or in writing or by visible representation, which falsely represents that the goods are of a particular standard, quality, quantity, grade, composition, style or model, or that the services are of a particular standard, quality or grade;',
      'Pursued as a complaint under Section 2(6)(i) (unfair trade practice adopted by a trader or service provider).',
    ],
  },
]

export const groundById = (id: string | null) => GROUNDS.find((g) => g.id === id) ?? null

// ---------------------------------------------------------------------------
// Multi-ground helpers
//
// A case carries an ordered list of grounds. Order is meaningful: the first is
// the primary ground, used for the notice heading and for one-line displays
// where there is only room for one.
// ---------------------------------------------------------------------------

/** Resolves ids to Ground objects, preserving selection order, dropping unknowns. */
export function groundsByIds(ids: GroundId[] | null | undefined): Ground[] {
  return (ids ?? []).map((id) => groundById(id)).filter((g): g is Ground => g !== null)
}

/** The primary (first-selected) ground, or null if none chosen. */
export function primaryGround(ids: GroundId[] | null | undefined): Ground | null {
  return groundsByIds(ids)[0] ?? null
}

/**
 * Reads the grounds off an intake that may predate the multi-ground migration.
 * Records created before then carry a single `ground` string instead.
 */
export function readGrounds(intake: { grounds?: GroundId[]; ground?: GroundId | null }): GroundId[] {
  if (Array.isArray(intake.grounds) && intake.grounds.length > 0) return intake.grounds
  return intake.ground ? [intake.ground] : []
}

/** Human list: "defective goods, deficient service and unfair trade practice". */
export function groundListLabel(ids: GroundId[] | null | undefined, lower = true): string {
  const labels = groundsByIds(ids).map((g) => (lower ? g.label.toLowerCase() : g.label))
  if (labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

// ---------------------------------------------------------------------------
// Statutory characterisation — paragraph 5 of the legal notice
//
// Several grounds collapse onto the same statutory head (spurious goods and
// misleading advertisement are both pleaded as unfair trade practice under
// s.2(47)), so clauses are de-duplicated by `key` before rendering.
// ---------------------------------------------------------------------------

export interface Characterisation {
  key: string
  section: string
  /** Rendered after "amounts to:" — no leading article, no trailing full stop. */
  text: string
}

const CHARACTERISATIONS: Record<GroundId, Characterisation> = {
  defective_goods: {
    key: 'defect',
    section: 'Section 2(10)',
    text: 'a "defect" in the goods supplied within the meaning of Section 2(10) of the Act, being a fault, imperfection or shortcoming in the quality or standard required to be maintained under the contract and as claimed by you',
  },
  deficient_service: {
    key: 'deficiency',
    section: 'Section 2(11)',
    text: 'a "deficiency" in the service rendered within the meaning of Section 2(11) of the Act, being a shortfall in the quality, nature and manner of performance required to be maintained, and including the acts of negligence and omission set out above',
  },
  unfair_trade_practice: {
    key: 'utp',
    section: 'Section 2(47)',
    text: 'an "unfair trade practice" within the meaning of Section 2(47) of the Act, in that you adopted a deceptive practice and failed to honour the representations and warranty on the faith of which my Client contracted',
  },
  overcharging: {
    key: 'overcharge',
    section: 'Section 2(6)(iv)',
    text: 'the charging of a price in excess of the price displayed, agreed between the parties, or fixed by or under law, being a complaint maintainable under Section 2(6)(iv) of the Act',
  },
  spurious_goods: {
    key: 'utp_spurious',
    section: 'Section 2(47)',
    text: 'an "unfair trade practice" within the meaning of Section 2(47) of the Act, in that goods which were spurious and not genuine were offered and sold to my Client as genuine',
  },
  hazardous_goods: {
    key: 'hazard',
    section: 'Section 2(6)(v)',
    text: 'the offering for sale of goods hazardous to life and safety in contravention of the safety standards required to be complied with under law, being a complaint maintainable under Section 2(6)(v) of the Act',
  },
  misleading_ad: {
    key: 'utp_ad',
    section: 'Section 2(47)',
    text: 'an "unfair trade practice" within the meaning of Section 2(47) of the Act, in that a false and misleading representation as to the standard, quality and characteristics of the goods or services was made and relied upon by my Client',
  },
}

/**
 * The statutory clauses to plead for a set of grounds, de-duplicated, always
 * closing with the Section 2(9) consumer-rights limb the template carries.
 */
export function characterisations(ids: GroundId[] | null | undefined): Characterisation[] {
  const out: Characterisation[] = []
  const seen = new Set<string>()
  for (const id of ids ?? []) {
    const c = CHARACTERISATIONS[id]
    if (!c || seen.has(c.key)) continue
    seen.add(c.key)
    out.push(c)
  }
  out.push({
    key: 'rights',
    section: 'Section 2(9)',
    text: 'a violation of the consumer rights recognised under Section 2(9) of the Act, including the right to be protected against goods and services hazardous to life and property and the right to be informed of the quality and standard of goods and services',
  })
  return out
}

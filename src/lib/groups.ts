// Illustrative group-claim clusters for the aggregation feature.
// In production these come from the backend (claims clustered by company + product + failure).
export type GroupStatus = 'collecting' | 'notice_sent' | 'in_settlement' | 'settled'

export interface GroupClaim {
  id: string
  companyKey: string // lowercase substring used to match a typed company name
  company: string
  issue: string
  section: string
  count: number
  target?: number // for "collecting" clusters, the threshold to trigger a coordinated notice
  combinedValue: string
  status: GroupStatus
  statusLabel: string
}

export const GROUP_CLAIMS: GroupClaim[] = [
  {
    id: 'GC-2026-0043',
    companyKey: 'vayu',
    company: 'Vayu Appliances',
    issue: '8kg front-load washing machines — motor defect within warranty',
    section: 'Defective goods · Sec. 2(6)(a)',
    count: 126,
    combinedValue: '₹34.2L',
    status: 'notice_sent',
    statusLabel: 'Coordinated notice sent',
  },
  {
    id: 'GC-2026-0031',
    companyKey: 'nimbus',
    company: 'Nimbus Broadband',
    issue: 'Charged for speeds never delivered',
    section: 'Deficient service & overcharging · Sec. 2(6)(b)/(d)',
    count: 540,
    combinedValue: '₹27.5L',
    status: 'in_settlement',
    statusLabel: 'In settlement talks',
  },
  {
    id: 'GC-2026-0028',
    companyKey: 'brightkart',
    company: 'BrightKart',
    issue: 'Prepaid orders marked delivered, never arrived',
    section: 'Deficient service · Sec. 2(6)(b)',
    count: 312,
    combinedValue: '₹18.7L',
    status: 'in_settlement',
    statusLabel: 'In settlement talks',
  },
  {
    id: 'GC-2026-0052',
    companyKey: 'zephyr',
    company: 'Zephyr Mobiles',
    issue: 'Z9 Pro overheating & battery swelling',
    section: 'Hazardous goods · Sec. 2(6)(f)',
    count: 74,
    target: 100,
    combinedValue: '₹22.1L',
    status: 'collecting',
    statusLabel: 'Collecting claims',
  },
  {
    id: 'GC-2026-0049',
    companyKey: 'glowderm',
    company: 'GlowDerm Naturals',
    issue: '"Clinically proven" claims with no substantiation',
    section: 'Misleading advertisement · Sec. 2(47)',
    count: 208,
    target: 250,
    combinedValue: '₹9.4L',
    status: 'collecting',
    statusLabel: 'Collecting claims',
  },
  {
    id: 'GC-2025-0017',
    companyKey: 'cinesnax',
    company: 'CineSnax Multiplex',
    issue: 'Packaged water sold above MRP',
    section: 'Overcharging · Sec. 2(6)(d)',
    count: 1140,
    combinedValue: '₹6.8L',
    status: 'settled',
    statusLabel: 'Settled · recovered',
  },
]

export const GROUP_JOIN_FEE = '₹5,000'
export const INDIVIDUAL_FEE = '₹5,500'

export function matchGroup(companyName: string): GroupClaim | null {
  const n = companyName.trim().toLowerCase()
  if (!n) return null
  return GROUP_CLAIMS.find((g) => g.status !== 'settled' && n.includes(g.companyKey)) ?? null
}

export const featuredGroup = GROUP_CLAIMS[0] // Vayu — the demo's through-line

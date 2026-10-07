// ---------------------------------------------------------------------------
// API client for the brand dashboard, complaint intake and the consumer's
// tracking link. Types mirror server/src/brandStore.ts and brandAnalysis.ts.
// ---------------------------------------------------------------------------

import { getSession } from './auth'
import type { GroundId } from './types'

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const session = getSession()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ComplaintSource = 'web' | 'email' | 'hosted' | 'manual' | 'social'
export type ComplaintStatus = 'new' | 'responded' | 'consumer_replied' | 'resolved' | 'escalated' | 'closed'
export type OfferKind = 'refund' | 'replacement' | 'repair' | 'service' | 'gift_card' | 'promo' | 'partial_refund'
export type Outcome = 'consumer' | 'business' | 'settled' | 'withdrawn' | 'unknown'

export interface Brand {
  id: string
  name: string
  slug: string
  aliases: string[]
  grossMargin: number
  intakeKey: string
  socialEnabled: boolean
  createdAt: string
}

export interface Offer {
  kind: OfferKind
  value: number
  note: string
  status: 'pending' | 'accepted' | 'declined'
  madeAt: string
  decidedAt?: string
}

export interface ThreadEntry {
  id: string
  from: 'brand' | 'consumer' | 'system'
  text: string
  at: string
  offer?: Offer
  author?: string
}

export interface PrecedentView {
  caseNumber: string
  title: string
  outcome: Outcome
  stage: string | null
  date: string | null
  snippet: string
  againstThisBrand: boolean
}

export interface ActionOption {
  id: string
  kind: OfferKind | 'request_info' | 'decline' | 'advise' | 'contest'
  title: string
  detail: string
  faceValue: number
  cost: number
  closeLikelihood: number
  recommended: boolean
}

export interface ComplaintAnalysis {
  facts: {
    grounds: GroundId[]
    product: string
    amount: number | null
    purchaseDate: string | null
    hasInvoice: boolean
    hasPhotos: boolean
    hasTicket: boolean
    priorContacts: number
    serviceVisits: number
    withinWarranty: boolean | null
    threatensLegal: boolean
    summary: string
    extractedBy: 'ai' | 'rules'
  }
  prediction: {
    consumerWinPct: number
    label: string
    confidence: 'low' | 'medium' | 'high'
    basis: string
    factors: { label: string; effect: 'up' | 'down'; weight: 'small' | 'medium' | 'large' }[]
  }
  frivolity: { score: number; label: string; signals: string[] }
  exposure: {
    forum: string
    principal: number
    awardIfLost: { low: number; high: number }
    defenceCost: { low: number; high: number }
    expectedCostIfContested: number
    expectedCostIfUnresolved: number
    recommendedExpectedCost: number
    cheapestResolution: number
    saving: number
  }
  similar: { decided: number; consumerWins: number; cases: PrecedentView[] }
  brandRecord: { total: number; decided: number; consumerWins: number; recent: PrecedentView[] }
  actions: ActionOption[]
  priority: 'urgent' | 'high' | 'normal' | 'low'
  narrative: string | null
  generatedAt: string
}

export interface Complaint {
  id: string
  brandId: string
  source: ComplaintSource
  status: ComplaintStatus
  receivedAt: string
  updatedAt: string
  consumerName: string
  consumerEmail: string
  consumerPhone: string
  subject: string
  body: string
  orderRef: string
  product: string
  amountClaimed: number | null
  purchaseDate: string | null
  analysis: ComplaintAnalysis | null
  analyzedAt: string | null
  thread: ThreadEntry[]
  offer: Offer | null
  firstResponseAt: string | null
  resolvedAt: string | null
  trackUrl: string
}

export interface ComplaintRow {
  id: string
  source: ComplaintSource
  status: ComplaintStatus
  receivedAt: string
  updatedAt: string
  consumerName: string
  subject: string
  product: string
  summary: string
  amount: number | null
  firstResponseAt: string | null
  offer: Offer | null
  analysed: boolean
  consumerWinPct: number | null
  frivolity: string | null
  priority: ComplaintAnalysis['priority'] | null
  expectedCost: number | null
  recommended: string | null
  grounds: GroundId[]
}

export interface QueueStats {
  total: number
  open: number
  unanswered: number
  overdue: number
  highRisk: number
  openExposure: number
  resolved: number
  resolutionRate: number | null
  escalated: number
  avgFirstResponseHours: number | null
  settledValue: number
}

export interface TrackView {
  id: string
  brandName: string
  status: ComplaintStatus
  receivedAt: string
  subject: string
  body: string
  orderRef: string
  product: string
  amountClaimed: number | null
  purchaseDate: string | null
  offer: Offer | null
  thread: ThreadEntry[]
}

/* -------------------------------------------------------------------------- */
/* Brand dashboard                                                            */
/* -------------------------------------------------------------------------- */

export const myBrands = () => api<{ brands: Brand[] }>('/api/brand/me').then((r) => r.brands)

export const createBrand = (input: { name: string; aliases: string[]; grossMargin: number }) =>
  api<Brand>('/api/brand', { method: 'POST', body: JSON.stringify(input) })

export const updateBrand = (id: string, patch: Partial<Pick<Brand, 'name' | 'aliases' | 'grossMargin'>>) =>
  api<Brand>(`/api/brand/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const listMembers = (id: string) => api<{ email: string; role: string }[]>(`/api/brand/${id}/members`)

export const addMember = (id: string, email: string) =>
  api<{ email: string; role: string }[]>(`/api/brand/${id}/members`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })

export const loadQueue = (brandId: string) =>
  api<{ brand: Brand; stats: QueueStats; complaints: ComplaintRow[] }>(`/api/brand/${brandId}/complaints`)

export const addComplaint = (brandId: string, input: Record<string, unknown>) =>
  api<Complaint>(`/api/brand/${brandId}/complaints`, { method: 'POST', body: JSON.stringify(input) })

export const loadComplaint = (brandId: string, id: string) =>
  api<Complaint>(`/api/brand/${brandId}/complaints/${id}`)

export const reanalyse = (brandId: string, id: string) =>
  api<Complaint>(`/api/brand/${brandId}/complaints/${id}/analyse`, { method: 'POST' })

export const draftResponse = (brandId: string, id: string, actionId: string) =>
  api<{ text: string; offer: { kind: OfferKind; value: number } | null }>(
    `/api/brand/${brandId}/complaints/${id}/draft`,
    { method: 'POST', body: JSON.stringify({ actionId }) },
  )

export const respond = (
  brandId: string,
  id: string,
  text: string,
  offer: { kind: OfferKind; value: number; note?: string } | null,
) =>
  api<Complaint>(`/api/brand/${brandId}/complaints/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ text, offer }),
  })

export const setStatus = (brandId: string, id: string, status: 'resolved' | 'closed' | 'new') =>
  api<Complaint>(`/api/brand/${brandId}/complaints/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })

export const seedDemo = (brandId: string) =>
  api<{ added: number }>(`/api/brand/${brandId}/demo-seed`, { method: 'POST' })

/* -------------------------------------------------------------------------- */
/* Social listening add-on                                                    */
/* -------------------------------------------------------------------------- */

export type Platform = 'x' | 'reddit'
export type MentionKind = 'complaint' | 'question' | 'praise' | 'other'
export type MentionStatus = 'new' | 'replied' | 'converted' | 'dismissed'

export interface Mention {
  id: string
  platform: Platform
  externalId: string | null
  url: string | null
  authorHandle: string
  authorName: string
  authorFollowers: number
  community: string | null
  text: string
  postedAt: string
  likes: number
  reposts: number
  replies: number
  kind: MentionKind
  visibility: number
  status: MentionStatus
  reply: { text: string; at: string; author: string } | null
  complaintId: string | null
  sample: boolean
}

export type SocialFeed =
  | { enabled: false }
  | {
      enabled: true
      formUrl: string
      connections: { x: { connected: boolean }; reddit: { connected: boolean; keywords: string[] } }
      stats: {
        last7d: number
        complaints: number
        unanswered: number
        highVisibility: number
        converted: number
        reach: number
      }
      mentions: Mention[]
    }

export const loadSocial = (brandId: string) => api<SocialFeed>(`/api/brand/${brandId}/social`)

export const enableSocial = (brandId: string) =>
  api<Brand>(`/api/brand/${brandId}/social/enable`, { method: 'POST' })

export const seedSocial = (brandId: string) =>
  api<{ added: number }>(`/api/brand/${brandId}/social/demo-seed`, { method: 'POST' })

export const draftSocial = (brandId: string, mid: string) =>
  api<{ text: string }>(`/api/brand/${brandId}/social/${mid}/draft`, { method: 'POST' })

export const replySocial = (brandId: string, mid: string, text: string) =>
  api<{ mention: Mention; postLink: string | null }>(`/api/brand/${brandId}/social/${mid}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })

export const convertSocial = (brandId: string, mid: string) =>
  api<{ mention: Mention; complaintId: string }>(`/api/brand/${brandId}/social/${mid}/convert`, {
    method: 'POST',
  })

export const setMentionStatus = (brandId: string, mid: string, status: 'dismissed' | 'new') =>
  api<{ mention: Mention }>(`/api/brand/${brandId}/social/${mid}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  })

/* -------------------------------------------------------------------------- */
/* Hosted form and consumer tracking                                          */
/* -------------------------------------------------------------------------- */

export const hostedBrand = (slug: string) => api<{ name: string; slug: string }>(`/api/intake/brand/${slug}`)

export const submitHosted = (slug: string, input: Record<string, unknown>) =>
  api<{ id: string; trackUrl: string }>(`/api/intake/hosted/${slug}`, {
    method: 'POST',
    body: JSON.stringify(input),
  })

const trackHeaders = (t: string) => ({ 'x-track-token': t })

export const loadTrack = (id: string, t: string) =>
  api<TrackView>(`/api/track/${id}`, { headers: trackHeaders(t) })

export const trackReply = (id: string, t: string, text: string) =>
  api<TrackView>(`/api/track/${id}/reply`, {
    method: 'POST',
    headers: trackHeaders(t),
    body: JSON.stringify({ text }),
  })

export const trackDetails = (id: string, t: string, input: Record<string, unknown>) =>
  api<TrackView>(`/api/track/${id}/details`, {
    method: 'POST',
    headers: trackHeaders(t),
    body: JSON.stringify(input),
  })

export const trackOffer = (id: string, t: string, decision: 'accept' | 'decline', reason?: string) =>
  api<TrackView>(`/api/track/${id}/offer`, {
    method: 'POST',
    headers: trackHeaders(t),
    body: JSON.stringify({ decision, reason }),
  })

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

export function rupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

/** ₹1.2L / ₹3.4Cr for tight spaces. */
export function rupeesShort(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}k`
  return `₹${Math.round(n)}`
}

export function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 48) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export const SOURCE_LABEL: Record<ComplaintSource, string> = {
  web: 'Website',
  email: 'Email',
  hosted: 'ConsumerX form',
  manual: 'Added manually',
  social: 'Social media',
}

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  new: 'Awaiting response',
  responded: 'Responded',
  consumer_replied: 'Consumer replied',
  resolved: 'Resolved',
  escalated: 'Escalated',
  closed: 'Closed',
}

export const OFFER_LABEL: Record<OfferKind, string> = {
  refund: 'Refund',
  partial_refund: 'Partial refund',
  replacement: 'Replacement',
  repair: 'Priority repair',
  service: 'Complete the service',
  gift_card: 'Store credit',
  promo: 'Goodwill voucher',
}

const SELECTED_KEY = 'consumerx.brand.v1'
export function rememberedBrand(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY)
  } catch {
    return null
  }
}
export function rememberBrand(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id)
  } catch {
    // storage unavailable — the choice lasts until reload
  }
}

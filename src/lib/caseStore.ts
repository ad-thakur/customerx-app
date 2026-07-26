import type { GroundId, IntakeData, RoutingResult } from './types'

// ---------------------------------------------------------------------------
// API client for the Consumer X backend (Express + Postgres on Railway).
//
// The server is the source of truth for case state; the browser keeps only
// the per-case access tokens (no accounts in this phase — a case is reachable
// by whoever holds its unguessable token, which also makes case links
// shareable). The "company side" of the loop is still simulated server-side
// on a user-advanceable demo clock.
// ---------------------------------------------------------------------------

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export const MILESTONES = {
  emailDelivered: 1,
  postAcknowledged: 3,
  noticeOpened: 5,
  offerReceived: 12,
  windowCloses: 30,
} as const

export type CaseStatus =
  | 'draft'
  | 'awaiting_response'
  | 'offer_received'
  | 'window_closed'
  | 'resolved'

export interface AiAssessment {
  narrative: string
  precedents: { title: string; docUrl: string; court: string; note: string }[]
  model: string
  generatedAt: string
}

export interface Assessment {
  paidAt: string
  receiptId: string
  band: 'strong' | 'moderate' | 'weak'
  rangeLow: number
  rangeHigh: number
  route: string
  drivers: { kind: 'strong' | 'watch'; text: string }[]
  ai: AiAssessment | null
}

export interface NoticeMeta {
  sentAt: string
  ref: string
  postId: string
}

export interface Resolution {
  acceptedAt: string
  amount: number
  daysFromNotice: number
  ledgerConsent: boolean
}

export interface Offer {
  amount: number
  goodwill: number
  receivedDay: number
}

export interface CaseView {
  id: string
  createdAt: string
  intake: IntakeData
  routing: RoutingResult
  clockOffsetDays: number
  assessment?: Assessment | null
  notice?: NoticeMeta | null
  resolution?: Resolution | null
  derived: {
    status: CaseStatus
    noticeDaysElapsed: number
    offer: Offer
  }
}

// ---------------------------------------------------------------------------
// Token + signature registries (localStorage)
// ---------------------------------------------------------------------------

const TOKENS_KEY = 'customerx.caseTokens.v1'
const SIGS_KEY = 'customerx.caseSigs.v1'

function readMap(key: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeMap(key: string, map: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(map))
  } catch {
    // storage unavailable — session continues in memory
  }
}

export function getToken(id: string): string | null {
  return readMap(TOKENS_KEY)[id] ?? null
}

export function saveToken(id: string, token: string) {
  const map = readMap(TOKENS_KEY)
  map[id] = token
  writeMap(TOKENS_KEY, map)
}

export function knownCaseIds(): string[] {
  return Object.keys(readMap(TOKENS_KEY))
}

function intakeSignature(d: IntakeData): string {
  return [d.companyName, d.incidentDate, d.claimAmount, d.ground].join('|')
}

/** Shareable link that carries the case token. */
export function caseShareUrl(id: string): string {
  const token = getToken(id)
  return `${window.location.origin}/case/${id}${token ? `?t=${token}` : ''}`
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function request<T>(path: string, opts: RequestInit = {}, token?: string | null): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-case-token': token } : {}),
      ...(opts.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Case operations
// ---------------------------------------------------------------------------

export async function ensureCaseFromIntake(
  intake: IntakeData,
  routing: RoutingResult,
): Promise<CaseView> {
  const sigs = readMap(SIGS_KEY)
  const sig = intakeSignature(intake)
  const existingId = sigs[sig]
  if (existingId) {
    const existing = await getCaseView(existingId).catch(() => null)
    if (existing) return existing
  }

  const created = await request<CaseView & { token: string }>('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ intake, routing }),
  })
  saveToken(created.id, created.token)
  sigs[sig] = created.id
  writeMap(SIGS_KEY, sigs)
  return created
}

export async function getCaseView(id: string, urlToken?: string | null): Promise<CaseView> {
  if (urlToken) saveToken(id, urlToken)
  const token = urlToken ?? getToken(id)
  return request<CaseView>(`/api/cases/${id}`, {}, token)
}

export async function listCaseViews(): Promise<CaseView[]> {
  const views = await Promise.all(
    knownCaseIds().map((id) => getCaseView(id).catch(() => null)),
  )
  return views
    .filter((v): v is CaseView => v !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function caseAction(id: string, action: string, body?: unknown): Promise<CaseView> {
  return request<CaseView>(
    `/api/cases/${id}/${action}`,
    { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) },
    getToken(id),
  )
}

export const payCase = (id: string) => caseAction(id, 'pay')
export const sendNotice = (id: string) => caseAction(id, 'notice')
export const advanceCase = (id: string) => caseAction(id, 'advance')
export const acceptOffer = (id: string) => caseAction(id, 'accept')
export const setLedgerConsent = (id: string, consent: boolean) =>
  caseAction(id, 'ledger', { consent })

// ---------------------------------------------------------------------------
// Pure display helpers
// ---------------------------------------------------------------------------

const NOTICE_HEADINGS: Record<GroundId, string> = {
  defective_goods: 'NOTICE OF DEFECT IN GOODS',
  deficient_service: 'NOTICE OF DEFICIENCY IN SERVICE',
  unfair_trade_practice: 'NOTICE OF UNFAIR TRADE PRACTICE',
  overcharging: 'NOTICE OF OVERCHARGING IN EXCESS OF DECLARED PRICE',
  spurious_goods: 'NOTICE REGARDING SALE OF SPURIOUS GOODS',
  hazardous_goods: 'NOTICE REGARDING SALE OF HAZARDOUS GOODS',
  misleading_ad: 'NOTICE REGARDING MISLEADING ADVERTISEMENT',
}

export function noticeHeading(ground: GroundId | null): string {
  return ground ? NOTICE_HEADINGS[ground] : 'NOTICE UNDER THE CONSUMER PROTECTION ACT, 2019'
}

export function noticeRef(caseId: string): string {
  const [, year, seq] = caseId.split('-')
  return `REF/CX/${year}/${seq}`
}

export function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`
}

export function fmtDate(
  iso: string | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('en-IN', opts)
}

/**
 * The calendar date a given case-clock day falls on. When the demo clock has
 * been fast-forwarded, the notice is effectively back-dated so that "today"
 * is always the current case-clock day.
 */
export function caseClockDate(view: CaseView, dayOffsetFromNotice: number): Date {
  const elapsed = view.derived.noticeDaysElapsed
  const d = new Date()
  d.setDate(d.getDate() - (elapsed - dayOffsetFromNotice))
  return d
}

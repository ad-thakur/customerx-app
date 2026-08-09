/**
 * Minimal client for the e-Jagriti (e-jagriti.gov.in) judgement search API.
 *
 * Endpoints (reverse-engineered from the public judgement search page, 2026-08):
 *  - GET  /services/master/master/v2/getCaseCategory
 *      → master list of case categories, e.g. { case_category_id: 19, case_category_name_en: "DEFECTIVE GOODS" }
 *  - POST /services/case/caseFilingService/v2/getCaseDetailsBySearchType
 *      → paginated case search. Body fields:
 *          commissionId     11000000 = NCDRC (state/district commissions use different ids)
 *          serchType        [sic] 1 case no, 2 complainant, 3 respondent, 4/5 advocates,
 *                           6 case category ("industry type" in the UI), 7 judge,
 *                           8 free text (matches party/advocate names only)
 *          serchTypeValue   value for the chosen search type (category id as string for serchType 6)
 *          dateRequestType  1 = case filing date, 2 = case disposal date
 *          orderType        1 = daily order, 2 = judgement
 *          fromDate/toDate  YYYY-MM-DD
 *          page/size        zero-based page, page size
 *
 * Notes:
 *  - No captcha token is required for direct POSTs; the captcha only gates the web UI.
 *  - Responses embed the full judgment PDF as base64 (judgmentOrderDocumentBase64) and can
 *    take 20-40 seconds and run to several MB — keep page sizes small and throttle politely.
 *  - Judgments are public documents (Copyright Act 1957, s.52(1)(q)); ingest respectfully.
 */

const BASE = 'https://e-jagriti.gov.in'

export const COMMISSION_NCDRC = 11000000

export interface EJagritiCaseCategory {
  case_category_id: number
  case_category_name_en: string
}

export interface EJagritiCaseRecord {
  caseNumber: string
  complainantName: string | null
  complainantAdvocateName: string | null
  respondentName: string | null
  respondentAdvocateName: string | null
  caseFilingDate: string | null
  dateOfDisposal: string | null
  caseStageName: string | null
  judgemtmentDate: string | null // [sic] — field name as returned by the API
  dateOfHearing: string | null
  orderAvailabilityStatusId: number | null
  filingReferenceNumber: number | null
  /** Base64-encoded judgment PDF (can be multiple MB). */
  judgmentOrderDocumentBase64: string | null
  additionalComplainantList: Array<{ additional_respondent_name: string }> | null
  additionalRespondantList: Array<{ additional_respondent_name: string }> | null
}

interface EJagritiEnvelope<T> {
  message: string
  status: number
  error: string
  data: T
}

const HEADERS = {
  'Content-Type': 'application/json',
  // Be a good citizen: identify ourselves.
  'User-Agent': 'ConsumerX-ingest/0.1 (precedent research; contact: adnaan@thakur.com)',
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...HEADERS, ...init?.headers } })
  if (!res.ok) {
    throw new Error(`e-Jagriti request failed: ${res.status} ${res.statusText} (${path})`)
  }
  const body = (await res.json()) as EJagritiEnvelope<T>
  if (body.error && body.error !== 'false') {
    throw new Error(`e-Jagriti API error on ${path}: ${body.message}`)
  }
  return body.data
}

export async function fetchCaseCategories(): Promise<EJagritiCaseCategory[]> {
  return getJson<EJagritiCaseCategory[]>('/services/master/master/v2/getCaseCategory')
}

/**
 * Resolves a category name to its id.
 *
 * The master list contains duplicate names under different ids (e.g.
 * "MISLEADING ADVERTISEMENTS" is both 473 and 1125), so this warns when a
 * lookup is ambiguous. Pass `preferId` — from the mapping in categories.ts —
 * to pick deliberately instead of taking whichever the API returned first.
 */
export async function resolveCategoryId(name: string, preferId?: number): Promise<number> {
  const categories = await fetchCaseCategories()
  const wanted = name.trim().toLowerCase()
  const matches = categories.filter((c) => c.case_category_name_en?.trim().toLowerCase() === wanted)

  if (matches.length === 0) {
    const near = categories
      .filter((c) => c.case_category_name_en?.toLowerCase().includes(wanted.split(/\s+/)[0] ?? ''))
      .slice(0, 10)
      .map((c) => `${c.case_category_id} ${c.case_category_name_en}`)
    throw new Error(
      `Case category "${name}" not found.${
        near.length ? ` Did you mean: ${near.join(' | ')}` : ' Run with --list-categories to browse.'
      }`,
    )
  }

  if (preferId !== undefined) {
    const pinned = matches.find((c) => c.case_category_id === preferId)
    if (pinned) return pinned.case_category_id
    console.warn(
      `  ! category "${name}" no longer has id ${preferId}; using ${matches[0].case_category_id} instead`,
    )
  } else if (matches.length > 1) {
    console.warn(
      `  ! "${name}" is ambiguous — ids ${matches.map((c) => c.case_category_id).join(', ')}. ` +
        `Using ${matches[0].case_category_id}. Pin one in categories.ts to be sure.`,
    )
  }

  return matches[0].case_category_id
}

/** Categories whose name contains `query` (case-insensitive). Empty query returns all. */
export async function findCategories(query = ''): Promise<EJagritiCaseCategory[]> {
  const categories = await fetchCaseCategories()
  const q = query.trim().toLowerCase()
  if (!q) return categories
  return categories.filter((c) => c.case_category_name_en?.toLowerCase().includes(q))
}

export interface SearchPageOptions {
  commissionId: number
  categoryId: number
  fromDate: string // YYYY-MM-DD
  toDate: string // YYYY-MM-DD
  page: number
  size: number
  /** 1 = filing date, 2 = disposal date (default). */
  dateRequestType?: 1 | 2
  /** 1 = daily order, 2 = judgement (default). */
  orderType?: 1 | 2
}

export async function searchCasesByCategory(opts: SearchPageOptions): Promise<EJagritiCaseRecord[]> {
  return getJson<EJagritiCaseRecord[]>('/services/case/caseFilingService/v2/getCaseDetailsBySearchType', {
    method: 'POST',
    body: JSON.stringify({
      commissionId: opts.commissionId,
      page: opts.page,
      size: opts.size,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      dateRequestType: opts.dateRequestType ?? 2,
      serchType: 6,
      serchTypeValue: String(opts.categoryId),
      orderType: opts.orderType ?? 2,
    }),
  })
}

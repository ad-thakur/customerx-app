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

/* -------------------------------------------------------------------------- */
/* Commissions                                                                */
/*                                                                            */
/* NCDRC (11000000) is one commission among ~750. Most consumer litigation is  */
/* decided at District Commissions, with State Commissions hearing appeals —   */
/* so the narrow goods categories that look empty at NCDRC are not empty in    */
/* the system, they are simply decided lower down.                             */
/*                                                                            */
/* Both endpoints are GET and undocumented, found alongside the judgement      */
/* search. Ids are structured: 11070000 is Delhi State, 11070077-11070085 are  */
/* its District Commissions.                                                   */
/* -------------------------------------------------------------------------- */

export interface EJagritiCommission {
  commissionId: number
  commissionNameEn: string
  /** True for circuit and regional benches rather than a principal seat. */
  circuitAdditionBenchStatus: boolean
  activeStatus: boolean
}

/** All State Commissions, circuit benches and regional benches. */
export async function fetchStateCommissions(): Promise<EJagritiCommission[]> {
  return getJson<EJagritiCommission[]>('/services/report/report/getStateCommissionAndCircuitBench')
}

/** District Commissions sitting under a given State Commission id. */
export async function fetchDistrictCommissions(
  stateCommissionId: number,
): Promise<EJagritiCommission[]> {
  return getJson<EJagritiCommission[]>(
    `/services/report/report/getDistrictCommissionByCommissionId?commissionId=${stateCommissionId}`,
  )
}

/**
 * Resolves a commission by name. "NCDRC" is recognised directly since it is not
 * in the state list. Matching is case-insensitive and accepts a unique partial,
 * so "karna" finds KARNATAKA but an ambiguous fragment is rejected rather than
 * guessed at.
 */
export async function resolveCommission(
  name: string,
): Promise<{ id: number; label: string }> {
  const wanted = name.trim().toLowerCase()
  if (wanted === 'ncdrc' || wanted === 'national') {
    return { id: COMMISSION_NCDRC, label: 'NCDRC' }
  }

  const states = await fetchStateCommissions()
  const exact = states.find((c) => c.commissionNameEn.trim().toLowerCase() === wanted)
  if (exact) return { id: exact.commissionId, label: exact.commissionNameEn.trim() }

  const partial = states.filter((c) => c.commissionNameEn.toLowerCase().includes(wanted))
  if (partial.length === 1) {
    return { id: partial[0].commissionId, label: partial[0].commissionNameEn.trim() }
  }
  if (partial.length > 1) {
    throw new Error(
      `Commission "${name}" is ambiguous: ${partial.map((c) => c.commissionNameEn.trim()).join(' | ')}`,
    )
  }
  throw new Error(
    `Commission "${name}" not found. Run with --list-commissions to see the ${states.length} available.`,
  )
}

/** Builds an id → display-name map covering NCDRC, states and their districts. */
export async function commissionNames(
  includeDistricts = false,
): Promise<Map<number, string>> {
  const map = new Map<number, string>([[COMMISSION_NCDRC, 'NCDRC']])
  const states = await fetchStateCommissions()
  for (const s of states) map.set(s.commissionId, s.commissionNameEn.trim())

  if (includeDistricts) {
    for (const s of states) {
      try {
        for (const d of await fetchDistrictCommissions(s.commissionId)) {
          map.set(d.commissionId, `${d.commissionNameEn.trim()} (${s.commissionNameEn.trim()})`)
        }
      } catch {
        // A state with no district list shouldn't abort the whole lookup.
      }
    }
  }
  return map
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

/* -------------------------------------------------------------------------- */
/* Counting                                                                   */
/* -------------------------------------------------------------------------- */

export interface CategoryCount {
  /** Exact number of judgements, or `atLeast` when the search ran out of pages. */
  total: number
  /** Requests spent finding it — useful for budgeting a survey across commissions. */
  requests: number
  /** True when the count hit the search ceiling rather than the end of the data. */
  capped: boolean
}

/**
 * Counts judgements for a category without downloading them all.
 *
 * The obvious approach — page until a page comes back short — costs one request
 * per page, and every response embeds full base64 PDFs, so surveying a category
 * with 900 cases would mean 90 multi-megabyte requests taking 20-40s each.
 *
 * Instead this probes exponentially for a page that comes back empty, then
 * binary-searches between the last known non-empty page and that one. A
 * category of any size settles in roughly 2*log2(pages) requests — about a
 * dozen — which makes surveying every category across several commissions
 * affordable, and is far gentler on a government service.
 *
 * Assumes dense pagination: every page before the last is full. That holds for
 * offset pagination and matches what the API returns.
 */
export async function countCasesByCategory(
  opts: Omit<SearchPageOptions, 'page'> & { maxPages?: number },
): Promise<CategoryCount> {
  const { size, maxPages = 4096 } = opts
  let requests = 0

  const pageCount = async (page: number): Promise<number> => {
    requests++
    const records = await searchCasesByCategory({ ...opts, page })
    return records.length
  }

  // Page 0 empty means the category has nothing in this window.
  const first = await pageCount(0)
  if (first === 0) return { total: 0, requests, capped: false }
  if (first < size) return { total: first, requests, capped: false }

  // Exponential probe for an empty page: 1, 2, 4, 8 …
  let lastFull = 0
  let firstEmpty = -1
  for (let page = 1; page <= maxPages; page *= 2) {
    const n = await pageCount(page)
    if (n === 0) {
      firstEmpty = page
      break
    }
    lastFull = page
    // A short page is the final one — count is exact, stop here.
    if (n < size) return { total: page * size + n, requests, capped: false }
  }

  if (firstEmpty === -1) {
    // Never found an empty page within maxPages.
    return { total: (lastFull + 1) * size, requests, capped: true }
  }

  // Binary search the boundary between the last full page and the first empty one.
  let lo = lastFull
  let hi = firstEmpty
  let tailCount = 0
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    const n = await pageCount(mid)
    if (n === 0) {
      hi = mid
    } else {
      lo = mid
      tailCount = n
      if (n < size) break
    }
  }

  return { total: lo * size + (tailCount || size), requests, capped: false }
}

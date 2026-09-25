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

/** Abandon a single request that stalls: e-Jagriti can hold a connection open forever. */
const REQUEST_TIMEOUT_MS = 180_000

/** Backoff waits before each retry. Length also sets the number of retries. */
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A non-2xx HTTP response. `status` lets the retry logic tell 5xx from 4xx. */
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** An error carried in the response body (HTTP 200 but `error` set). Never retried. */
class EJagritiApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EJagritiApiError'
  }
}

/**
 * Retry only transient failures:
 *  - 5xx responses (server-side, likely to clear)
 *  - network failures and request timeouts (fetch throws TypeError / an
 *    AbortSignal.timeout DOMException — neither is one of our own error types)
 * Never retry a 4xx (our request is wrong) or an e-Jagriti body error.
 */
function isRetryable(err: unknown): boolean {
  if (err instanceof EJagritiApiError) return false
  if (err instanceof HttpError) return err.status >= 500 && err.status < 600
  return true
}

async function getJsonOnce<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { ...HEADERS, ...init?.headers },
  })
  if (!res.ok) {
    throw new HttpError(res.status, `e-Jagriti request failed: ${res.status} ${res.statusText} (${path})`)
  }
  const body = (await res.json()) as EJagritiEnvelope<T>
  if (body.error && body.error !== 'false') {
    throw new EJagritiApiError(`e-Jagriti API error on ${path}: ${body.message}`)
  }
  return body.data
}

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getJsonOnce<T>(path, init)
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(err)) throw err
      const wait = RETRY_DELAYS_MS[attempt]
      console.warn(
        `  ! ${path} failed (${(err as Error).message}); retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${wait / 1000}s`,
      )
      await sleep(wait)
    }
  }
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
  return search({
    commissionId: opts.commissionId,
    page: opts.page,
    size: opts.size,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    dateRequestType: opts.dateRequestType ?? 2,
    serchType: 6,
    serchTypeValue: String(opts.categoryId),
    orderType: opts.orderType ?? 2,
  })
}

function search(body: Record<string, unknown>): Promise<EJagritiCaseRecord[]> {
  return getJson<EJagritiCaseRecord[]>('/services/case/caseFilingService/v2/getCaseDetailsBySearchType', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

/**
 * Every judgement a commission delivered in a disposal window, regardless of
 * category. A free-text search (serchType 8) with an empty value matches all
 * cases — it is the only way to reach the ~10% of district cases that carry no
 * category at all, which a category-by-category ingest never sees.
 */
export async function searchAllJudgments(opts: {
  commissionId: number
  fromDate: string
  toDate: string
  page: number
  size: number
}): Promise<EJagritiCaseRecord[]> {
  return search({ ...opts, dateRequestType: 2, serchType: 8, serchTypeValue: '', orderType: 2 })
}

/**
 * Case numbers filed under a category, cheaply. orderType 1 (daily orders)
 * returns the same case metadata as a judgement search but without the embedded
 * order document, so a page of 100 costs tens of KB rather than tens of MB. Its
 * result set is a superset of the judgements in the window (it also lists cases
 * that only have daily orders), which makes it suitable for a case → category
 * lookup but not as a list of judgements.
 */
export async function listCaseNumbersInCategory(opts: {
  commissionId: number
  categoryId: number
  fromDate: string
  toDate: string
}): Promise<string[]> {
  const size = 100
  const out: string[] = []
  for (let page = 0; ; page++) {
    const rows = await search({
      commissionId: opts.commissionId,
      page,
      size,
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      dateRequestType: 2,
      serchType: 6,
      serchTypeValue: String(opts.categoryId),
      orderType: 1,
    })
    for (const r of rows) out.push(r.caseNumber)
    if (rows.length < size) return out
  }
}

/**
 * Fetch a single case by its full case number (serchType 1). Used as a second
 * chance at the order text: the same case fetched by number sometimes returns an
 * HTML order where the listing returned an unparseable PDF.
 */
export async function searchCaseByNumber(opts: {
  caseNumber: string
  commissionId: number
  fromDate: string
  toDate: string
}): Promise<EJagritiCaseRecord[]> {
  return search({
    commissionId: opts.commissionId,
    page: 0,
    size: 5,
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    dateRequestType: 2,
    serchType: 1,
    serchTypeValue: opts.caseNumber,
    orderType: 2,
  })
}

/* -------------------------------------------------------------------------- */
/* Commissions                                                                */
/*                                                                            */
/* NCDRC (11000000) is one commission among ~750. Ids are structured by state: */
/* 11270000 is the Maharashtra State Commission, 33270000 / 22270000 … are its */
/* circuit and regional benches (same trailing digits), and 11270466 … are its */
/* District Commissions. Benches hold their own cases — the principal seat's   */
/* search does not include them.                                              */
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

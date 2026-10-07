// ---------------------------------------------------------------------------
// Persistence for the brand side of the platform.
//
// A brand signs in with the same magic-link accounts consumers use; access is
// by membership (brand_members), keyed by email so a brand can be granted to
// someone before they have ever signed in.
//
// Complaints reach a brand by four routes, recorded in `source`:
//   web     — the brand's own website form posts to /api/intake/:key
//   email   — the brand forwards its complaints inbox to our inbound webhook
//   hosted  — the consumer uses our hosted form at /complain/:slug
//   manual  — someone on the brand's team pastes a complaint into the dashboard
//   social  — a public post on X or Reddit, converted from the Social tab
//
// Each complaint carries a consumer token. The brand's first response includes
// a tracking link built from it, which is how the consumer sees replies, adds
// details and accepts or declines an offer without needing an account.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import pg from 'pg'
import type { ComplaintAnalysis } from './brandAnalysis.js'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export type ComplaintSource = 'web' | 'email' | 'hosted' | 'manual' | 'social'

export type ComplaintStatus =
  | 'new' // received, not yet answered
  | 'responded' // brand has replied; waiting on the consumer
  | 'consumer_replied' // consumer has written back or added details
  | 'resolved' // consumer accepted an offer, or brand closed it as resolved
  | 'escalated' // consumer declined and has said they will take it further
  | 'closed' // closed without resolution (duplicate, spam, withdrawn)

export type OfferKind = 'refund' | 'replacement' | 'repair' | 'service' | 'gift_card' | 'promo' | 'partial_refund'

export interface Offer {
  kind: OfferKind
  /** Face value to the consumer, in rupees. */
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
  /** Brand-side author email; never shown to the consumer. */
  author?: string
}

export interface Brand {
  id: string
  name: string
  slug: string
  /** Names this brand appears under as a respondent, for precedent history. */
  aliases: string[]
  /** Gross margin, 0–1. Turns a gift card's face value into its real cost. */
  grossMargin: number
  /** Public key for the website form; safe to embed in a page. */
  intakeKey: string
  /** Social listening add-on (X and Reddit mentions), billed separately. */
  socialEnabled: boolean
  createdAt: string
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
}

export async function initBrandTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      aliases TEXT[] NOT NULL DEFAULT '{}',
      gross_margin REAL NOT NULL DEFAULT 0.4,
      intake_key TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS social_enabled BOOLEAN NOT NULL DEFAULT false`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brand_members (
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand_id, email)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS brand_members_email_idx ON brand_members (email)`)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS brand_complaints (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      consumer_name TEXT NOT NULL DEFAULT '',
      consumer_email TEXT NOT NULL DEFAULT '',
      consumer_phone TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      order_ref TEXT NOT NULL DEFAULT '',
      product TEXT NOT NULL DEFAULT '',
      amount_claimed NUMERIC,
      purchase_date DATE,
      analysis JSONB,
      analyzed_at TIMESTAMPTZ,
      thread JSONB NOT NULL DEFAULT '[]',
      offer JSONB,
      first_response_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      consumer_token TEXT NOT NULL
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS brand_complaints_brand_idx ON brand_complaints (brand_id, received_at DESC)`,
  )
}

/* -------------------------------------------------------------------------- */
/* Brands                                                                     */
/* -------------------------------------------------------------------------- */

interface BrandRow {
  id: string
  name: string
  slug: string
  aliases: string[]
  gross_margin: number
  intake_key: string
  social_enabled: boolean
  created_at: Date
}

function toBrand(r: BrandRow): Brand {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    aliases: r.aliases,
    grossMargin: Number(r.gross_margin),
    intakeKey: r.intake_key,
    socialEnabled: r.social_enabled,
    createdAt: r.created_at.toISOString(),
  }
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'brand'
  )
}

export async function createBrand(input: {
  name: string
  aliases: string[]
  grossMargin: number
  ownerEmail: string
}): Promise<Brand> {
  const id = crypto.randomUUID()
  let slug = slugify(input.name)
  // Keep slugs unique without asking the brand to pick one.
  const taken = await pool.query(`SELECT 1 FROM brands WHERE slug = $1`, [slug])
  if (taken.rows.length) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`
  const intakeKey = `pk_${crypto.randomBytes(12).toString('hex')}`
  const res = await pool.query<BrandRow>(
    `INSERT INTO brands (id, name, slug, aliases, gross_margin, intake_key)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, input.name, slug, input.aliases, input.grossMargin, intakeKey],
  )
  await pool.query(`INSERT INTO brand_members (brand_id, email) VALUES ($1, $2)`, [
    id,
    input.ownerEmail,
  ])
  return toBrand(res.rows[0])
}

export async function updateBrand(
  id: string,
  patch: { name?: string; aliases?: string[]; grossMargin?: number; socialEnabled?: boolean },
): Promise<Brand | null> {
  const res = await pool.query<BrandRow>(
    `UPDATE brands SET
       name = COALESCE($2, name),
       aliases = COALESCE($3, aliases),
       gross_margin = COALESCE($4, gross_margin),
       social_enabled = COALESCE($5, social_enabled)
     WHERE id = $1 RETURNING *`,
    [id, patch.name ?? null, patch.aliases ?? null, patch.grossMargin ?? null, patch.socialEnabled ?? null],
  )
  return res.rows.length ? toBrand(res.rows[0]) : null
}

export async function brandsForEmail(email: string): Promise<Brand[]> {
  const res = await pool.query<BrandRow>(
    `SELECT b.* FROM brands b JOIN brand_members m ON m.brand_id = b.id
      WHERE m.email = $1 ORDER BY b.created_at`,
    [email],
  )
  return res.rows.map(toBrand)
}

export async function isBrandMember(brandId: string, email: string): Promise<boolean> {
  const res = await pool.query(`SELECT 1 FROM brand_members WHERE brand_id = $1 AND email = $2`, [
    brandId,
    email,
  ])
  return res.rows.length > 0
}

export async function findBrand(id: string): Promise<Brand | null> {
  const res = await pool.query<BrandRow>(`SELECT * FROM brands WHERE id = $1`, [id])
  return res.rows.length ? toBrand(res.rows[0]) : null
}

export async function brandByKey(key: string): Promise<Brand | null> {
  const res = await pool.query<BrandRow>(`SELECT * FROM brands WHERE intake_key = $1`, [key])
  return res.rows.length ? toBrand(res.rows[0]) : null
}

export async function brandBySlug(slug: string): Promise<Brand | null> {
  const res = await pool.query<BrandRow>(`SELECT * FROM brands WHERE slug = $1`, [slug])
  return res.rows.length ? toBrand(res.rows[0]) : null
}

export async function listMembers(brandId: string): Promise<{ email: string; role: string }[]> {
  const res = await pool.query<{ email: string; role: string }>(
    `SELECT email, role FROM brand_members WHERE brand_id = $1 ORDER BY added_at`,
    [brandId],
  )
  return res.rows
}

export async function addMember(brandId: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO brand_members (brand_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [brandId, email],
  )
}

/* -------------------------------------------------------------------------- */
/* Complaints                                                                 */
/* -------------------------------------------------------------------------- */

interface ComplaintRow {
  id: string
  brand_id: string
  source: ComplaintSource
  status: ComplaintStatus
  received_at: Date
  updated_at: Date
  consumer_name: string
  consumer_email: string
  consumer_phone: string
  subject: string
  body: string
  order_ref: string
  product: string
  amount_claimed: string | null
  purchase_date: Date | null
  analysis: ComplaintAnalysis | null
  analyzed_at: Date | null
  thread: ThreadEntry[]
  offer: Offer | null
  first_response_at: Date | null
  resolved_at: Date | null
  consumer_token: string
}

function toComplaint(r: ComplaintRow): Complaint {
  return {
    id: r.id,
    brandId: r.brand_id,
    source: r.source,
    status: r.status,
    receivedAt: r.received_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    consumerName: r.consumer_name,
    consumerEmail: r.consumer_email,
    consumerPhone: r.consumer_phone,
    subject: r.subject,
    body: r.body,
    orderRef: r.order_ref,
    product: r.product,
    amountClaimed: r.amount_claimed === null ? null : Number(r.amount_claimed),
    purchaseDate: r.purchase_date ? r.purchase_date.toISOString().slice(0, 10) : null,
    analysis: r.analysis,
    analyzedAt: r.analyzed_at?.toISOString() ?? null,
    thread: r.thread ?? [],
    offer: r.offer,
    firstResponseAt: r.first_response_at?.toISOString() ?? null,
    resolvedAt: r.resolved_at?.toISOString() ?? null,
  }
}

export interface NewComplaint {
  source: ComplaintSource
  consumerName: string
  consumerEmail: string
  consumerPhone: string
  subject: string
  body: string
  orderRef: string
  product: string
  amountClaimed: number | null
  purchaseDate: string | null
  /** Backdating, used only by the demo seed so the queue looks lived-in. */
  receivedAt?: string
}

export async function insertComplaint(
  brandId: string,
  c: NewComplaint,
): Promise<{ complaint: Complaint; consumerToken: string }> {
  const year = new Date().getFullYear()
  const id = `BC-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const token = crypto.randomBytes(24).toString('hex')
  const res = await pool.query<ComplaintRow>(
    `INSERT INTO brand_complaints (
       id, brand_id, source, consumer_name, consumer_email, consumer_phone,
       subject, body, order_ref, product, amount_claimed, purchase_date,
       consumer_token, received_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               COALESCE($14::timestamptz, now()), COALESCE($14::timestamptz, now()))
     RETURNING *`,
    [
      id,
      brandId,
      c.source,
      c.consumerName,
      c.consumerEmail,
      c.consumerPhone,
      c.subject,
      c.body,
      c.orderRef,
      c.product,
      c.amountClaimed,
      c.purchaseDate,
      token,
      c.receivedAt ?? null,
    ],
  )
  return { complaint: toComplaint(res.rows[0]), consumerToken: token }
}

export async function listComplaints(brandId: string): Promise<Complaint[]> {
  const res = await pool.query<ComplaintRow>(
    `SELECT * FROM brand_complaints WHERE brand_id = $1 ORDER BY received_at DESC LIMIT 500`,
    [brandId],
  )
  return res.rows.map(toComplaint)
}

export async function findComplaint(
  id: string,
): Promise<{ complaint: Complaint; consumerToken: string } | null> {
  const res = await pool.query<ComplaintRow>(`SELECT * FROM brand_complaints WHERE id = $1`, [id])
  if (!res.rows.length) return null
  return { complaint: toComplaint(res.rows[0]), consumerToken: res.rows[0].consumer_token }
}

export async function patchComplaint(
  id: string,
  patch: Partial<{
    status: ComplaintStatus
    analysis: ComplaintAnalysis
    thread: ThreadEntry[]
    offer: Offer | null
    firstResponseAt: string
    resolvedAt: string | null
    body: string
    orderRef: string
    product: string
    amountClaimed: number | null
    purchaseDate: string | null
  }>,
): Promise<Complaint | null> {
  const cols: Record<string, unknown> = {}
  if (patch.status !== undefined) cols.status = patch.status
  if (patch.analysis !== undefined) {
    cols.analysis = JSON.stringify(patch.analysis)
    cols.analyzed_at = new Date().toISOString()
  }
  if (patch.thread !== undefined) cols.thread = JSON.stringify(patch.thread)
  if (patch.offer !== undefined) cols.offer = patch.offer === null ? null : JSON.stringify(patch.offer)
  if (patch.firstResponseAt !== undefined) cols.first_response_at = patch.firstResponseAt
  if (patch.resolvedAt !== undefined) cols.resolved_at = patch.resolvedAt
  if (patch.body !== undefined) cols.body = patch.body
  if (patch.orderRef !== undefined) cols.order_ref = patch.orderRef
  if (patch.product !== undefined) cols.product = patch.product
  if (patch.amountClaimed !== undefined) cols.amount_claimed = patch.amountClaimed
  if (patch.purchaseDate !== undefined) cols.purchase_date = patch.purchaseDate

  const keys = Object.keys(cols)
  const sets = keys.map((k, i) => `${k} = $${i + 2}`)
  sets.push('updated_at = now()')
  const res = await pool.query<ComplaintRow>(
    `UPDATE brand_complaints SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [id, ...keys.map((k) => cols[k])],
  )
  return res.rows.length ? toComplaint(res.rows[0]) : null
}

/* -------------------------------------------------------------------------- */
/* Precedent history against the brand itself                                 */
/* -------------------------------------------------------------------------- */

export interface BrandHistoryRow {
  caseNumber: string
  complainant: string | null
  respondent: string | null
  outcome: string | null
  category: string
  judgmentDate: Date | string | null
  /** Last ~1,500 chars of the judgment — where the operative order sits. */
  tail: string | null
}

/**
 * Every ingested judgment in which the brand (under any of its names) was a
 * party. Matching is a case-insensitive substring on the respondent and
 * complainant fields — appeals put the company in either seat.
 *
 * Aliases shorter than four characters are ignored: "LG" or "HP" would match
 * half the corpus as substrings.
 */
export async function brandPrecedentHistory(aliases: string[], limit = 400): Promise<BrandHistoryRow[]> {
  const patterns = aliases
    .map((a) => a.trim())
    .filter((a) => a.length >= 4)
    .map((a) => `%${a.replace(/[%_\\]/g, (m) => `\\${m}`)}%`)
  if (patterns.length === 0) return []
  const res = await pool.query<BrandHistoryRow>(
    `SELECT case_number AS "caseNumber", complainant, respondent, outcome, category,
            judgment_date AS "judgmentDate",
            right(coalesce(judgment_text, ''), 1500) AS tail
       FROM precedent_cases
      WHERE respondent ILIKE ANY($1::text[]) OR complainant ILIKE ANY($1::text[])
      ORDER BY judgment_date DESC NULLS LAST
      LIMIT $2`,
    [patterns, limit],
  )
  return res.rows
}

/** Operative-order tails for a set of case numbers (outcome inference). */
export async function precedentTails(caseNumbers: string[]): Promise<Map<string, string>> {
  if (caseNumbers.length === 0) return new Map()
  const res = await pool.query<{ case_number: string; tail: string }>(
    `SELECT case_number, right(coalesce(judgment_text, ''), 1500) AS tail
       FROM precedent_cases WHERE case_number = ANY($1::text[])`,
    [caseNumbers],
  )
  return new Map(res.rows.map((r) => [r.case_number, r.tail]))
}

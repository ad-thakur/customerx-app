// ---------------------------------------------------------------------------
// HTTP routes for the brand side.
//
//   /api/brand/...   the brand dashboard (signed-in brand members only)
//   /api/intake/...  the ways complaints arrive (website form, hosted form,
//                    inbound email webhook)
//   /api/track/...   the consumer's tracking link, authorised by the
//                    complaint's consumer token, the same way consumer cases
//                    are authorised by their case token
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import express from 'express'
import { userForSession, normaliseEmail } from './auth.js'
import { analyseComplaint, extractFactsByRules, type ComplaintAnalysis } from './brandAnalysis.js'
import { analysisLimit, isAdmin, PLANS, planFor, tokenCostUsd } from './plans.js'
import { extractFacts, newMeter, templateResponse, writeNarrative, type ResponseMode } from './brandAi.js'
import { demoComplaints } from './brandDemo.js'
import { reviewPrecedents } from './brandReview.js'
import {
  addMember,
  addUsageTokens,
  claimAnalysis,
  setBilling,
  usageThisMonth,
  brandByKey,
  brandBySlug,
  brandsForEmail,
  createBrand,
  findBrand,
  findComplaint,
  insertComplaint,
  isBrandMember,
  listComplaints,
  listMembers,
  patchComplaint,
  updateBrand,
  type Brand,
  type Complaint,
  type ComplaintStatus,
  type NewComplaint,
  type Offer,
  type OfferKind,
  type ThreadEntry,
} from './brandStore.js'

export const brandRouter = express.Router()

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function frontendBase(): string {
  return ((process.env.FRONTEND_ORIGIN ?? '').split(',')[0].trim() || 'http://localhost:5173').replace(/\/$/, '')
}

export function trackUrl(id: string, token: string): string {
  return `${frontendBase()}/track/${id}?t=${token}`
}

export function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[₹,\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function isoDate(v: unknown): string | null {
  const s = str(v, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function newComplaintFrom(body: Record<string, unknown>, source: NewComplaint['source']): NewComplaint | null {
  const text = str(body.body ?? body.message ?? body.text, 10_000)
  if (text.length < 10) return null
  return {
    source,
    consumerName: str(body.name ?? body.consumerName, 120),
    consumerEmail: normaliseEmail(str(body.email ?? body.consumerEmail, 254)) ?? '',
    consumerPhone: str(body.phone ?? body.consumerPhone, 30),
    subject: str(body.subject, 200),
    body: text,
    orderRef: str(body.orderRef ?? body.orderId, 80),
    product: str(body.product, 120),
    amountClaimed: amount(body.amount ?? body.amountClaimed),
    purchaseDate: isoDate(body.purchaseDate),
  }
}

/** Resolves the signed-in brand member, or answers 401/403 itself. */
export async function requireMember(
  req: express.Request,
  res: express.Response,
): Promise<{ email: string; brand: Brand } | null> {
  const header = req.headers.authorization
  const user = await userForSession(header?.startsWith('Bearer ') ? header.slice(7).trim() : null)
  if (!user) {
    res.status(401).json({ error: 'Please sign in' })
    return null
  }
  const brand = await findBrand(String(req.params.brandId))
  if (!brand || !(await isBrandMember(brand.id, user.email))) {
    res.status(403).json({ error: 'You do not have access to this brand' })
    return null
  }
  return { email: user.email, brand }
}

async function memberComplaint(
  req: express.Request,
  res: express.Response,
): Promise<{ email: string; brand: Brand; complaint: Complaint; token: string } | null> {
  const m = await requireMember(req, res)
  if (!m) return null
  const found = await findComplaint(String(req.params.id))
  if (!found || found.complaint.brandId !== m.brand.id) {
    res.status(404).json({ error: 'Complaint not found' })
    return null
  }
  return { ...m, complaint: found.complaint, token: found.consumerToken }
}

/** Facts → numbers → prose. Saved on the complaint; returns the updated row. */
export type AnalysisTrigger = 'added' | 'intake' | 'rerun' | 'consumer_update' | 'demo' | 'social'

/**
 * Facts → numbers → prose, saved on the complaint. The AI steps draw one
 * analysis from the brand's monthly allowance (see plans.ts); when it is used
 * up, the complaint still gets the statistical analysis, without the AI.
 */
export async function runAnalysis(
  complaint: Complaint,
  brand: Brand,
  trigger: AnalysisTrigger,
): Promise<Complaint> {
  const aiOn = Boolean(process.env.ANTHROPIC_API_KEY)
  const usageId = aiOn ? await claimAnalysis(brand.id, analysisLimit(brand), complaint.id, trigger) : null
  const useAi = usageId !== null
  const meter = newMeter()

  const facts = useAi ? await extractFacts(complaint, meter) : extractFactsByRules(complaint)
  const core = await analyseComplaint(complaint, brand, facts)
  const narrative = useAi ? await writeNarrative(complaint, brand, core, meter) : null
  const analysis: ComplaintAnalysis = {
    ...core,
    narrative,
    review: {
      status: !aiOn ? 'disabled' : useAi ? 'pending' : 'limit',
      generatedAt: new Date().toISOString(),
    },
  }
  const saved = (await patchComplaint(complaint.id, { analysis })) ?? complaint
  if (usageId !== null) {
    await addUsageTokens(usageId, meter.input, meter.output)
    // The precedent review takes tens of seconds (it searches and reads
    // judgments), so it runs after the rest of the analysis is saved and
    // attaches itself when done.
    void attachReview(saved, brand, analysis, usageId)
  }
  return saved
}

/** At most a few reviews at once — a demo seed would otherwise start nine. */
const REVIEW_CONCURRENCY = 3
let reviewsRunning = 0
const reviewQueue: (() => void)[] = []

async function withReviewSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (reviewsRunning >= REVIEW_CONCURRENCY) await new Promise<void>((r) => reviewQueue.push(r))
  reviewsRunning++
  try {
    return await fn()
  } finally {
    reviewsRunning--
    reviewQueue.shift()?.()
  }
}

async function attachReview(complaint: Complaint, brand: Brand, analysis: ComplaintAnalysis, usageId: number) {
  const meter = newMeter()
  const review = await withReviewSlot(() => reviewPrecedents(complaint, brand, analysis.facts, meter))
  await addUsageTokens(usageId, meter.input, meter.output).catch(() => {})
  // Don't overwrite a newer analysis (e.g. re-run after the consumer added details).
  const current = await findComplaint(complaint.id)
  if (current?.complaint.analysis?.generatedAt !== analysis.generatedAt) return
  await patchComplaint(complaint.id, { analysis: { ...current.complaint.analysis, review } })
}

/** Fire-and-forget for intake routes, which should answer the sender at once. */
function analyseInBackground(complaint: Complaint, brand: Brand, trigger: AnalysisTrigger) {
  runAnalysis(complaint, brand, trigger).catch((err) =>
    console.error(`[brand] analysis failed for ${complaint.id}:`, (err as Error).message),
  )
}

function systemEntry(text: string): ThreadEntry {
  return { id: crypto.randomUUID(), from: 'system', text, at: new Date().toISOString() }
}

/** A small per-IP limiter for the unauthenticated intake routes. */
const hits = new Map<string, { n: number; reset: number }>()
function rateLimited(req: express.Request, perHour = 20): boolean {
  const key = `${req.ip}:${req.path.split('/').slice(0, 4).join('/')}`
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + 3_600_000 })
    return false
  }
  h.n++
  return h.n > perHour
}

/* -------------------------------------------------------------------------- */
/* Brand accounts                                                             */
/* -------------------------------------------------------------------------- */

brandRouter.get('/api/brand/me', async (req, res) => {
  const header = req.headers.authorization
  const user = await userForSession(header?.startsWith('Bearer ') ? header.slice(7).trim() : null)
  if (!user) {
    res.status(401).json({ error: 'Please sign in' })
    return
  }
  res.json({ brands: await brandsForEmail(user.email) })
})

brandRouter.post('/api/brand', async (req, res) => {
  try {
    const header = req.headers.authorization
    const user = await userForSession(header?.startsWith('Bearer ') ? header.slice(7).trim() : null)
    if (!user) {
      res.status(401).json({ error: 'Please sign in' })
      return
    }
    const body = req.body as Record<string, unknown>
    const name = str(body.name, 80)
    if (name.length < 2) {
      res.status(400).json({ error: 'Brand name is required' })
      return
    }
    const aliases = (Array.isArray(body.aliases) ? body.aliases : [])
      .map((a) => str(a, 80))
      .filter(Boolean)
      .slice(0, 12)
    const margin = Number(body.grossMargin)
    const brand = await createBrand({
      name,
      aliases,
      grossMargin: Number.isFinite(margin) && margin >= 0 && margin < 1 ? margin : 0.4,
      ownerEmail: user.email,
    })
    res.status(201).json(brand)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not create the brand' })
  }
})

brandRouter.patch('/api/brand/:brandId', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    const body = req.body as Record<string, unknown>
    const margin = Number(body.grossMargin)
    const brand = await updateBrand(m.brand.id, {
      name: str(body.name, 80) || undefined,
      aliases: Array.isArray(body.aliases)
        ? body.aliases.map((a) => str(a, 80)).filter(Boolean).slice(0, 12)
        : undefined,
      grossMargin: Number.isFinite(margin) && margin >= 0 && margin < 1 ? margin : undefined,
      socialEnabled: typeof body.socialEnabled === 'boolean' ? body.socialEnabled : undefined,
    })
    res.json(brand)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not update the brand' })
  }
})

brandRouter.get('/api/brand/:brandId/members', async (req, res) => {
  const m = await requireMember(req, res)
  if (!m) return
  res.json(await listMembers(m.brand.id))
})

brandRouter.post('/api/brand/:brandId/members', async (req, res) => {
  const m = await requireMember(req, res)
  if (!m) return
  const email = normaliseEmail(str((req.body as { email?: unknown }).email, 254))
  if (!email) {
    res.status(400).json({ error: 'That doesn’t look like an email address' })
    return
  }
  await addMember(m.brand.id, email)
  res.json(await listMembers(m.brand.id))
})

/* -------------------------------------------------------------------------- */
/* Complaints                                                                 */
/* -------------------------------------------------------------------------- */

/** Queue row: everything the list needs, without the full analysis payload. */
function listView(c: Complaint) {
  const a = c.analysis
  return {
    id: c.id,
    source: c.source,
    status: c.status,
    receivedAt: c.receivedAt,
    updatedAt: c.updatedAt,
    consumerName: c.consumerName,
    subject: c.subject,
    product: a?.facts.product || c.product,
    summary: a?.facts.summary ?? c.body.slice(0, 200),
    amount: a?.exposure.principal ?? c.amountClaimed,
    firstResponseAt: c.firstResponseAt,
    offer: c.offer,
    analysed: Boolean(a),
    consumerWinPct: a?.prediction.consumerWinPct ?? null,
    frivolity: a?.frivolity.label ?? null,
    priority: a?.priority ?? null,
    expectedCost: a?.exposure.expectedCostIfContested ?? null,
    recommended: a?.actions.find((x) => x.recommended)?.title ?? null,
    grounds: a?.facts.grounds ?? [],
  }
}

const OPEN: ComplaintStatus[] = ['new', 'responded', 'consumer_replied']

brandRouter.get('/api/brand/:brandId/complaints', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    const all = await listComplaints(m.brand.id)
    const open = all.filter((c) => OPEN.includes(c.status))
    const responded = all.filter((c) => c.firstResponseAt)
    const avgFirstResponseHours = responded.length
      ? responded.reduce(
          (s, c) => s + (new Date(c.firstResponseAt!).getTime() - new Date(c.receivedAt).getTime()) / 3_600_000,
          0,
        ) / responded.length
      : null
    const closed = all.filter((c) => c.status === 'resolved' || c.status === 'escalated')
    const u = await usageThisMonth(m.brand.id)
    res.json({
      brand: m.brand,
      usage: { used: u.analyses, limit: analysisLimit(m.brand) },
      stats: {
        total: all.length,
        open: open.length,
        unanswered: all.filter((c) => c.status === 'new').length,
        overdue: all.filter(
          (c) => c.status === 'new' && Date.now() - new Date(c.receivedAt).getTime() > 48 * 3_600_000,
        ).length,
        highRisk: open.filter((c) => (c.analysis?.prediction.consumerWinPct ?? 0) >= 60).length,
        openExposure: open.reduce((s, c) => s + (c.analysis?.exposure.expectedCostIfContested ?? 0), 0),
        resolved: all.filter((c) => c.status === 'resolved').length,
        resolutionRate: closed.length ? all.filter((c) => c.status === 'resolved').length / closed.length : null,
        escalated: all.filter((c) => c.status === 'escalated').length,
        avgFirstResponseHours,
        settledValue: all
          .filter((c) => c.status === 'resolved' && c.offer?.status === 'accepted')
          .reduce((s, c) => s + (c.offer?.value ?? 0), 0),
      },
      complaints: all.map(listView),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load complaints' })
  }
})

brandRouter.post('/api/brand/:brandId/complaints', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    const input = newComplaintFrom(req.body as Record<string, unknown>, 'manual')
    if (!input) {
      res.status(400).json({ error: 'Paste the complaint text (at least a sentence)' })
      return
    }
    const { complaint } = await insertComplaint(m.brand.id, input)
    // Manual adds wait for the analysis, so the person sees it immediately.
    const analysed = await runAnalysis(complaint, m.brand, 'added')
    res.status(201).json(analysed)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not add the complaint' })
  }
})

brandRouter.get('/api/brand/:brandId/complaints/:id', async (req, res) => {
  const m = await memberComplaint(req, res)
  if (!m) return
  res.json({ ...m.complaint, trackUrl: trackUrl(m.complaint.id, m.token) })
})

brandRouter.post('/api/brand/:brandId/complaints/:id/analyse', async (req, res) => {
  try {
    const m = await memberComplaint(req, res)
    if (!m) return
    const updated = await runAnalysis(m.complaint, m.brand, 'rerun')
    res.json({ ...updated, trackUrl: trackUrl(updated.id, m.token) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not analyse the complaint' })
  }
})

/** A first-response draft for a chosen action. Writes nothing. */
brandRouter.post('/api/brand/:brandId/complaints/:id/draft', async (req, res) => {
  const m = await memberComplaint(req, res)
  if (!m) return
  const actionId = str((req.body as { actionId?: unknown }).actionId, 40)
  const action = m.complaint.analysis?.actions.find((a) => a.id === actionId)
  const kind = action?.kind
  const offer =
    kind && kind !== 'contest' && kind !== 'request_info' && kind !== 'decline' && kind !== 'advise'
      ? { kind, value: action.faceValue }
      : null
  const mode: ResponseMode = offer
    ? 'offer'
    : kind === 'request_info' || kind === 'decline' || kind === 'advise'
      ? kind
      : 'plain'
  res.json({
    text: templateResponse(m.complaint, m.brand, trackUrl(m.complaint.id, m.token), offer, mode),
    offer,
  })
})

const OFFER_KINDS: OfferKind[] = ['refund', 'replacement', 'repair', 'service', 'gift_card', 'promo', 'partial_refund']

/**
 * Records the brand's reply (and optional offer) on the thread. Delivery to
 * the consumer is by the email the brand sends from its own helpdesk — this
 * returns the text and the tracking link for that; the tracking page shows
 * the reply either way.
 */
brandRouter.post('/api/brand/:brandId/complaints/:id/respond', async (req, res) => {
  try {
    const m = await memberComplaint(req, res)
    if (!m) return
    if (m.complaint.status === 'resolved' || m.complaint.status === 'closed') {
      res.status(409).json({ error: 'This complaint is already closed' })
      return
    }
    const body = req.body as { text?: unknown; offer?: { kind?: unknown; value?: unknown; note?: unknown } }
    const text = str(body.text, 8000)
    if (!text) {
      res.status(400).json({ error: 'Write a response first' })
      return
    }
    const now = new Date().toISOString()
    let offer: Offer | null = null
    if (body.offer && OFFER_KINDS.includes(body.offer.kind as OfferKind)) {
      offer = {
        kind: body.offer.kind as OfferKind,
        value: amount(body.offer.value) ?? 0,
        note: str(body.offer.note, 500),
        status: 'pending',
        madeAt: now,
      }
    }
    const entry: ThreadEntry = {
      id: crypto.randomUUID(),
      from: 'brand',
      text,
      at: now,
      author: m.email,
      ...(offer ? { offer } : {}),
    }
    const updated = await patchComplaint(m.complaint.id, {
      thread: [...m.complaint.thread, entry],
      status: 'responded',
      ...(offer ? { offer } : {}),
      ...(m.complaint.firstResponseAt ? {} : { firstResponseAt: now }),
    })
    res.json({ ...updated, trackUrl: trackUrl(m.complaint.id, m.token) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not record the response' })
  }
})

brandRouter.post('/api/brand/:brandId/complaints/:id/status', async (req, res) => {
  const m = await memberComplaint(req, res)
  if (!m) return
  const status = str((req.body as { status?: unknown }).status, 20) as ComplaintStatus
  if (!['resolved', 'closed', 'new'].includes(status)) {
    res.status(400).json({ error: 'Unsupported status' })
    return
  }
  const label = status === 'new' ? 'Reopened' : status === 'resolved' ? 'Marked resolved' : 'Closed'
  const updated = await patchComplaint(m.complaint.id, {
    status,
    resolvedAt: status === 'resolved' ? new Date().toISOString() : null,
    thread: [...m.complaint.thread, systemEntry(`${label} by ${m.brand.name}.`)],
  })
  res.json({ ...updated, trackUrl: trackUrl(m.complaint.id, m.token) })
})

/** Loads a set of realistic sample complaints so a demo starts populated. */
brandRouter.post('/api/brand/:brandId/demo-seed', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    const created: Complaint[] = []
    for (const c of demoComplaints(m.brand.name)) {
      const { complaint } = await insertComplaint(m.brand.id, c)
      created.push(complaint)
    }
    // Analyse in parallel but bounded, so the AI layer isn't hammered.
    for (let i = 0; i < created.length; i += 3) {
      await Promise.all(created.slice(i, i + 3).map((c) => runAnalysis(c, m.brand, 'demo').catch(() => c)))
    }
    res.json({ added: created.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load sample complaints' })
  }
})

/* -------------------------------------------------------------------------- */
/* Intake                                                                     */
/* -------------------------------------------------------------------------- */

async function receive(brand: Brand, input: NewComplaint) {
  const { complaint, consumerToken } = await insertComplaint(brand.id, input)
  analyseInBackground(complaint, brand, 'intake')
  return { id: complaint.id, trackUrl: trackUrl(complaint.id, consumerToken) }
}

/** Website form. The key is publishable — it only lets someone file a complaint. */
brandRouter.post('/api/intake/:key(pk_[a-f0-9]+)', async (req, res) => {
  try {
    if (rateLimited(req)) {
      res.status(429).json({ error: 'Too many complaints from this address — please try later' })
      return
    }
    const brand = await brandByKey(String(req.params.key))
    if (!brand) {
      res.status(404).json({ error: 'Unknown intake key' })
      return
    }
    const input = newComplaintFrom(req.body as Record<string, unknown>, 'web')
    if (!input || !input.consumerEmail) {
      res.status(400).json({ error: 'Your email and a description of the problem are required' })
      return
    }
    res.status(201).json(await receive(brand, input))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not submit the complaint' })
  }
})

brandRouter.get('/api/intake/brand/:slug', async (req, res) => {
  const brand = await brandBySlug(String(req.params.slug))
  if (!brand) {
    res.status(404).json({ error: 'Brand not found' })
    return
  }
  res.json({ name: brand.name, slug: brand.slug })
})

/** Hosted form on our own site, for brands without one of their own. */
brandRouter.post('/api/intake/hosted/:slug', async (req, res) => {
  try {
    if (rateLimited(req)) {
      res.status(429).json({ error: 'Too many complaints from this address — please try later' })
      return
    }
    const brand = await brandBySlug(String(req.params.slug))
    if (!brand) {
      res.status(404).json({ error: 'Brand not found' })
      return
    }
    const input = newComplaintFrom(req.body as Record<string, unknown>, 'hosted')
    if (!input || !input.consumerEmail) {
      res.status(400).json({ error: 'Your email and a description of the problem are required' })
      return
    }
    res.status(201).json(await receive(brand, input))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not submit the complaint' })
  }
})

/**
 * Inbound email. Point an inbound-parse provider (Postmark, SendGrid,
 * Mailgun, Resend) at this URL, or have the brand auto-forward its support
 * inbox to complaints+<slug>@<our inbound domain>. Accepts the common JSON
 * field names those providers use. Requires INBOUND_EMAIL_SECRET as the
 * x-inbound-secret header (or ?secret=) so nobody else can inject mail.
 */
brandRouter.post('/api/intake/email', async (req, res) => {
  try {
    const secret = process.env.INBOUND_EMAIL_SECRET
    const given = String(req.headers['x-inbound-secret'] ?? req.query.secret ?? '')
    if (!secret || given !== secret) {
      res.status(401).json({ error: 'Bad or missing inbound secret' })
      return
    }
    const b = req.body as Record<string, unknown>
    const to = str(b.To ?? b.to ?? b.recipient, 500).toLowerCase()
    const slug = to.match(/complaints\+([a-z0-9-]+)@/)?.[1] ?? str(req.query.brand, 60)
    const brand = slug ? await brandBySlug(slug) : null
    if (!brand) {
      res.status(404).json({ error: 'Could not tell which brand this email is for' })
      return
    }
    const fromRaw = str(b.From ?? b.from ?? b.sender, 300)
    const email = fromRaw.match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? ''
    const name = str(b.FromName ?? b.fromName, 120) || fromRaw.replace(/<.*>/, '').replace(/"/g, '').trim()
    const input = newComplaintFrom(
      {
        name,
        email,
        subject: b.Subject ?? b.subject,
        body: b.TextBody ?? b.text ?? b['body-plain'] ?? b.body,
      },
      'email',
    )
    if (!input) {
      res.status(400).json({ error: 'Empty email body' })
      return
    }
    res.status(201).json(await receive(brand, input))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not ingest the email' })
  }
})

/* -------------------------------------------------------------------------- */
/* Consumer tracking link                                                     */
/* -------------------------------------------------------------------------- */

async function consumerComplaint(req: express.Request, res: express.Response) {
  const found = await findComplaint(String(req.params.id))
  const t = String(req.headers['x-track-token'] ?? req.query.t ?? (req.body as { t?: unknown })?.t ?? '')
  const digest = (s: string) => crypto.createHash('sha256').update(s).digest()
  if (!found || !t || !crypto.timingSafeEqual(digest(t), digest(found.consumerToken))) {
    res.status(404).json({ error: 'This tracking link is not valid' })
    return null
  }
  const brand = await findBrand(found.complaint.brandId)
  return { complaint: found.complaint, brand: brand! }
}

/** What the consumer sees: never the analysis, never staff emails. */
function consumerView(c: Complaint, brand: Brand) {
  return {
    id: c.id,
    brandName: brand.name,
    status: c.status,
    receivedAt: c.receivedAt,
    subject: c.subject,
    body: c.body,
    orderRef: c.orderRef,
    product: c.product,
    amountClaimed: c.amountClaimed,
    purchaseDate: c.purchaseDate,
    offer: c.offer,
    thread: c.thread.map(({ author: _author, ...e }) => e),
  }
}

brandRouter.get('/api/track/:id', async (req, res) => {
  const found = await consumerComplaint(req, res)
  if (!found) return
  res.json(consumerView(found.complaint, found.brand))
})

brandRouter.post('/api/track/:id/reply', async (req, res) => {
  try {
    const found = await consumerComplaint(req, res)
    if (!found) return
    const { complaint, brand } = found
    if (complaint.status === 'closed') {
      res.status(409).json({ error: 'This complaint has been closed' })
      return
    }
    const text = str((req.body as { text?: unknown }).text, 5000)
    if (!text) {
      res.status(400).json({ error: 'Write a message first' })
      return
    }
    const entry: ThreadEntry = { id: crypto.randomUUID(), from: 'consumer', text, at: new Date().toISOString() }
    const updated = await patchComplaint(complaint.id, {
      thread: [...complaint.thread, entry],
      status: complaint.status === 'resolved' ? 'resolved' : 'consumer_replied',
    })
    res.json(consumerView(updated!, brand))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not send your message' })
  }
})

/**
 * The consumer corrects or adds to their complaint. The original text is never
 * overwritten — additions are appended, and field changes are logged on the
 * thread — so both sides keep an honest record. Re-runs the analysis.
 */
brandRouter.post('/api/track/:id/details', async (req, res) => {
  try {
    const found = await consumerComplaint(req, res)
    if (!found) return
    const { complaint, brand } = found
    if (complaint.status === 'resolved' || complaint.status === 'closed') {
      res.status(409).json({ error: 'This complaint is closed' })
      return
    }
    const b = req.body as Record<string, unknown>
    const changes: string[] = []
    const patch: Parameters<typeof patchComplaint>[1] = {}
    const orderRef = str(b.orderRef, 80)
    if (orderRef && orderRef !== complaint.orderRef) {
      patch.orderRef = orderRef
      changes.push(`Order reference: ${orderRef}`)
    }
    const product = str(b.product, 120)
    if (product && product !== complaint.product) {
      patch.product = product
      changes.push(`Product: ${product}`)
    }
    const amt = amount(b.amountClaimed)
    if (amt && amt !== complaint.amountClaimed) {
      patch.amountClaimed = amt
      changes.push(`Amount paid: ₹${amt.toLocaleString('en-IN')}`)
    }
    const pd = isoDate(b.purchaseDate)
    if (pd && pd !== complaint.purchaseDate) {
      patch.purchaseDate = pd
      changes.push(`Purchase date: ${pd}`)
    }
    const addition = str(b.addition, 5000)
    if (addition) {
      patch.body = `${complaint.body}\n\n[Added by consumer, ${new Date().toISOString().slice(0, 10)}]\n${addition}`
      changes.push(`Added: “${addition.slice(0, 300)}${addition.length > 300 ? '…' : ''}”`)
    }
    if (changes.length === 0) {
      res.status(400).json({ error: 'Nothing changed' })
      return
    }
    const entry: ThreadEntry = {
      id: crypto.randomUUID(),
      from: 'consumer',
      text: `Updated complaint details:\n${changes.map((c) => `• ${c}`).join('\n')}`,
      at: new Date().toISOString(),
    }
    const updated = await patchComplaint(complaint.id, {
      ...patch,
      thread: [...complaint.thread, entry],
      status: complaint.status === 'escalated' ? 'escalated' : 'consumer_replied',
    })
    analyseInBackground(updated!, brand, 'consumer_update')
    res.json(consumerView(updated!, brand))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not save your changes' })
  }
})

brandRouter.post('/api/track/:id/offer', async (req, res) => {
  try {
    const found = await consumerComplaint(req, res)
    if (!found) return
    const { complaint, brand } = found
    if (!complaint.offer || complaint.offer.status !== 'pending') {
      res.status(409).json({ error: 'There is no open offer on this complaint' })
      return
    }
    const decision = str((req.body as { decision?: unknown }).decision, 10)
    if (decision !== 'accept' && decision !== 'decline') {
      res.status(400).json({ error: 'Choose accept or decline' })
      return
    }
    const now = new Date().toISOString()
    const offer: Offer = { ...complaint.offer, status: decision === 'accept' ? 'accepted' : 'declined', decidedAt: now }
    const reason = str((req.body as { reason?: unknown }).reason, 2000)
    const updated = await patchComplaint(complaint.id, {
      offer,
      status: decision === 'accept' ? 'resolved' : 'consumer_replied',
      resolvedAt: decision === 'accept' ? now : null,
      thread: [
        ...complaint.thread,
        {
          id: crypto.randomUUID(),
          from: 'consumer',
          text: decision === 'accept' ? 'Accepted the offer.' : `Declined the offer.${reason ? `\n${reason}` : ''}`,
          at: now,
        },
      ],
    })
    res.json(consumerView(updated!, brand))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not record your decision' })
  }
})

/* -------------------------------------------------------------------------- */
/* Plan and usage                                                             */
/* -------------------------------------------------------------------------- */

async function usageView(brand: Brand, email: string) {
  const u = await usageThisMonth(brand.id)
  const limit = analysisLimit(brand)
  const now = new Date()
  const admin = isAdmin(email)
  return {
    billingModel: brand.billingModel,
    plan: planFor(brand),
    plans: PLANS,
    limit,
    used: u.analyses,
    remaining: limit === null ? null : Math.max(0, limit - u.analyses),
    resetsOn: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10),
    byDay: u.byDay,
    perAnalysisPrice: brand.perAnalysisPrice,
    estimatedCharge:
      brand.billingModel === 'pay_per_analysis' && brand.perAnalysisPrice !== null
        ? u.analyses * brand.perAnalysisPrice
        : null,
    aiEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    isAdmin: admin,
    // What this brand costs us to serve — Consumer X staff only.
    internal: admin
      ? { inputTokens: u.inputTokens, outputTokens: u.outputTokens, costUsd: tokenCostUsd(u.inputTokens, u.outputTokens) }
      : null,
  }
}

brandRouter.get('/api/brand/:brandId/usage', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    res.json(await usageView(m.brand, m.email))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load usage' })
  }
})

/** Pay-per-analysis brands set their own monthly cap (null = no cap). */
brandRouter.put('/api/brand/:brandId/usage/cap', async (req, res) => {
  const m = await requireMember(req, res)
  if (!m) return
  if (m.brand.billingModel !== 'pay_per_analysis') {
    res.status(409).json({ error: 'Your allowance is set by your plan — contact us to change it' })
    return
  }
  const raw = (req.body as { monthlyLimit?: unknown }).monthlyLimit
  const n = raw === null || raw === '' ? null : Math.floor(Number(raw))
  if (n !== null && (!Number.isFinite(n) || n < 0 || n > 1_000_000)) {
    res.status(400).json({ error: 'Enter a number of analyses, or leave it empty for no cap' })
    return
  }
  const brand = await setBilling(m.brand.id, { monthlyLimit: n })
  res.json(await usageView(brand!, m.email))
})

/** Plan changes are made by Consumer X staff (ADMIN_EMAILS), not by brands. */
brandRouter.patch('/api/brand/:brandId/billing', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    if (!isAdmin(m.email)) {
      res.status(403).json({ error: 'Only Consumer X staff can change plans' })
      return
    }
    const b = req.body as Record<string, unknown>
    const num = (v: unknown) => (v === null || v === '' ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined)
    const brand = await setBilling(m.brand.id, {
      billingModel: b.billingModel === 'subscription' || b.billingModel === 'pay_per_analysis' ? b.billingModel : undefined,
      plan: PLANS.some((p) => p.id === b.plan) ? String(b.plan) : undefined,
      monthlyLimit: 'monthlyLimit' in b ? (num(b.monthlyLimit) === null ? null : Math.floor(num(b.monthlyLimit) ?? 0)) : undefined,
      perAnalysisPrice: 'perAnalysisPrice' in b ? num(b.perAnalysisPrice) : undefined,
    })
    res.json(await usageView(brand!, m.email))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not update the plan' })
  }
})

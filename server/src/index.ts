import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import { countCases, findCase, initDb, insertCase, patchCase } from './db.js'
import {
  buildOffer,
  buildRulesAssessment,
  GROUND_LABELS,
  MILESTONES,
  nextMilestoneOffset,
  noticeDaysElapsed,
  noticeRef,
  readGrounds,
  toView,
} from './caseLogic.js'
import { generateAiAssessment } from './ai.js'
import { initPrecedentTable, searchLocalPrecedents } from './precedentStore.js'
import { categoriesForGrounds, isGroundId } from './categories.js'
import {
  caseIdsForUser,
  claimCase,
  consumeLoginToken,
  destroySession,
  initAuthTables,
  issueLoginToken,
  normaliseEmail,
  sendLoginEmail,
  userForSession,
} from './auth.js'
import type { CaseRecord, DispatchMethod, IntakeData, RoutingResult } from './types.js'

const app = express()
app.use(express.json({ limit: '1mb' }))

// CORS: set FRONTEND_ORIGIN to your Vercel URL (comma-separated for several).
const origins = (process.env.FRONTEND_ORIGIN ?? '*').split(',').map((s) => s.trim())
app.use(cors({ origin: origins.includes('*') ? true : origins }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY) })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tokenFrom(req: express.Request): string {
  return (req.headers['x-case-token'] as string) ?? (req.query.t as string) ?? ''
}

/** Bearer session token, if the caller is signed in. */
function sessionFrom(req: express.Request): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice(7).trim() || null
}

/** Resolves the signed-in user, or sends 401 and returns null. */
async function requireUser(req: express.Request, res: express.Response) {
  const user = await userForSession(sessionFrom(req))
  if (!user) {
    res.status(401).json({ error: 'Please sign in' })
    return null
  }
  return user
}

/** Loads the case and enforces its access token. Sends the error response itself. */
async function authedCase(req: express.Request, res: express.Response): Promise<CaseRecord | null> {
  const found = await findCase(req.params.id as string)
  if (!found) {
    res.status(404).json({ error: 'Case not found' })
    return null
  }
  if (!found.token || found.token !== tokenFrom(req)) {
    res.status(403).json({ error: 'Invalid case token' })
    return null
  }
  return found.record
}

function stripEvidenceData(intake: IntakeData): IntakeData {
  return {
    ...intake,
    evidence: (intake.evidence ?? []).map((e) => {
      const { id, name, type, sizeKb, category } = e as typeof e & { dataUrl?: string }
      return { id, name, type, sizeKb, category }
    }),
  }
}

// ---------------------------------------------------------------------------
// Auth routes
//
// Filing never requires an account. These exist so a complainant can keep a
// dashboard of their cases across devices — the prompt to sign up appears
// before the notice step.
// ---------------------------------------------------------------------------

/**
 * Requests a sign-in link. Always answers the same way whether or not the
 * address has an account, so this cannot be used to enumerate users.
 */
app.post('/api/auth/request-link', async (req, res) => {
  try {
    const email = normaliseEmail((req.body as { email?: string }).email ?? '')
    if (!email) {
      res.status(400).json({ error: 'That doesn’t look like an email address' })
      return
    }
    const token = await issueLoginToken(email)
    const base = (process.env.FRONTEND_ORIGIN ?? '').split(',')[0].trim() || 'http://localhost:5173'
    const link = `${base.replace(/\/$/, '')}/auth/callback?token=${encodeURIComponent(token)}`
    const sent = await sendLoginEmail(email, link)
    // Report delivery failure honestly rather than showing "check your email"
    // for a message that was never sent. This says nothing about whether the
    // address has an account, so it stays non-enumerable.
    if (!sent.delivered && !sent.devLink) {
      res.status(502).json({
        error:
          sent.failure === 'not_configured'
            ? 'Sign-in email isn’t configured yet, so we couldn’t send your link. Please try again later.'
            : 'We couldn’t deliver your sign-in link just now. Please try again in a few minutes.',
      })
      return
    }
    res.json({ ok: true, ...(sent.devLink ? { devLink: sent.devLink } : {}) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not send the sign-in link' })
  }
})

/** Exchanges a magic-link token for a session. */
app.post('/api/auth/verify', async (req, res) => {
  try {
    const token = String((req.body as { token?: string }).token ?? '')
    const result = token ? await consumeLoginToken(token) : null
    if (!result) {
      res.status(401).json({ error: 'That sign-in link has expired or has already been used' })
      return
    }
    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not complete sign-in' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  const user = await userForSession(sessionFrom(req))
  res.json({ user })
})

app.post('/api/auth/logout', async (req, res) => {
  const token = sessionFrom(req)
  if (token) await destroySession(token)
  res.json({ ok: true })
})

/**
 * Attaches an anonymous case to the signed-in account. The case token must be
 * presented, so only someone who already holds the case can claim it.
 */
app.post('/api/cases/:id/claim', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    const record = await authedCase(req, res)
    if (!record) return
    const ok = await claimCase(record.id, user.id)
    if (!ok) {
      res.status(409).json({ error: 'This case is already attached to another account' })
      return
    }
    res.json(toView(record))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not attach the case to your account' })
  }
})

/** All cases belonging to the signed-in user. */
app.get('/api/my/cases', async (req, res) => {
  try {
    const user = await requireUser(req, res)
    if (!user) return
    const ids = await caseIdsForUser(user.id)
    const records = await Promise.all(ids.map((id) => findCase(id)))
    res.json(
      records
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map((r) => ({ ...toView(r.record), token: r.token })),
    )
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load your cases' })
  }
})

// ---------------------------------------------------------------------------
// Case routes
// ---------------------------------------------------------------------------

app.post('/api/cases', async (req, res) => {
  try {
    const { intake, routing } = req.body as { intake?: IntakeData; routing?: RoutingResult }
    if (!intake || !routing || readGrounds(intake).length === 0) {
      res.status(400).json({ error: 'intake (with at least one ground) and routing are required' })
      return
    }
    const year = new Date().getFullYear()
    const seq = 400 + (await countCases()) * 17 + Math.floor(Math.random() * 12)
    const id = `CX-${year}-${String(seq).padStart(5, '0')}`
    const token = crypto.randomBytes(24).toString('hex')
    const record = await insertCase({ id, token, intake: stripEvidenceData(intake), routing })
    res.status(201).json({ ...toView(record), token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not create case' })
  }
})

app.get('/api/cases/:id', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    res.json(toView(record))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load case' })
  }
})

// Simulated ₹499 payment → generates the assessment (rules + optional AI).
app.post('/api/cases/:id/pay', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (record.assessment) {
      res.json(toView(record))
      return
    }

    const rules = buildRulesAssessment(record)

    // Retrieve precedents on the statutory grounds only (never the narrative
    // verbatim to a third party), then let the AI layer rank/annotate them.
    let precedents: Awaited<ReturnType<typeof localPrecedentResults>> = []
    try {
      const grounds = readGrounds(record.intake)
      precedents = await localPrecedentResults(
        grounds.map((g) => GROUND_LABELS[g]).join(' '),
        categoriesForGrounds(grounds),
      )
    } catch {
      // precedent search is best-effort
    }
    const ai = await generateAiAssessment(record, rules, precedents)

    const updated = await patchCase(record.id, {
      assessment: {
        ...rules,
        paidAt: new Date().toISOString(),
        receiptId: `CX-RCPT-${Math.floor(80000 + Math.random() * 19999)}`,
        ai,
      },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Payment simulation failed' })
  }
})

// Save the complainant's edits to the generated notice. Idempotent, and
// callable as often as they like right up until dispatch is recorded.
app.put('/api/cases/:id/notice-draft', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (record.notice) {
      res.status(409).json({ error: 'This notice has already been dispatched and is now fixed' })
      return
    }
    const raw = (req.body as { edits?: Record<string, unknown> }).edits ?? {}
    // Coerce to strings and cap length — this text goes into a legal document.
    const edits: Record<string, string> = {}
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') edits[String(k).slice(0, 64)] = v.slice(0, 8000)
    }
    const updated = await patchCase(record.id, {
      noticeDraft: { edits, updatedAt: new Date().toISOString() },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not save your changes' })
  }
})

// Record that the complainant has dispatched the notice themselves.
//
// This route does NOT send anything. Consumer X generates the document and the
// email draft; the complainant sends it from their own address and by
// registered post, then confirms here — which is what starts the 30-day clock.
app.post('/api/cases/:id/notice', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (record.notice) {
      res.json(toView(record))
      return
    }
    const body = req.body as { methods?: string[]; postId?: string }
    const allowed: DispatchMethod[] = ['email', 'registered_post', 'courier', 'other']
    const methods = (body.methods ?? []).filter((m): m is DispatchMethod =>
      allowed.includes(m as DispatchMethod),
    )
    if (methods.length === 0) {
      res.status(400).json({ error: 'Tell us how you sent it — at least one dispatch method' })
      return
    }
    const updated = await patchCase(record.id, {
      notice: {
        sentAt: new Date().toISOString(),
        ref: noticeRef(record.id),
        postId:
          typeof body.postId === 'string' && body.postId.trim()
            ? body.postId.trim().slice(0, 40)
            : null,
        methods,
      },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not record the dispatch' })
  }
})

// Demo fast-forward to the next simulated company-side milestone.
app.post('/api/cases/:id/advance', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    const delta = nextMilestoneOffset(record)
    if (delta === null) {
      res.json(toView(record))
      return
    }
    const updated = await patchCase(record.id, { clockOffsetDays: record.clockOffsetDays + delta })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not advance clock' })
  }
})

app.post('/api/cases/:id/accept', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (record.resolution) {
      res.json(toView(record))
      return
    }
    if (!record.notice || noticeDaysElapsed(record) < MILESTONES.offerReceived) {
      res.status(409).json({ error: 'No offer on the table yet' })
      return
    }
    const offer = buildOffer(record)
    const updated = await patchCase(record.id, {
      resolution: {
        acceptedAt: new Date().toISOString(),
        amount: offer.amount,
        daysFromNotice: noticeDaysElapsed(record),
        ledgerConsent: false,
      },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not accept offer' })
  }
})

app.post('/api/cases/:id/ledger', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (!record.resolution) {
      res.status(409).json({ error: 'Case is not resolved yet' })
      return
    }
    const consent = Boolean((req.body as { consent?: boolean }).consent)
    const updated = await patchCase(record.id, {
      resolution: { ...record.resolution, ledgerConsent: consent },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not update ledger consent' })
  }
})

// Precedents come from the locally ingested e-Jagriti corpus (precedent_cases
// table, populated by src/ingest.ts) — shaped to the PrecedentResult contract
// the frontend and ai.ts already expect.
async function localPrecedentResults(query: string, categories: string[] = []) {
  const rows = await searchLocalPrecedents(query, 5, categories)
  return rows.map((r) => {
    const date =
      r.judgmentDate instanceof Date
        ? r.judgmentDate.toISOString().slice(0, 10)
        : (r.judgmentDate ?? null)
    return {
      title: `${r.caseNumber} — ${r.complainant ?? 'Complainant'} v. ${r.respondent ?? 'Respondent'}`,
      docUrl: `https://e-jagriti.gov.in/judgement#${encodeURIComponent(r.caseNumber)}`,
      court: ['NCDRC', r.outcome, date].filter(Boolean).join(' · '),
      snippet: r.snippet.replace(/<\/?b>/g, ''),
    }
  })
}

app.get('/api/precedents', async (req, res) => {
  try {
    const query = req.query.q as string | undefined
    if (!query) {
      res.status(400).json({ error: 'Missing "q" query parameter' })
      return
    }
    // Optional `grounds` (comma-separated) narrows the search to the e-Jagriti
    // categories those grounds map to — the main relevance control. Without it
    // the whole corpus is searched, which is rarely what you want.
    const grounds = String(req.query.grounds ?? '')
      .split(',')
      .map((g) => g.trim())
      .filter(isGroundId)
    // Serve from the locally ingested e-Jagriti corpus (see src/ingest.ts).
    res.json(await localPrecedentResults(query, categoriesForGrounds(grounds)))
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3001)
initDb()
  .then(() => initPrecedentTable())
  .then(() => initAuthTables())
  .then(() => {
    app.listen(port, () => {
      console.log(`Consumer X API listening on :${port}`)
      console.log(`AI assessment layer: ${process.env.ANTHROPIC_API_KEY ? 'enabled' : 'disabled (no ANTHROPIC_API_KEY)'}`)
    })
  })
  .catch((err) => {
    console.error('Database initialisation failed:', err)
    process.exit(1)
  })

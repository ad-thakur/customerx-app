import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import { countCases, findCase, initDb, insertCase, patchCase } from './db.js'
import {
  buildOffer,
  buildRulesAssessment,
  MILESTONES,
  nextMilestoneOffset,
  noticeDaysElapsed,
  noticeRef,
  toView,
} from './caseLogic.js'
import { generateAiAssessment } from './ai.js'
import { initPrecedentTable, searchLocalPrecedents } from './precedentStore.js'
import type { CaseRecord, IntakeData, RoutingResult } from './types.js'

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
// Routes
// ---------------------------------------------------------------------------

app.post('/api/cases', async (req, res) => {
  try {
    const { intake, routing } = req.body as { intake?: IntakeData; routing?: RoutingResult }
    if (!intake || !routing || !intake.ground) {
      res.status(400).json({ error: 'intake (with ground) and routing are required' })
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

    // Retrieve precedents on the statutory ground only (never the narrative
    // verbatim to a third party), then let the AI layer rank/annotate them.
    let precedents: Awaited<ReturnType<typeof localPrecedentResults>> = []
    try {
      precedents = await localPrecedentResults(
        `${record.intake.ground?.replace(/_/g, ' ')} consumer protection act 2019`,
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

app.post('/api/cases/:id/notice', async (req, res) => {
  try {
    const record = await authedCase(req, res)
    if (!record) return
    if (record.notice) {
      res.json(toView(record))
      return
    }
    const updated = await patchCase(record.id, {
      notice: {
        sentAt: new Date().toISOString(),
        ref: noticeRef(record.id),
        postId: `RN${Math.floor(700000000 + Math.random() * 99999999)}IN`,
      },
    })
    res.json(toView(updated!))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not send notice' })
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
async function localPrecedentResults(query: string) {
  const rows = await searchLocalPrecedents(query, 5)
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
    // Serve from the locally ingested e-Jagriti corpus (see src/ingest.ts).
    res.json(await localPrecedentResults(query))
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
})

// ---------------------------------------------------------------------------

const port = Number(process.env.PORT ?? 3001)
initDb()
  .then(() => initPrecedentTable())
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

// Routes for the Social tab (X and Reddit mentions). Brand members only, and
// only once the brand has the social add-on enabled. See social.ts.

import express from 'express'
import { frontendBase, requireMember, runAnalysis, str } from './brandRoutes.js'
import { insertComplaint, updateBrand, type Brand } from './brandStore.js'
import {
  draftSocialReply,
  findMention,
  insertMention,
  listMentions,
  patchMention,
  sampleMentions,
  type Mention,
} from './social.js'

export const socialRouter = express.Router()

function formUrl(brand: Brand): string {
  return `${frontendBase()}/complain/${brand.slug}`
}

/**
 * Where the brand can post the reply by hand until its account is connected:
 * X's reply intent, or the Reddit thread itself. Sample mentions have no
 * real post behind them, so they get no link.
 */
function replyLink(m: Mention, text: string): string | null {
  if (m.sample || !m.externalId) return null
  if (m.platform === 'x')
    return `https://x.com/intent/post?in_reply_to=${encodeURIComponent(m.externalId)}&text=${encodeURIComponent(text)}`
  return m.url
}

async function memberMention(req: express.Request, res: express.Response) {
  const m = await requireMember(req, res)
  if (!m) return null
  if (!m.brand.socialEnabled) {
    res.status(402).json({ error: 'Social listening is an add-on — enable it for this brand first' })
    return null
  }
  const mention = await findMention(String(req.params.mid))
  if (!mention || mention.brandId !== m.brand.id) {
    res.status(404).json({ error: 'Mention not found' })
    return null
  }
  return { ...m, mention }
}

socialRouter.get('/api/brand/:brandId/social', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    if (!m.brand.socialEnabled) {
      res.json({ enabled: false })
      return
    }
    const mentions = await listMentions(m.brand.id)
    const since = Date.now() - 7 * 86_400_000
    const open = mentions.filter((x) => x.status === 'new')
    res.json({
      enabled: true,
      formUrl: formUrl(m.brand),
      connections: {
        // Live ingestion needs per-brand credentials; see social.ts.
        x: { connected: false },
        reddit: { connected: false, keywords: [m.brand.name, ...m.brand.aliases] },
      },
      stats: {
        last7d: mentions.filter((x) => new Date(x.postedAt).getTime() >= since).length,
        complaints: mentions.filter((x) => x.kind === 'complaint').length,
        unanswered: open.filter((x) => x.kind !== 'other').length,
        highVisibility: open.filter((x) => x.visibility >= 60).length,
        converted: mentions.filter((x) => x.status === 'converted').length,
        reach: open.reduce((s, x) => s + x.authorFollowers, 0),
      },
      mentions,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load mentions' })
  }
})

/**
 * Turns the add-on on. Self-serve for now so it can be demonstrated; once
 * billing exists this is where the subscription check goes.
 */
socialRouter.post('/api/brand/:brandId/social/enable', async (req, res) => {
  const m = await requireMember(req, res)
  if (!m) return
  res.json(await updateBrand(m.brand.id, { socialEnabled: true }))
})

socialRouter.post('/api/brand/:brandId/social/demo-seed', async (req, res) => {
  try {
    const m = await requireMember(req, res)
    if (!m) return
    if (!m.brand.socialEnabled) {
      res.status(402).json({ error: 'Enable social listening first' })
      return
    }
    let added = 0
    for (const s of sampleMentions(m.brand.name, m.brand.slug.replace(/-/g, '_'))) {
      if (await insertMention(m.brand.id, s)) added++
    }
    res.json({ added })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not load sample mentions' })
  }
})

socialRouter.post('/api/brand/:brandId/social/:mid/draft', async (req, res) => {
  const m = await memberMention(req, res)
  if (!m) return
  res.json({ text: draftSocialReply(m.mention, m.brand.name, formUrl(m.brand)) })
})

/**
 * Records the brand's reply. Nothing is posted to X or Reddit from here until
 * the brand connects its account; the response carries a link to post it by
 * hand where one exists.
 */
socialRouter.post('/api/brand/:brandId/social/:mid/reply', async (req, res) => {
  try {
    const m = await memberMention(req, res)
    if (!m) return
    const text = str((req.body as { text?: unknown }).text, m.mention.platform === 'x' ? 280 : 5000)
    if (!text) {
      res.status(400).json({ error: 'Write a reply first' })
      return
    }
    const updated = await patchMention(m.mention.id, {
      status: m.mention.status === 'converted' ? 'converted' : 'replied',
      reply: { text, at: new Date().toISOString(), author: m.email },
    })
    res.json({ mention: updated, postLink: replyLink(m.mention, text) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not record the reply' })
  }
})

/** Makes the post a tracked complaint, with the full analysis. */
socialRouter.post('/api/brand/:brandId/social/:mid/convert', async (req, res) => {
  try {
    const m = await memberMention(req, res)
    if (!m) return
    if (m.mention.complaintId) {
      res.json({ mention: m.mention, complaintId: m.mention.complaintId })
      return
    }
    const where = m.mention.platform === 'x' ? 'X' : `Reddit${m.mention.community ? ` (${m.mention.community})` : ''}`
    const { complaint } = await insertComplaint(m.brand.id, {
      source: 'social',
      consumerName: m.mention.authorName || m.mention.authorHandle,
      consumerEmail: '',
      consumerPhone: '',
      subject: `${where} post by @${m.mention.authorHandle}`,
      body: m.mention.text,
      orderRef: '',
      product: '',
      amountClaimed: null,
      purchaseDate: null,
      receivedAt: m.mention.postedAt,
    })
    await runAnalysis(complaint, m.brand)
    const updated = await patchMention(m.mention.id, { status: 'converted', complaintId: complaint.id })
    res.json({ mention: updated, complaintId: complaint.id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Could not convert the post' })
  }
})

socialRouter.post('/api/brand/:brandId/social/:mid/status', async (req, res) => {
  const m = await memberMention(req, res)
  if (!m) return
  const status = str((req.body as { status?: unknown }).status, 12)
  if (status !== 'dismissed' && status !== 'new') {
    res.status(400).json({ error: 'Unsupported status' })
    return
  }
  res.json({ mention: await patchMention(m.mention.id, { status }) })
})

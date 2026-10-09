// ---------------------------------------------------------------------------
// Social listening add-on: public posts on X and Reddit that mention a brand.
//
// A public post rarely carries an order number or invoice, so it is not
// analysed for legal outcome. The risk it carries is reputational, so mentions
// are ranked by *visibility* (audience and engagement) and classified by
// *kind* (complaint, question, praise, other). The intended flow:
//
//   post → public reply asking them to take it private → the consumer files
//   through the hosted form → it becomes a normal complaint with the full
//   analysis and tracking link
//
// or, when the post itself has enough detail, the brand converts it into a
// complaint directly.
//
// Live ingestion is not wired yet: X needs the brand to connect its account
// (pay-per-use API), Reddit needs commercial API approval. Until then the tab
// runs on sample mentions loaded per brand, flagged `sample`.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export type Platform = 'x' | 'reddit'
export type MentionKind = 'complaint' | 'question' | 'praise' | 'other'
export type MentionStatus = 'new' | 'replied' | 'converted' | 'dismissed'

export interface Mention {
  id: string
  brandId: string
  platform: Platform
  externalId: string | null
  url: string | null
  authorHandle: string
  authorName: string
  authorFollowers: number
  community: string | null // subreddit
  text: string
  postedAt: string
  likes: number
  reposts: number
  replies: number
  kind: MentionKind
  visibility: number // 0–100
  status: MentionStatus
  reply: { text: string; at: string; author: string } | null
  complaintId: string | null
  sample: boolean
}

export async function initSocialTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_mentions (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      external_id TEXT,
      url TEXT,
      author_handle TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT '',
      author_followers INT NOT NULL DEFAULT 0,
      community TEXT,
      text TEXT NOT NULL,
      posted_at TIMESTAMPTZ NOT NULL,
      likes INT NOT NULL DEFAULT 0,
      reposts INT NOT NULL DEFAULT 0,
      replies INT NOT NULL DEFAULT 0,
      kind TEXT NOT NULL,
      visibility INT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      reply JSONB,
      complaint_id TEXT,
      sample BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (brand_id, platform, external_id)
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS social_mentions_brand_idx ON social_mentions (brand_id, posted_at DESC)`,
  )
}

/* -------------------------------------------------------------------------- */
/* Classification                                                             */
/* -------------------------------------------------------------------------- */

const COMPLAINT =
  /\b(worst|pathetic|useless|scam|cheat|fraud|refund|broken|defect|faulty|not working|stopped working|no response|ignored|delay|still waiting|never again|disappointed|terrible|horrible|consumer court|complaint|overcharg|fake|damaged|burnt|caught fire|unacceptable|shame on)/i
const QUESTION = /\?|\b(how do i|how to|anyone know|does anyone|is it possible|can i|should i|which one)\b/i
const PRAISE = /\b(love|loving|great|amazing|awesome|thank you|thanks|kudos|impressed|best purchase|recommend)\b/i

export function classifyMention(text: string): MentionKind {
  if (COMPLAINT.test(text)) return 'complaint'
  if (QUESTION.test(text)) return 'question'
  if (PRAISE.test(text)) return 'praise'
  return 'other'
}

/**
 * How many people this is likely to reach, 0–100. Log-scaled so a 1M-follower
 * account doesn't flatten everything else, with engagement counting double
 * because it is the post spreading right now.
 */
export function visibilityScore(
  platform: Platform,
  followers: number,
  likes: number,
  reposts: number,
  replies: number,
): number {
  const engagement = Math.log10(1 + likes + 3 * reposts + 2 * replies) / 4 // ~10k weighted → 1
  // Reddit has no follower graph — upvotes and comments are the reach.
  if (platform === 'reddit') return Math.round(Math.min(1, engagement) * 100)
  const audience = Math.log10(Math.max(1, followers)) / 6 // 1M followers → 1
  return Math.round(Math.min(1, 0.4 * audience + 0.6 * engagement) * 100)
}

/* -------------------------------------------------------------------------- */
/* Persistence                                                                */
/* -------------------------------------------------------------------------- */

interface MentionRow {
  id: string
  brand_id: string
  platform: Platform
  external_id: string | null
  url: string | null
  author_handle: string
  author_name: string
  author_followers: number
  community: string | null
  text: string
  posted_at: Date
  likes: number
  reposts: number
  replies: number
  kind: MentionKind
  visibility: number
  status: MentionStatus
  reply: Mention['reply']
  complaint_id: string | null
  sample: boolean
}

function toMention(r: MentionRow): Mention {
  return {
    id: r.id,
    brandId: r.brand_id,
    platform: r.platform,
    externalId: r.external_id,
    url: r.url,
    authorHandle: r.author_handle,
    authorName: r.author_name,
    authorFollowers: r.author_followers,
    community: r.community,
    text: r.text,
    postedAt: r.posted_at.toISOString(),
    likes: r.likes,
    reposts: r.reposts,
    replies: r.replies,
    kind: r.kind,
    visibility: r.visibility,
    status: r.status,
    reply: r.reply,
    complaintId: r.complaint_id,
    sample: r.sample,
  }
}

export interface NewMention {
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
  sample: boolean
}

export async function insertMention(brandId: string, m: NewMention): Promise<Mention | null> {
  const res = await pool.query<MentionRow>(
    `INSERT INTO social_mentions (
       id, brand_id, platform, external_id, url, author_handle, author_name,
       author_followers, community, text, posted_at, likes, reposts, replies,
       kind, visibility, sample
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (brand_id, platform, external_id) DO NOTHING
     RETURNING *`,
    [
      `SM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      brandId,
      m.platform,
      m.externalId,
      m.url,
      m.authorHandle,
      m.authorName,
      m.authorFollowers,
      m.community,
      m.text,
      m.postedAt,
      m.likes,
      m.reposts,
      m.replies,
      classifyMention(m.text),
      visibilityScore(m.platform, m.authorFollowers, m.likes, m.reposts, m.replies),
      m.sample,
    ],
  )
  return res.rows.length ? toMention(res.rows[0]) : null
}

export async function listMentions(brandId: string): Promise<Mention[]> {
  const res = await pool.query<MentionRow>(
    `SELECT * FROM social_mentions WHERE brand_id = $1 ORDER BY posted_at DESC LIMIT 500`,
    [brandId],
  )
  return res.rows.map(toMention)
}

export async function findMention(id: string): Promise<Mention | null> {
  const res = await pool.query<MentionRow>(`SELECT * FROM social_mentions WHERE id = $1`, [id])
  return res.rows.length ? toMention(res.rows[0]) : null
}

export async function patchMention(
  id: string,
  patch: Partial<{ status: MentionStatus; reply: Mention['reply']; complaintId: string }>,
): Promise<Mention | null> {
  const res = await pool.query<MentionRow>(
    `UPDATE social_mentions SET
       status = COALESCE($2, status),
       reply = COALESCE($3::jsonb, reply),
       complaint_id = COALESCE($4, complaint_id)
     WHERE id = $1 RETURNING *`,
    [id, patch.status ?? null, patch.reply ? JSON.stringify(patch.reply) : null, patch.complaintId ?? null],
  )
  return res.rows.length ? toMention(res.rows[0]) : null
}

/* -------------------------------------------------------------------------- */
/* Reply drafting                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A public first reply. The aim is to take it private quickly — never to argue
 * the facts in public — and to give the consumer a route that turns the post
 * into a tracked complaint.
 */
export function draftSocialReply(m: Mention, brandName: string, formUrl: string): string {
  const name = m.authorName.split(' ')[0] || m.authorHandle
  if (m.platform === 'x') {
    if (m.kind === 'praise') return `@${m.authorHandle} Thank you, ${name}! Really glad to hear it. 🙏 — Team ${brandName}`
    if (m.kind === 'question')
      return `@${m.authorHandle} Hi ${name}, happy to help — please DM us the details and we'll get back to you today. — Team ${brandName}`
    return `@${m.authorHandle} Hi ${name}, we're sorry about this. Please share your order details here so we can resolve it quickly: ${formUrl} — Team ${brandName}`
  }
  if (m.kind === 'praise') return `Thanks for the kind words, ${name} — passing this on to the team.\n\n— ${brandName} support`
  if (m.kind === 'question')
    return `Hi ${name}, ${brandName} support here. Happy to help — could you message us with the model and what you're seeing? We'll come back with an answer.`
  return `Hi ${name}, ${brandName} support here. Sorry you've had this experience. If you log it at ${formUrl}, it goes straight to our complaints team and you can track it from there — we'd like to put this right.`
}

/* -------------------------------------------------------------------------- */
/* Sample mentions for demos                                                  */
/* -------------------------------------------------------------------------- */

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}

export function sampleMentions(brand: string, handle: string): NewMention[] {
  const sub = (s: string) => `r/${s}`
  const base = { url: null, sample: true }
  const rows: Omit<NewMention, 'url' | 'sample' | 'externalId'>[] = [
    {
      platform: 'x', authorHandle: 'techwithrohan', authorName: 'Rohan Verma', authorFollowers: 184_000, community: null,
      text: `Third time my @${handle} washing machine has died in 5 months. Technician visits, new PCB, same error. Absolutely pathetic after-sales. Is anyone else facing this? #${brand}Fail`,
      postedAt: hoursAgo(3), likes: 2_140, reposts: 610, replies: 288,
    },
    {
      platform: 'x', authorHandle: 'priya_k_88', authorName: 'Priya K', authorFollowers: 640, community: null,
      text: `@${handle} ordered an air fryer 12 days ago, still "processing". No response on chat or email. Please refund my money.`,
      postedAt: hoursAgo(6), likes: 12, reposts: 1, replies: 3,
    },
    {
      platform: 'reddit', authorHandle: 'chennai_dad', authorName: 'chennai_dad', authorFollowers: 0, community: sub('india'),
      text: `PSA: ${brand} charger caught fire in my son's room last night. Socket is burnt. Posting photos in comments. Their customer care just keeps giving ticket numbers. What should I do — consumer court?`,
      postedAt: hoursAgo(9), likes: 3_400, reposts: 0, replies: 412,
    },
    {
      platform: 'x', authorHandle: 'meenaxi', authorName: 'Meenakshi', authorFollowers: 2_100, community: null,
      text: `Got my new ${brand} smartwatch. Does anyone know how to turn off the always-on display to save battery? @${handle}`,
      postedAt: hoursAgo(14), likes: 4, reposts: 0, replies: 1,
    },
    {
      platform: 'reddit', authorHandle: 'budget_buyer_21', authorName: 'budget_buyer_21', authorFollowers: 0, community: sub('IndianGaming'),
      text: `Which is better for a small room — ${brand} 1 ton inverter AC or the competitor model? Any long-term reviews?`,
      postedAt: hoursAgo(20), likes: 38, reposts: 0, replies: 54,
    },
    {
      platform: 'x', authorHandle: 'arjun_writes', authorName: 'Arjun', authorFollowers: 9_800, community: null,
      text: `Shoutout to @${handle} support — technician came the same day and fixed my fridge. Didn't expect that. Thank you!`,
      postedAt: hoursAgo(26), likes: 96, reposts: 8, replies: 5,
    },
    {
      platform: 'x', authorHandle: 'angryconsumer_in', authorName: 'Consumer Rights Watch', authorFollowers: 52_000, community: null,
      text: `@${handle} charged ₹2,350 for a trimmer with MRP ₹1,999 at your Pune store, calling it "installation charges". This is overcharging above MRP and illegal. Retweet so they respond.`,
      postedAt: hoursAgo(30), likes: 870, reposts: 340, replies: 61,
    },
    {
      platform: 'reddit', authorHandle: 'throwaway_8842', authorName: 'throwaway_8842', authorFollowers: 0, community: sub('LegalAdviceIndia'),
      text: `Bought a ${brand} AC with installation included. 3 appointments, no technician. Complaint no. INS-7781. It's 40°C here. Can I file in consumer court for this or is it too small?`,
      postedAt: hoursAgo(40), likes: 120, reposts: 0, replies: 37,
    },
    {
      platform: 'x', authorHandle: 'random_rants', authorName: 'R', authorFollowers: 150, community: null,
      text: `@${handle} worst company ever lol`,
      postedAt: hoursAgo(50), likes: 2, reposts: 0, replies: 0,
    },
  ]
  return rows.map((r, i) => ({ ...base, ...r, externalId: `sample-${i}` }))
}

// ---------------------------------------------------------------------------
// Email magic-link authentication.
//
// Deliberately minimal and dependency-free:
//
//  - Sign-in is a single-use link mailed to the address. No passwords, so no
//    password storage, reset flow, or credential-stuffing surface.
//  - Only SHA-256 hashes of tokens are stored. A database leak does not hand
//    anyone a working link or session.
//  - Sessions are bearer tokens held by the frontend, not cookies. The API and
//    the app are on different origins (Railway / Vercel), where third-party
//    cookies are the fragile option; the frontend already holds per-case
//    tokens the same way.
//
// Filing stays anonymous. An account is only needed to keep a dashboard of
// cases across devices — see claimCase() for how an anonymous case is
// attached to an account after the fact.
// ---------------------------------------------------------------------------

import crypto from 'node:crypto'
import pg from 'pg'
import { BRAND_DOMAIN, BRAND_NAME } from './brand.js'

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

/** Codes (and the older magic links) are short-lived; sessions are long enough to be useful. */
export const CODE_TTL_MINUTES = 10
/** Wrong guesses allowed per code before it is cancelled: 5 tries in a million. */
const CODE_MAX_ATTEMPTS = 5
/** Per address: at most one new code every 30 s, and 5 an hour. */
const CODE_MIN_INTERVAL_S = 30
const CODE_MAX_PER_HOUR = 5
const SESSION_TTL_DAYS = 90

export interface User {
  id: string
  email: string
  createdAt: string
}

function hash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function normaliseEmail(raw: string): string | null {
  const email = String(raw ?? '').trim().toLowerCase()
  // Deliberately permissive — the deliverability check is that the link arrives.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return null
  return email
}

export async function initAuthTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_tokens (
      token_hash TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`)
  // One live sign-in code per address. Only a salted hash of the code is kept.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_codes (
      email TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      sends_this_hour INT NOT NULL DEFAULT 1,
      hour_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  // Cases gain an owner once claimed. Nullable: anonymous cases are the norm
  // right up until the complainant decides they want a dashboard.
  await pool.query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS user_id TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS cases_user_idx ON cases (user_id)`)
}

/* -------------------------------------------------------------------------- */
/* Magic links — no longer issued (sign-in uses codes); links already sent    */
/* keep working until they expire.                                            */
/* -------------------------------------------------------------------------- */

/**
 * Consumes a login token and returns a session token plus the user, creating
 * the user on first sign-in. Returns null if the token is unknown, expired or
 * already used.
 */
export async function consumeLoginToken(
  token: string,
): Promise<{ sessionToken: string; user: User } | null> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Single-use is enforced in SQL, not application logic: only the first
    // caller to flip consumed_at gets a row back.
    const res = await client.query<{ email: string }>(
      `UPDATE login_tokens
          SET consumed_at = now()
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
        RETURNING email`,
      [hash(token)],
    )
    if (res.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }
    const result = await startSession(client, res.rows[0].email)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Finds or creates the user for an email and opens a session, inside the
 * caller's transaction. Shared by sign-in codes and (older) magic links.
 */
async function startSession(
  client: pg.PoolClient,
  email: string,
): Promise<{ sessionToken: string; user: User }> {
  const userRes = await client.query<{ id: string; email: string; created_at: Date }>(
    `INSERT INTO users (id, email) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email, created_at`,
    [crypto.randomUUID(), email],
  )
  const row = userRes.rows[0]
  const sessionToken = newToken()
  await client.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hash(sessionToken), row.id, new Date(Date.now() + SESSION_TTL_DAYS * 86400_000)],
  )
  return {
    sessionToken,
    user: { id: row.id, email: row.email, createdAt: row.created_at.toISOString() },
  }
}

/* -------------------------------------------------------------------------- */
/* Six-digit sign-in codes                                                    */
/*                                                                            */
/* Replaces magic links for new sign-ins. A code can be typed on any device   */
/* (a link signs in whichever device opens it), and corporate mail scanners   */
/* that pre-open links can't burn it.                                          */
/* -------------------------------------------------------------------------- */

function codeHash(salt: string, code: string): string {
  return crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex')
}

export type IssueCodeResult = { code: string } | { retryAfterSeconds: number }

/**
 * Issues a fresh code for an email, replacing any earlier one. Rate-limited
 * per address; returns how long to wait instead when the limit is hit.
 */
export async function issueLoginCode(email: string): Promise<IssueCodeResult> {
  const prior = await pool.query<{ sent_at: Date; sends_this_hour: number; hour_started_at: Date }>(
    `SELECT sent_at, sends_this_hour, hour_started_at FROM login_codes WHERE email = $1`,
    [email],
  )
  const now = Date.now()
  let sendsThisHour = 1
  let hourStartedAt = new Date(now)
  if (prior.rows.length) {
    const p = prior.rows[0]
    const sinceLast = (now - p.sent_at.getTime()) / 1000
    if (sinceLast < CODE_MIN_INTERVAL_S) return { retryAfterSeconds: Math.ceil(CODE_MIN_INTERVAL_S - sinceLast) }
    const hourAge = (now - p.hour_started_at.getTime()) / 1000
    if (hourAge < 3600) {
      if (p.sends_this_hour >= CODE_MAX_PER_HOUR) return { retryAfterSeconds: Math.ceil(3600 - hourAge) }
      sendsThisHour = p.sends_this_hour + 1
      hourStartedAt = p.hour_started_at
    }
  }
  // Uniform over 000000–999999 (randomInt avoids modulo bias).
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const salt = crypto.randomBytes(16).toString('hex')
  await pool.query(
    `INSERT INTO login_codes (email, code_hash, salt, expires_at, attempts, sent_at, sends_this_hour, hour_started_at)
     VALUES ($1, $2, $3, $4, 0, now(), $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       code_hash = EXCLUDED.code_hash, salt = EXCLUDED.salt, expires_at = EXCLUDED.expires_at,
       attempts = 0, sent_at = now(), sends_this_hour = EXCLUDED.sends_this_hour,
       hour_started_at = EXCLUDED.hour_started_at`,
    [email, codeHash(salt, code), salt, new Date(now + CODE_TTL_MINUTES * 60_000), sendsThisHour, hourStartedAt],
  )
  return { code }
}

export type VerifyCodeResult =
  | { ok: true; sessionToken: string; user: User }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many'; attemptsLeft?: number }

/**
 * Checks a code. Each wrong guess counts; after CODE_MAX_ATTEMPTS the code is
 * cancelled and a new one must be requested. A correct code works once.
 */
export async function verifyLoginCode(email: string, code: string): Promise<VerifyCodeResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Row lock: concurrent guesses are counted one at a time.
    const res = await client.query<{ code_hash: string; salt: string; expires_at: Date; attempts: number }>(
      `SELECT code_hash, salt, expires_at, attempts FROM login_codes WHERE email = $1 FOR UPDATE`,
      [email],
    )
    const row = res.rows[0]
    if (!row || row.attempts >= CODE_MAX_ATTEMPTS) {
      await client.query('ROLLBACK')
      return { ok: false, reason: row ? 'too_many' : 'invalid' }
    }
    if (row.expires_at.getTime() < Date.now()) {
      await client.query('ROLLBACK')
      return { ok: false, reason: 'expired' }
    }
    const given = Buffer.from(codeHash(row.salt, code.replace(/\D/g, '')), 'hex')
    const stored = Buffer.from(row.code_hash, 'hex')
    if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
      const attempts = row.attempts + 1
      await client.query(`UPDATE login_codes SET attempts = $2 WHERE email = $1`, [email, attempts])
      await client.query('COMMIT')
      const left = CODE_MAX_ATTEMPTS - attempts
      return left > 0 ? { ok: false, reason: 'invalid', attemptsLeft: left } : { ok: false, reason: 'too_many' }
    }
    // Used once: the code goes; the send-rate counters reset with it.
    await client.query(`DELETE FROM login_codes WHERE email = $1`, [email])
    const result = await startSession(client, email)
    await client.query('COMMIT')
    return { ok: true, ...result }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/* -------------------------------------------------------------------------- */
/* Sessions                                                                   */
/* -------------------------------------------------------------------------- */

export async function userForSession(token: string | null): Promise<User | null> {
  if (!token) return null
  const res = await pool.query<{ id: string; email: string; created_at: Date }>(
    `SELECT u.id, u.email, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hash(token)],
  )
  if (res.rows.length === 0) return null
  const row = res.rows[0]
  return { id: row.id, email: row.email, createdAt: row.created_at.toISOString() }
}

export async function destroySession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hash(token)])
}

/* -------------------------------------------------------------------------- */
/* Case ownership                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Attaches a case to a user. The caller must already have proved it holds the
 * case's access token, so this only refuses to steal a case that someone else
 * has already claimed.
 */
export async function claimCase(caseId: string, userId: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE cases SET user_id = $1 WHERE id = $2 AND (user_id IS NULL OR user_id = $1)`,
    [userId, caseId],
  )
  return (res.rowCount ?? 0) > 0
}

export async function caseIdsForUser(userId: string): Promise<string[]> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM cases WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  )
  return res.rows.map((r) => r.id)
}

/* -------------------------------------------------------------------------- */
/* Delivery                                                                   */
/* -------------------------------------------------------------------------- */

export interface SendResult {
  delivered: boolean
  /**
   * Why delivery failed, safe to show the user. Deliberately does not leak
   * whether the address has an account — only that we could not send.
   */
  failure?: 'not_configured' | 'rejected'
  /** Populated only in dev echo mode — never in production. */
  devCode?: string
}

/**
 * Mails a sign-in code. The code is also in the subject line, so it can be read
 * straight from a phone's notification.
 *
 * Uses Resend over plain fetch when RESEND_API_KEY is set — no SDK needed.
 * Without a key the code is logged to the server console, which is what makes
 * local development workable; set AUTH_DEV_ECHO=true to additionally return it
 * to the client. Never enable AUTH_DEV_ECHO in production: it turns knowing an
 * address into signing in as it.
 */
export async function sendLoginCode(email: string, code: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.AUTH_FROM_EMAIL ?? `${BRAND_NAME} <login@${BRAND_DOMAIN}>`

  if (!key) {
    console.log(`[auth] no RESEND_API_KEY — sign-in code for ${email}: ${code}`)
    return {
      delivered: false,
      failure: 'not_configured',
      ...(process.env.AUTH_DEV_ECHO === 'true' ? { devCode: code } : {}),
    }
  }

  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your ${BRAND_NAME} sign-in code`,
      text: [
        `Your ${BRAND_NAME} sign-in code is:`,
        '',
        `    ${spaced}`,
        '',
        `Enter it on the sign-in page. It works once and expires in ${CODE_TTL_MINUTES} minutes.`,
        "If you didn't ask to sign in, you can ignore this email — no one can sign in without the code.",
      ].join('\n'),
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;color:#1c2333">
  <p>Your ${BRAND_NAME} sign-in code is:</p>
  <p style="font-size:32px;font-weight:600;letter-spacing:6px;margin:16px 0">${spaced}</p>
  <p>Enter it on the sign-in page. It works once and expires in ${CODE_TTL_MINUTES} minutes.</p>
  <p style="color:#6b7280;font-size:13px">If you didn't ask to sign in, you can ignore this email — no one can sign in without the code.</p>
</div>`,
    }),
  })

  if (!res.ok) {
    // Most common cause in early setup: sending from onboarding@resend.dev to
    // anyone other than the Resend account owner, or a from-domain that isn't
    // verified yet. Both return 403.
    console.error('[auth] Resend rejected the send:', res.status, await res.text())
    return { delivered: false, failure: 'rejected' }
  }
  return { delivered: true }
}

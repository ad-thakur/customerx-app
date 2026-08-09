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

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

/** Magic links are short-lived; sessions are long enough to be useful. */
const LINK_TTL_MINUTES = 15
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
  // Cases gain an owner once claimed. Nullable: anonymous cases are the norm
  // right up until the complainant decides they want a dashboard.
  await pool.query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS user_id TEXT`)
  await pool.query(`CREATE INDEX IF NOT EXISTS cases_user_idx ON cases (user_id)`)
}

/* -------------------------------------------------------------------------- */
/* Magic links                                                                */
/* -------------------------------------------------------------------------- */

/** Issues a single-use login token for an email. Returns the raw token. */
export async function issueLoginToken(email: string): Promise<string> {
  const token = newToken()
  const expires = new Date(Date.now() + LINK_TTL_MINUTES * 60_000)
  await pool.query(
    `INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1, $2, $3)`,
    [hash(token), email, expires],
  )
  // Opportunistic cleanup — keeps the table from growing without a cron job.
  await pool.query(`DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'`)
  return token
}

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
    const email = res.rows[0].email

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
    await client.query('COMMIT')

    return {
      sessionToken,
      user: { id: row.id, email: row.email, createdAt: row.created_at.toISOString() },
    }
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
  devLink?: string
}

/**
 * Mails the sign-in link.
 *
 * Uses Resend over plain fetch when RESEND_API_KEY is set — no SDK needed.
 * Without a key the link is logged to the server console, which is what makes
 * local development workable; set AUTH_DEV_ECHO=true to additionally return it
 * to the client. Never enable AUTH_DEV_ECHO in production: it turns knowing an
 * address into signing in as it.
 */
export async function sendLoginEmail(email: string, link: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.AUTH_FROM_EMAIL ?? 'Consumer X <login@consumerx.co.in>'

  if (!key) {
    console.log(`[auth] no RESEND_API_KEY — sign-in link for ${email}:\n${link}`)
    return {
      delivered: false,
      failure: 'not_configured',
      ...(process.env.AUTH_DEV_ECHO === 'true' ? { devLink: link } : {}),
    }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Consumer X sign-in link',
      text: [
        'Sign in to Consumer X using the link below.',
        '',
        link,
        '',
        `This link works once and expires in ${LINK_TTL_MINUTES} minutes.`,
        "If you didn't ask to sign in, you can ignore this email.",
      ].join('\n'),
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

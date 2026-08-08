// ---------------------------------------------------------------------------
// Client side of email magic-link auth.
//
// The session token lives in localStorage and is sent as a bearer token —
// the API is on a different origin to the app, where third-party cookies are
// the fragile choice. Case access tokens are already held the same way.
//
// Filing is anonymous throughout. Signing in exists so a complainant keeps a
// dashboard across devices; on sign-in we hand the server every case token
// this browser holds so those cases become theirs.
// ---------------------------------------------------------------------------

import { knownCaseIds, getToken } from './caseStore'

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''
const SESSION_KEY = 'consumerx.session.v1'

export interface User {
  id: string
  email: string
  createdAt: string
}

export function getSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function setSession(token: string | null) {
  try {
    if (token) localStorage.setItem(SESSION_KEY, token)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // storage unavailable — the session lasts until reload
  }
}

export const isSignedIn = () => getSession() !== null

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const session = getSession()
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...(opts.headers ?? {}),
    },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

/* -------------------------------------------------------------------------- */

/** Emails a sign-in link. `devLink` comes back only when the server echoes it. */
export function requestSignInLink(email: string): Promise<{ ok: true; devLink?: string }> {
  return api('/api/auth/request-link', { method: 'POST', body: JSON.stringify({ email }) })
}

/**
 * Completes sign-in from the emailed link, then attaches every case this
 * browser already holds to the new account, so the dashboard is populated
 * with the cases the person filed before they had one.
 */
export async function completeSignIn(token: string): Promise<User> {
  const { sessionToken, user } = await api<{ sessionToken: string; user: User }>(
    '/api/auth/verify',
    { method: 'POST', body: JSON.stringify({ token }) },
  )
  setSession(sessionToken)
  await claimLocalCases()
  return user
}

/** Best-effort: a case already owned by someone else simply stays theirs. */
export async function claimLocalCases(): Promise<void> {
  if (!isSignedIn()) return
  await Promise.all(
    knownCaseIds().map((id) =>
      api(`/api/cases/${id}/claim`, {
        method: 'POST',
        headers: { 'x-case-token': getToken(id) ?? '' },
      }).catch(() => null),
    ),
  )
}

export async function currentUser(): Promise<User | null> {
  if (!isSignedIn()) return null
  const { user } = await api<{ user: User | null }>('/api/auth/me')
  if (!user) setSession(null) // session expired or revoked server-side
  return user
}

export async function signOut(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => null)
  setSession(null)
}

/** Case views owned by the signed-in account, across devices. */
export function myCases<T>(): Promise<T[]> {
  return api<T[]>('/api/my/cases')
}

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { completeSignIn } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

/** Landing page for the emailed sign-in link: /auth/callback?token=… */
export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    // Links are single-use, so React 18 StrictMode's double-invoke in dev must
    // not burn the token on the second pass.
    if (ran.current) return
    ran.current = true

    const token = params.get('token')
    if (!token) {
      setError('That link is missing its sign-in token.')
      return
    }
    completeSignIn(token)
      .then(async () => {
        await refresh()
        navigate(params.get('next') ?? '/cases', { replace: true })
      })
      .catch((err: Error) => setError(err.message))
  }, [params, navigate, refresh])

  if (error) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="case-number text-seal text-sm mb-3">SIGN-IN FAILED</p>
        <h1 className="font-display text-2xl text-ink mb-3">{error}</h1>
        <p className="text-ink-soft mb-6">
          Sign-in links work once and expire after 15 minutes. Request a fresh one.
        </p>
        <Link
          to="/signin"
          className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors inline-block"
        >
          Get a new link
        </Link>
      </div>
    )
  }

  return <p className="text-center text-ink-soft py-24">Signing you in…</p>
}

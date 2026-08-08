import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { requestSignInLink } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

export default function SignIn() {
  const [params] = useSearchParams()
  const next = params.get('next') ?? '/cases'
  const { user } = useAuth()

  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [devLink, setDevLink] = useState<string | null>(null)

  if (user) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="font-display text-2xl text-ink mb-2">You're signed in.</p>
        <p className="text-ink-soft mb-6">as {user.email}</p>
        <Link
          to={next}
          className="bg-ink text-paper rounded-full px-6 py-2.5 font-medium hover:bg-seal transition-colors inline-block"
        >
          Continue →
        </Link>
      </div>
    )
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setState('sending')
    setError(null)
    requestSignInLink(email.trim())
      .then((r) => {
        setDevLink(r.devLink ?? null)
        setState('sent')
      })
      .catch((err: Error) => {
        setError(err.message)
        setState('idle')
      })
  }

  if (state === 'sent') {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="case-number text-seal text-sm mb-3">CHECK YOUR EMAIL</p>
        <h1 className="font-display text-3xl text-ink mb-3">Your sign-in link is on its way.</h1>
        <p className="text-ink-soft mb-6 leading-relaxed">
          We've sent a link to <span className="text-ink font-medium">{email}</span>. Open it on
          this device to sign in. It works once and expires in 15 minutes.
        </p>

        {devLink && (
          <div className="border border-marigold/50 bg-marigold/10 rounded-lg p-4 text-left mb-6">
            <p className="case-number text-xs text-ink mb-2">DEV MODE — NO MAIL PROVIDER SET</p>
            <a href={devLink} className="text-sm text-seal break-all underline">
              {devLink}
            </a>
          </div>
        )}

        <button
          type="button"
          onClick={() => setState('idle')}
          className="text-sm text-ink-soft hover:text-ink transition-colors"
        >
          Use a different address
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="case-number text-seal text-sm mb-3">SIGN IN</p>
      <h1 className="font-display text-3xl text-ink mb-3">Keep your cases in one place.</h1>
      <p className="text-ink-soft mb-8 leading-relaxed">
        No password. We'll email you a link. Cases you've already filed on this device are added
        to your dashboard automatically when you sign in.
      </p>

      <form onSubmit={submit}>
        <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="signin-email">
          Email address
        </label>
        <input
          id="signin-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-line rounded-md px-4 py-2.5 bg-white text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink"
        />
        {error && <p className="text-sm text-seal mt-2">{error}</p>}

        <button
          type="submit"
          disabled={state === 'sending' || !email.trim()}
          className="mt-5 w-full bg-ink text-paper rounded-full px-6 py-3 font-medium hover:bg-seal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {state === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>

      <p className="text-xs text-ink-soft/70 mt-6 leading-relaxed">
        You can file a complaint without an account. An account only exists so your cases follow
        you between devices and so we can reach you when the other side responds.
      </p>
    </div>
  )
}

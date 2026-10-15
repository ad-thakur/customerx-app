import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { requestSignInCode, signInWithCode } from '../lib/auth'
import { useAuth } from '../lib/AuthContext'

/** Only same-site paths are followed after sign-in, never another origin. */
function safeNext(raw: string | null): string {
  return raw && /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : '/cases'
}

export default function SignIn() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { user, refresh } = useAuth()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | null>(null)
  const [expiresIn, setExpiresIn] = useState(10)
  const [resendIn, setResendIn] = useState(0)
  const codeInput = useRef<HTMLInputElement>(null)

  // Countdown before "Send a new code" unlocks (the server allows one every 30 s).
  useEffect(() => {
    if (resendIn <= 0) return
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendIn])

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus()
  }, [step])

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

  const sendCode = () => {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    requestSignInCode(email.trim())
      .then((r) => {
        setDevCode(r.devCode ?? null)
        setExpiresIn(r.expiresInMinutes ?? 10)
        setCode('')
        setStep('code')
        setResendIn(30)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }

  const verify = (value: string) => {
    if (value.length !== 6) return
    setBusy(true)
    setError(null)
    signInWithCode(email.trim(), value)
      .then(async () => {
        await refresh()
        navigate(next, { replace: true })
      })
      .catch((err: Error) => {
        setError(err.message)
        setCode('')
        codeInput.current?.focus()
      })
      .finally(() => setBusy(false))
  }

  if (step === 'code') {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <p className="case-number text-seal text-sm mb-3">CHECK YOUR EMAIL</p>
        <h1 className="font-display text-3xl text-ink mb-3">Enter your 6-digit code.</h1>
        <p className="text-ink-soft mb-8 leading-relaxed">
          We've sent a code to <span className="text-ink font-medium">{email}</span>. It works once and
          expires in {expiresIn} minutes.
        </p>

        {devCode && (
          <div className="border border-marigold/50 bg-marigold/10 rounded-lg p-4 mb-6">
            <p className="case-number text-xs text-ink mb-1">DEV MODE — NO MAIL PROVIDER SET</p>
            <p className="font-mono text-lg text-seal tracking-widest">{devCode}</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            verify(code)
          }}
        >
          <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="signin-code">
            Sign-in code
          </label>
          <input
            id="signin-code"
            ref={codeInput}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(v)
              // Submits as soon as six digits are in — typed or pasted.
              if (v.length === 6 && !busy) verify(v)
            }}
            placeholder="••••••"
            className="w-full border border-line rounded-md px-4 py-3 bg-white text-ink text-2xl tracking-[0.5em] text-center font-mono placeholder:text-ink-soft/40 focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink"
          />
          {error && <p className="text-sm text-seal mt-2">{error}</p>}

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="mt-5 w-full bg-ink text-paper rounded-full px-6 py-3 font-medium hover:bg-seal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="flex justify-between mt-6 text-sm">
          <button
            type="button"
            onClick={() => {
              setStep('email')
              setError(null)
            }}
            className="text-ink-soft hover:text-ink transition-colors"
          >
            Use a different address
          </button>
          <button
            type="button"
            disabled={resendIn > 0 || busy}
            onClick={sendCode}
            className="text-seal hover:underline disabled:text-ink-soft disabled:no-underline disabled:cursor-not-allowed"
          >
            {resendIn > 0 ? `Send a new code (${resendIn}s)` : 'Send a new code'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md px-6 py-20">
      <p className="case-number text-seal text-sm mb-3">SIGN IN</p>
      <h1 className="font-display text-3xl text-ink mb-3">Keep your cases in one place.</h1>
      <p className="text-ink-soft mb-8 leading-relaxed">
        No password. We'll email you a 6-digit code. Cases you've already filed on this device are added
        to your dashboard automatically when you sign in.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          sendCode()
        }}
      >
        <label className="block text-sm font-medium text-ink mb-1.5" htmlFor="signin-email">
          Email address
        </label>
        <input
          id="signin-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-line rounded-md px-4 py-2.5 bg-white text-ink placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-ink/40 focus:border-ink"
        />
        {error && <p className="text-sm text-seal mt-2">{error}</p>}

        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="mt-5 w-full bg-ink text-paper rounded-full px-6 py-3 font-medium hover:bg-seal transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Sending…' : 'Email me a sign-in code'}
        </button>
      </form>

      <p className="text-xs text-ink-soft/70 mt-6 leading-relaxed">
        You can file a complaint without an account. An account only exists so your cases follow
        you between devices and so we can reach you when the other side responds.
      </p>
    </div>
  )
}

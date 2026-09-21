import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import NewsCard from '../components/NewsCard'
import { useAuth } from '../lib/AuthContext'
import { fetchDrafts, reviewArticle, type NewsItem } from '../lib/newsApi'

export default function ReviewNews() {
  const { user } = useAuth()
  const [drafts, setDrafts] = useState<NewsItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (!user) return
    let alive = true
    fetchDrafts()
      .then((list) => alive && setDrafts(list))
      .catch((e) => alive && setError((e as Error).message))
    return () => {
      alive = false
    }
  }, [user])

  async function decide(id: string, action: 'publish' | 'reject') {
    setBusyId(id)
    setError(null)
    try {
      await reviewArticle(id, action)
      setDrafts((cur) => (cur ? cur.filter((a) => a.id !== id) : cur))
      setDone((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pt-16 pb-20">
      <div className="text-center mb-10">
        <p className="case-number text-seal text-sm mb-5 tracking-wide">REVIEW QUEUE</p>
        <h1 className="font-display text-4xl md:text-5xl leading-[1.15] tracking-tight text-ink mb-5">
          Approve before it goes live.
        </h1>
        <p className="text-lg text-ink-soft max-w-2xl mx-auto">
          The news agent proposes articles daily — nothing appears on{' '}
          <Link to="/news" className="text-seal hover:text-ink transition-colors">
            Consumer Watch
          </Link>{' '}
          until you approve it here. Check the summary, source and tags, then publish or reject.
        </p>
      </div>

      {!user && (
        <div className="text-center border border-line rounded-2xl bg-paper-dim/40 p-10">
          <p className="text-ink-soft mb-5">Sign in to review the agent's proposals.</p>
          <Link
            to="/signin"
            className="inline-block bg-ink text-paper px-5 py-2.5 rounded-full font-medium hover:bg-seal transition-colors"
          >
            Sign in
          </Link>
        </div>
      )}

      {user && error && (
        <div className="border border-seal/40 bg-seal/5 text-seal rounded-2xl p-6 mb-6 text-sm">
          {error}
        </div>
      )}

      {user && !error && drafts === null && (
        <p className="text-ink-soft text-center py-10">Loading the queue…</p>
      )}

      {user && drafts !== null && (
        <>
          <p className="case-number text-[11px] uppercase tracking-wide text-ink-soft mb-4">
            {drafts.length} awaiting review{done > 0 ? ` · ${done} handled this session` : ''}
          </p>

          <div className="flex flex-col gap-5">
            {drafts.map((a) => (
              <NewsCard
                key={a.id}
                article={a}
                footer={
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => decide(a.id, 'reject')}
                      className="px-4 py-1.5 rounded-full text-sm font-medium border border-line text-ink-soft hover:text-seal hover:border-seal/40 transition-colors disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={busyId === a.id}
                      onClick={() => decide(a.id, 'publish')}
                      className="px-4 py-1.5 rounded-full text-sm font-medium bg-verdict text-paper hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {busyId === a.id ? 'Saving…' : 'Approve & publish'}
                    </button>
                  </div>
                }
              />
            ))}
            {drafts.length === 0 && (
              <p className="text-ink-soft text-center py-10">
                Nothing waiting — the agent hasn't proposed anything new since the last review.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBrand } from './BrandShell'
import {
  ago,
  convertSocial,
  draftSocial,
  enableSocial,
  loadSocial,
  replySocial,
  seedSocial,
  setMentionStatus,
  type Mention,
  type MentionKind,
  type SocialFeed,
} from '../../lib/brandApi'

type Filter = 'attention' | 'complaints' | 'questions' | 'handled' | 'all'

const FILTERS: { id: Filter; label: string; test: (m: Mention) => boolean }[] = [
  { id: 'attention', label: 'Needs a reply', test: (m) => m.status === 'new' && m.kind !== 'other' },
  { id: 'complaints', label: 'Complaints', test: (m) => m.kind === 'complaint' },
  { id: 'questions', label: 'Questions', test: (m) => m.kind === 'question' },
  { id: 'handled', label: 'Replied & converted', test: (m) => m.status === 'replied' || m.status === 'converted' },
  { id: 'all', label: 'All', test: (m) => m.status !== 'dismissed' },
]

const KIND: Record<MentionKind, { label: string; cls: string }> = {
  complaint: { label: 'COMPLAINT', cls: 'text-seal border-seal/40 bg-seal/5' },
  question: { label: 'QUESTION', cls: 'text-ink border-ink/25 bg-ink/5' },
  praise: { label: 'PRAISE', cls: 'text-verdict border-verdict/40 bg-verdict/10' },
  other: { label: 'MENTION', cls: 'text-ink-soft border-line bg-white' },
}

function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`
  return String(n)
}

export default function BrandSocial() {
  const { brand, reload } = useBrand()
  const [feed, setFeed] = useState<SocialFeed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('attention')

  const refresh = useCallback(() => {
    loadSocial(brand.id)
      .then(setFeed)
      .catch((e: Error) => setError(e.message))
  }, [brand.id])

  useEffect(() => {
    setFeed(null)
    refresh()
    const t = setInterval(refresh, 60_000)
    return () => clearInterval(t)
  }, [refresh])

  const act = (p: Promise<unknown>) => {
    setBusy(true)
    setError(null)
    p.then(refresh)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  const rows = useMemo(() => {
    if (!feed?.enabled) return []
    const f = FILTERS.find((x) => x.id === filter)!
    // Loudest first: what is reaching the most people right now.
    return feed.mentions.filter(f.test).sort((a, b) => b.visibility - a.visibility)
  }, [feed, filter])

  if (error && !feed) return <p className="text-center text-seal py-24">{error}</p>
  if (!feed) return <p className="text-center text-ink-soft py-24">Loading…</p>

  if (!feed.enabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
        <p className="case-number text-seal text-xs mb-1">ADD-ON · SOCIAL LISTENING</p>
        <h1 className="font-display text-3xl text-ink mb-3">Complaints don’t only arrive in your inbox.</h1>
        <p className="text-ink-soft leading-relaxed mb-6">
          Every post on X that tags your handle, and every Reddit thread that names {brand.name}, collected in one place
          — ranked by how many people it’s reaching, sorted into complaints, questions and praise, with a reply drafted
          for each. A complaint can be turned into a tracked case with the full analysis in one click.
        </p>
        <ul className="grid sm:grid-cols-3 gap-3 mb-8 text-sm">
          {[
            ['X mentions', 'Every post tagging your handle, with replies sent from your account.'],
            ['Reddit threads', 'Posts and comments naming your brand, across subreddits.'],
            ['Into the complaint desk', 'Take it private, then track it like any other complaint.'],
          ].map(([t, d]) => (
            <li key={t} className="border border-line rounded-lg bg-white/70 p-4">
              <p className="font-medium text-ink mb-1">{t}</p>
              <p className="text-ink-soft">{d}</p>
            </li>
          ))}
        </ul>
        <div className="border border-marigold/50 bg-marigold/10 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium text-ink">Social listening is billed separately from the complaint desk.</p>
            <p className="text-sm text-ink-soft">Enable it to try it with sample posts; we’ll confirm pricing before going live.</p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(enableSocial(brand.id).then(reload))}
            className="bg-ink text-paper rounded-full px-5 py-2.5 font-medium hover:bg-seal transition-colors disabled:opacity-60"
          >
            Enable social listening
          </button>
        </div>
        {error && <p className="text-sm text-seal mt-3">{error}</p>}
      </div>
    )
  }

  const s = feed.stats

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="case-number text-seal text-xs mb-1">SOCIAL · X & REDDIT</p>
          <h1 className="font-display text-3xl text-ink">What people are saying about {brand.name}</h1>
        </div>
      </div>

      {/* Connections */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Connection
          name="X"
          detail="Posts tagging your official handle"
          note="Connect your X account to pull mentions and reply from the dashboard. Requires X API access (pay-per-use)."
        />
        <Connection
          name="Reddit"
          detail={`Posts naming ${feed.connections.reddit.keywords.slice(0, 3).join(', ')}`}
          note="Read-only monitoring; replies are posted from your Reddit account. Requires Reddit commercial API approval."
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Kpi label="Mentions, last 7 days" value={String(s.last7d)} />
        <Kpi label="Complaints" value={String(s.complaints)} />
        <Kpi label="Waiting for a reply" value={String(s.unanswered)} alert={s.unanswered > 0} />
        <Kpi label="High visibility" value={String(s.highVisibility)} note="unanswered, reach ≥ 60" alert={s.highVisibility > 0} />
        <Kpi label="Audience of open posts" value={compact(s.reach)} note="followers on X" />
      </div>

      {feed.mentions.length === 0 ? (
        <div className="border border-line rounded-lg bg-white/70 p-10 text-center">
          <p className="font-display text-xl text-ink mb-2">No mentions yet.</p>
          <p className="text-ink-soft mb-6">Load sample posts to see how the inbox works before your accounts are connected.</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(seedSocial(brand.id))}
            className="bg-seal text-paper rounded-full px-5 py-2.5 font-medium hover:bg-ink transition-colors disabled:opacity-60"
          >
            Load sample posts
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  filter === f.id ? 'bg-ink text-paper border-ink' : 'border-line text-ink-soft hover:border-ink/40'
                }`}
              >
                {f.label} <span className="opacity-60">{feed.mentions.filter(f.test).length}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-seal mb-3">{error}</p>}
          <ul className="space-y-3">
            {rows.length === 0 && <li className="text-center text-ink-soft py-10 text-sm">Nothing here.</li>}
            {rows.map((m) => (
              <MentionCard key={m.id} m={m} busy={busy} act={act} />
            ))}
          </ul>
          {feed.mentions.some((m) => m.sample) && (
            <p className="text-xs text-ink-soft mt-4">
              Showing sample posts. Live mentions appear here once your X and Reddit accounts are connected.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function MentionCard({ m, busy, act }: { m: Mention; busy: boolean; act: (p: Promise<unknown>) => void }) {
  const { brand } = useBrand()
  const navigate = useNavigate()
  const [text, setText] = useState<string | null>(null)
  const [posted, setPosted] = useState<string | null>(null)
  const limit = m.platform === 'x' ? 280 : 5000
  const k = KIND[m.kind]

  const draft = () => {
    draftSocial(brand.id, m.id)
      .then((r) => setText(r.text))
      .catch(() => setText(''))
  }

  return (
    <li className={`border rounded-lg bg-white/80 p-4 ${m.visibility >= 60 && m.status === 'new' ? 'border-seal/40' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformBadge p={m.platform} />
          <div className="min-w-0">
            <p className="text-sm text-ink font-medium truncate">
              {m.platform === 'x' ? m.authorName : `u/${m.authorHandle}`}{' '}
              {m.platform === 'x' && <span className="text-ink-soft font-normal">@{m.authorHandle}</span>}
            </p>
            <p className="text-xs text-ink-soft">
              {m.platform === 'x' ? `${compact(m.authorFollowers)} followers` : m.community} · {ago(m.postedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`case-number text-[10px] tracking-wide px-2 py-0.5 rounded-full border ${k.cls}`}>{k.label}</span>
          <Visibility v={m.visibility} />
        </div>
      </div>

      <p className="text-[15px] text-ink leading-relaxed mt-3 whitespace-pre-wrap">{m.text}</p>

      <p className="text-xs text-ink-soft mt-2">
        {m.platform === 'x'
          ? `${compact(m.likes)} likes · ${compact(m.reposts)} reposts · ${compact(m.replies)} replies`
          : `${compact(m.likes)} upvotes · ${compact(m.replies)} comments`}
      </p>

      {m.reply && (
        <div className="mt-3 border-l-2 border-ink/30 pl-3 text-sm">
          <p className="text-xs text-ink-soft mb-0.5">
            Your reply · {m.reply.author} · {ago(m.reply.at)}
          </p>
          <p className="text-ink whitespace-pre-wrap">{m.reply.text}</p>
        </div>
      )}
      {posted && (
        <a href={posted} target="_blank" rel="noreferrer" className="inline-block mt-2 text-sm text-seal underline">
          Post this reply on {m.platform === 'x' ? 'X' : 'Reddit'} →
        </a>
      )}

      {text !== null && (
        <div className="mt-3">
          <textarea
            rows={m.platform === 'x' ? 3 : 5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full border border-line rounded px-3 py-2 bg-white text-sm"
          />
          <div className="flex items-center justify-between mt-1.5 gap-2 flex-wrap">
            <span className={`text-xs ${text.length > limit ? 'text-seal' : 'text-ink-soft'}`}>
              {m.platform === 'x' ? `${text.length}/280` : ''}
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setText(null)} className="text-sm text-ink-soft px-3">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !text.trim() || text.length > limit}
                onClick={() =>
                  act(
                    replySocial(brand.id, m.id, text).then((r) => {
                      setText(null)
                      setPosted(r.postLink)
                    }),
                  )
                }
                className="bg-ink text-paper rounded-full px-4 py-1.5 text-sm font-medium hover:bg-seal transition-colors disabled:opacity-50"
              >
                Save reply
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {text === null && m.status !== 'dismissed' && (
          <button type="button" onClick={draft} className="text-sm border border-ink text-ink rounded-full px-3.5 py-1 hover:bg-ink hover:text-paper transition-colors">
            {m.reply ? 'Reply again' : 'Draft reply'}
          </button>
        )}
        {m.complaintId ? (
          <Link to={`/brand/c/${m.complaintId}`} className="text-sm border border-verdict/50 text-verdict rounded-full px-3.5 py-1 bg-verdict/10">
            Tracked as {m.complaintId} →
          </Link>
        ) : (
          m.kind === 'complaint' &&
          m.status !== 'dismissed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act(convertSocial(brand.id, m.id).then((r) => navigate(`/brand/c/${r.complaintId}`)))}
              className="text-sm border border-line text-ink rounded-full px-3.5 py-1 hover:border-ink"
            >
              Convert to complaint
            </button>
          )
        )}
        {m.status === 'dismissed' ? (
          <button type="button" disabled={busy} onClick={() => act(setMentionStatus(brand.id, m.id, 'new'))} className="text-sm text-ink-soft underline px-1">
            Restore
          </button>
        ) : (
          !m.complaintId && (
            <button type="button" disabled={busy} onClick={() => act(setMentionStatus(brand.id, m.id, 'dismissed'))} className="text-sm text-ink-soft hover:text-ink px-1">
              Dismiss
            </button>
          )
        )}
        {m.url && (
          <a href={m.url} target="_blank" rel="noreferrer" className="text-sm text-ink-soft underline px-1">
            Open on {m.platform === 'x' ? 'X' : 'Reddit'}
          </a>
        )}
      </div>
    </li>
  )
}

function PlatformBadge({ p }: { p: 'x' | 'reddit' }) {
  return p === 'x' ? (
    <span className="w-8 h-8 shrink-0 rounded-full bg-ink text-paper flex items-center justify-center text-sm font-semibold" aria-label="X">
      𝕏
    </span>
  ) : (
    <span className="w-8 h-8 shrink-0 rounded-full bg-[#FF4500] text-white flex items-center justify-center text-[11px] font-bold" aria-label="Reddit">
      r/
    </span>
  )
}

function Visibility({ v }: { v: number }) {
  const tone = v >= 60 ? 'bg-seal' : v >= 35 ? 'bg-marigold' : 'bg-ink-soft/40'
  return (
    <span className="flex items-center gap-1.5" title="Visibility: audience and engagement, 0–100">
      <span className="w-12 h-1.5 rounded-full bg-line overflow-hidden">
        <span className={`block h-full ${tone}`} style={{ width: `${v}%` }} />
      </span>
      <span className="case-number text-[11px] text-ink-soft w-6">{v}</span>
    </span>
  )
}

function Connection({ name, detail, note }: { name: string; detail: string; note: string }) {
  return (
    <div className="border border-line rounded-lg bg-white/70 p-4">
      <div className="flex justify-between items-center gap-2">
        <p className="font-medium text-ink">{name}</p>
        <span className="case-number text-[10px] text-ink-soft border border-line rounded-full px-2 py-0.5">NOT CONNECTED</span>
      </div>
      <p className="text-sm text-ink mt-1">{detail}</p>
      <p className="text-xs text-ink-soft mt-1">{note}</p>
    </div>
  )
}

function Kpi({ label, value, note, alert }: { label: string; value: string; note?: string; alert?: boolean }) {
  return (
    <div className="border border-line rounded-lg bg-white/70 px-4 py-3.5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`font-display text-2xl font-semibold mt-1 ${alert ? 'text-seal' : 'text-ink'}`}>{value}</p>
      {note && <p className="text-[11px] mt-0.5 text-ink-soft">{note}</p>}
    </div>
  )
}

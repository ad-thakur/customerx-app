import pg from 'pg'

const { Pool } = pg

// Same connection convention as db.ts — Railway injects DATABASE_URL.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export interface PrecedentCase {
  caseNumber: string
  commission: string
  category: string
  complainant: string | null
  respondent: string | null
  complainantAdvocate: string | null
  respondentAdvocate: string | null
  filingDate: string | null
  disposalDate: string | null
  judgmentDate: string | null
  outcome: string | null
  judgmentText: string | null
  rawMeta: unknown
}

export async function initPrecedentTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS precedent_cases (
      case_number TEXT PRIMARY KEY,
      commission TEXT NOT NULL,
      category TEXT NOT NULL,
      complainant TEXT,
      respondent TEXT,
      complainant_advocate TEXT,
      respondent_advocate TEXT,
      filing_date DATE,
      disposal_date DATE,
      judgment_date DATE,
      outcome TEXT,
      judgment_text TEXT,
      raw_meta JSONB,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS precedent_cases_category_idx ON precedent_cases (category)
  `)
  // Full-text index over the judgment body for later "similar cases" lookups.
  await pool.query(`
    CREATE INDEX IF NOT EXISTS precedent_cases_fts_idx
      ON precedent_cases
      USING GIN (to_tsvector('english', coalesce(judgment_text, '')))
  `)
}

export async function upsertPrecedent(p: PrecedentCase): Promise<'inserted' | 'updated'> {
  const res = await pool.query<{ inserted: boolean }>(
    `
    INSERT INTO precedent_cases (
      case_number, commission, category, complainant, respondent,
      complainant_advocate, respondent_advocate,
      filing_date, disposal_date, judgment_date,
      outcome, judgment_text, raw_meta
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (case_number) DO UPDATE SET
      outcome = EXCLUDED.outcome,
      disposal_date = EXCLUDED.disposal_date,
      judgment_date = EXCLUDED.judgment_date,
      judgment_text = COALESCE(EXCLUDED.judgment_text, precedent_cases.judgment_text),
      raw_meta = EXCLUDED.raw_meta,
      ingested_at = now()
    RETURNING (xmax = 0) AS inserted
    `,
    [
      p.caseNumber,
      p.commission,
      p.category,
      p.complainant,
      p.respondent,
      p.complainantAdvocate,
      p.respondentAdvocate,
      p.filingDate,
      p.disposalDate,
      p.judgmentDate,
      p.outcome,
      p.judgmentText,
      JSON.stringify(p.rawMeta),
    ],
  )
  return res.rows[0].inserted ? 'inserted' : 'updated'
}

export async function countPrecedents(category?: string): Promise<number> {
  const res = category
    ? await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM precedent_cases WHERE category = $1`,
        [category],
      )
    : await pool.query<{ count: string }>(`SELECT count(*) AS count FROM precedent_cases`)
  return Number(res.rows[0].count)
}

/**
 * Terms that appear in essentially every judgment in a corpus made entirely of
 * consumer cases. Left in the query they match everything and contribute rank,
 * which is how a washing-machine complaint ended up matched to agricultural
 * disputes: "consumer protection act 2019" alone is enough to hit every row.
 */
const BOILERPLATE = new Set([
  'consumer',
  'consumers',
  'protection',
  'act',
  'acts',
  '2019',
  '1986',
  'section',
  'sections',
  'complaint',
  'complaints',
  'complainant',
  'opposite',
  'party',
  'parties',
  'commission',
  'district',
  'state',
  'national',
  'india',
  'indian',
  'case',
  'cases',
  'order',
  'judgment',
  'judgement',
  'appeal',
  'revision',
  'petition',
])

/**
 * Strips boilerplate and punctuation, leaving only terms that can actually
 * discriminate between cases. Returns '' when nothing discriminating remains —
 * the caller must treat that as "no basis to search", not "search for anything".
 */
export function discriminatingTerms(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !BOILERPLATE.has(w))
    .join(' ')
    .trim()
}

/**
 * Minimum ts_rank a row must clear to be shown. Ranks are normalised by
 * document length (flag 32 → rank/(rank+1)), so this is roughly comparable
 * across judgments of very different sizes.
 *
 * This is a floor, not real relevance matching — it exists to stop obviously
 * unrelated cases being presented as comparable. Proper subject-matter
 * matching (product/service taxonomy or embeddings over the corpus) is the
 * real fix and is not implemented yet. Tune against the ingested corpus.
 */
const MIN_RANK = Number(process.env.PRECEDENT_MIN_RANK ?? 0.05)

export type PrecedentHit = Pick<
  PrecedentCase,
  'caseNumber' | 'complainant' | 'respondent' | 'outcome'
> & {
  judgmentDate: Date | string | null // pg returns DATE columns as Date objects
  snippet: string
  rank: number
  category: string
}

/**
 * Full-text lookup over the ingested e-Jagriti corpus.
 *
 * `categories` is the real relevance control:
 *
 *   - an array  → only judgments filed under those categories are considered
 *   - []        → nothing is in scope, so nothing is returned
 *   - null      → no restriction, search the whole corpus
 *
 * The distinction between [] and null matters. A ground with no mapped
 * category must return nothing, not everything: keyword rank alone was never
 * enough — every judgment in a consumer corpus shares most of its vocabulary —
 * which is how a washing-machine complaint used to surface agricultural
 * disputes (AGRICULTURE is a populated NCDRC category).
 *
 * Returns an empty array — deliberately, not a filler set — when the query has
 * no discriminating terms or nothing clears MIN_RANK. Callers should render
 * "No similar cases have been filed." rather than showing weak matches, since
 * an irrelevant precedent is worse than none in a legal context.
 */
export async function searchLocalPrecedents(
  query: string,
  limit = 5,
  categories: string[] | null = null,
): Promise<PrecedentHit[]> {
  const terms = discriminatingTerms(query)
  if (!terms) return []

  // Restricted to an empty set — there is nothing this ground could match.
  if (categories !== null && categories.length === 0) return []
  const restrict = categories !== null

  const res = await pool.query(
    `
    WITH q AS (SELECT plainto_tsquery('english', $1) AS tsq)
    SELECT case_number AS "caseNumber",
           complainant,
           respondent,
           outcome,
           category,
           judgment_date AS "judgmentDate",
           ts_headline('english', coalesce(judgment_text, ''), q.tsq,
                       'MaxWords=40, MinWords=20') AS snippet,
           ts_rank(to_tsvector('english', coalesce(judgment_text, '')), q.tsq, 32) AS rank
    FROM precedent_cases, q
    WHERE to_tsvector('english', coalesce(judgment_text, '')) @@ q.tsq
      AND ts_rank(to_tsvector('english', coalesce(judgment_text, '')), q.tsq, 32) >= $2
      AND ($4::text[] IS NULL OR category = ANY($4::text[]))
    ORDER BY rank DESC
    LIMIT $3
    `,
    [terms, MIN_RANK, limit, restrict ? categories : null],
  )
  return res.rows
}

export async function closePrecedentPool(): Promise<void> {
  await pool.end()
}

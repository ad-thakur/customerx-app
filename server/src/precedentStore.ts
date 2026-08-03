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
 * Simple full-text lookup — ready to back /api/precedents once the corpus is in place.
 */
export async function searchLocalPrecedents(
  query: string,
  limit = 5,
): Promise<
  Array<
    Pick<PrecedentCase, 'caseNumber' | 'complainant' | 'respondent' | 'outcome'> & {
      judgmentDate: Date | string | null // pg returns DATE columns as Date objects
      snippet: string
    }
  >
> {
  const res = await pool.query(
    `
    SELECT case_number AS "caseNumber",
           complainant,
           respondent,
           outcome,
           judgment_date AS "judgmentDate",
           ts_headline('english', coalesce(judgment_text, ''), plainto_tsquery('english', $1),
                       'MaxWords=40, MinWords=20') AS snippet
    FROM precedent_cases
    WHERE to_tsvector('english', coalesce(judgment_text, '')) @@ plainto_tsquery('english', $1)
    ORDER BY ts_rank(to_tsvector('english', coalesce(judgment_text, '')), plainto_tsquery('english', $1)) DESC
    LIMIT $2
    `,
    [query, limit],
  )
  return res.rows
}

export async function closePrecedentPool(): Promise<void> {
  await pool.end()
}

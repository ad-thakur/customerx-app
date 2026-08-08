import pg from 'pg'
import type { CaseRecord } from './types.js'

const { Pool } = pg

// Railway injects DATABASE_URL when a Postgres service is attached.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
})

export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      intake JSONB NOT NULL,
      routing JSONB NOT NULL,
      clock_offset_days INT NOT NULL DEFAULT 0,
      assessment JSONB,
      notice JSONB,
      resolution JSONB
    )
  `)
  // Added with the editable-notice work; existing deployments get it here
  // rather than through a migration tool.
  await pool.query(`ALTER TABLE cases ADD COLUMN IF NOT EXISTS notice_draft JSONB`)
}

interface CaseRow {
  id: string
  token: string
  created_at: Date
  intake: CaseRecord['intake']
  routing: CaseRecord['routing']
  clock_offset_days: number
  assessment: CaseRecord['assessment']
  notice_draft: CaseRecord['noticeDraft']
  notice: CaseRecord['notice']
  resolution: CaseRecord['resolution']
}

function rowToRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    intake: row.intake,
    routing: row.routing,
    clockOffsetDays: row.clock_offset_days,
    assessment: row.assessment,
    noticeDraft: row.notice_draft,
    notice: row.notice,
    resolution: row.resolution,
  }
}

export async function insertCase(record: {
  id: string
  token: string
  intake: CaseRecord['intake']
  routing: CaseRecord['routing']
}): Promise<CaseRecord> {
  const res = await pool.query<CaseRow>(
    `INSERT INTO cases (id, token, intake, routing) VALUES ($1, $2, $3, $4) RETURNING *`,
    [record.id, record.token, JSON.stringify(record.intake), JSON.stringify(record.routing)],
  )
  return rowToRecord(res.rows[0])
}

export async function findCase(id: string): Promise<{ record: CaseRecord; token: string } | null> {
  const res = await pool.query<CaseRow>(`SELECT * FROM cases WHERE id = $1`, [id])
  if (res.rows.length === 0) return null
  return { record: rowToRecord(res.rows[0]), token: res.rows[0].token }
}

export async function countCases(): Promise<number> {
  const res = await pool.query<{ count: string }>(`SELECT count(*) AS count FROM cases`)
  return Number(res.rows[0].count)
}

export async function patchCase(
  id: string,
  patch: Partial<
    Pick<CaseRecord, 'clockOffsetDays' | 'assessment' | 'noticeDraft' | 'notice' | 'resolution'>
  >,
): Promise<CaseRecord | null> {
  const sets: string[] = []
  const values: unknown[] = []
  let i = 1
  if (patch.clockOffsetDays !== undefined) {
    sets.push(`clock_offset_days = $${i++}`)
    values.push(patch.clockOffsetDays)
  }
  if (patch.assessment !== undefined) {
    sets.push(`assessment = $${i++}`)
    values.push(JSON.stringify(patch.assessment))
  }
  if (patch.noticeDraft !== undefined) {
    sets.push(`notice_draft = $${i++}`)
    values.push(JSON.stringify(patch.noticeDraft))
  }
  if (patch.notice !== undefined) {
    sets.push(`notice = $${i++}`)
    values.push(JSON.stringify(patch.notice))
  }
  if (patch.resolution !== undefined) {
    sets.push(`resolution = $${i++}`)
    values.push(JSON.stringify(patch.resolution))
  }
  if (sets.length === 0) {
    const found = await findCase(id)
    return found?.record ?? null
  }
  values.push(id)
  const res = await pool.query<CaseRow>(
    `UPDATE cases SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    values,
  )
  return res.rows.length ? rowToRecord(res.rows[0]) : null
}

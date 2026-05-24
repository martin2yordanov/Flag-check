#!/usr/bin/env node
// One-shot schema bootstrap. Run with: node --env-file=.env.local scripts/init-db.mjs
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set (try: node --env-file=.env.local scripts/init-db.mjs)')
  process.exit(1)
}

const sql = neon(url)

const statements = [
  `CREATE TABLE IF NOT EXISTS user_data (
     user_id TEXT PRIMARY KEY,
     data JSONB NOT NULL DEFAULT '{}'::jsonb,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS user_data_updated_at_idx ON user_data (updated_at DESC)`,
]

for (const stmt of statements) {
  await sql.query(stmt)
  console.log('OK:', stmt.split('\n')[0].trim())
}

const rows = await sql`SELECT COUNT(*)::int AS n FROM user_data`
console.log(`user_data rows: ${rows[0].n}`)

// Vercel serverless function: GET/PUT user state, scoped by Clerk user.
// Auth: Bearer <Clerk session token>. Storage: Neon Postgres (one row per user).

import { verifyToken } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

async function authUserId(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) return null
  try {
    const payload = await verifyToken(m[1], {
      secretKey: process.env.CLERK_SECRET_KEY,
    })
    return payload?.sub || null
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  // CORS for same-origin Vercel deploy is not needed; this is only called from the SPA.
  res.setHeader('Cache-Control', 'no-store')

  const userId = await authUserId(req)
  if (!userId) {
    res.status(401).json({ error: 'unauthorized' })
    return
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT data, updated_at FROM user_data WHERE user_id = ${userId}`
      if (rows.length === 0) {
        res.status(200).json({ data: null, updated_at: null })
        return
      }
      res.status(200).json({ data: rows[0].data, updated_at: rows[0].updated_at })
      return
    }

    if (req.method === 'PUT') {
      // Vercel parses JSON bodies automatically when content-type is set.
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const data = body?.data
      if (!data || typeof data !== 'object') {
        res.status(400).json({ error: 'body.data must be an object' })
        return
      }
      const rows = await sql`
        INSERT INTO user_data (user_id, data, updated_at)
        VALUES (${userId}, ${data}, NOW())
        ON CONFLICT (user_id) DO UPDATE
          SET data = EXCLUDED.data, updated_at = NOW()
        RETURNING updated_at
      `
      res.status(200).json({ ok: true, updated_at: rows[0].updated_at })
      return
    }

    res.setHeader('Allow', 'GET, PUT')
    res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('api/data error:', e)
    res.status(500).json({ error: 'internal_error', message: e?.message || String(e) })
  }
}

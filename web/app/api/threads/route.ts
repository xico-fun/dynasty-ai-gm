import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getSessionLeague } from "@/lib/session"

/**
 * List the current user's recent chat threads for the active league.
 * Returns the same shape the frontend already expects:
 *   { threads: [{ thread_id, title, custom_title, created_at, starred }] }
 * where `title` is the auto-title (first user message) and `custom_title`
 * is an explicit rename (nullable).
 */
export async function GET() {
  const ctx = await getSessionLeague()
  if (!ctx) return NextResponse.json({ threads: [] })

  const result = await pool.query(
    `SELECT
        t.id AS thread_id,
        t.title AS custom_title,
        t.starred,
        MIN(m.created_at) AS created_at,
        (SELECT content FROM chat_messages m2
           WHERE m2.thread_id = t.id AND m2.role = 'user'
           ORDER BY m2.created_at ASC LIMIT 1) AS auto_title
       FROM chat_threads t
       LEFT JOIN chat_messages m ON m.thread_id = t.id
      WHERE t.user_id = $1 AND t.league_id = $2
      GROUP BY t.id
      ORDER BY t.starred DESC, MAX(m.created_at) DESC NULLS LAST
      LIMIT 30`,
    [ctx.userId, ctx.leagueUuid]
  )

  const threads = result.rows.map((r) => ({
    thread_id: r.thread_id,
    title: (r.auto_title || "Untitled").slice(0, 80),
    custom_title: r.custom_title,
    created_at: r.created_at,
    starred: r.starred,
  }))

  return NextResponse.json({ threads })
}

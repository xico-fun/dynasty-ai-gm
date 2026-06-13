import { NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getSessionLeague } from "@/lib/session"

/** Return persisted message history for a thread the user owns. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionLeague()
  if (!ctx) return NextResponse.json({ thread_id: null, messages: [] })

  const { id: threadId } = await params

  const result = await pool.query(
    `SELECT m.role, m.content
       FROM chat_messages m
       JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.thread_id = $1 AND t.user_id = $2
      ORDER BY m.created_at ASC`,
    [threadId, ctx.userId]
  )

  return NextResponse.json({
    thread_id: threadId,
    messages: result.rows.map((r) => ({ role: r.role, content: r.content })),
  })
}

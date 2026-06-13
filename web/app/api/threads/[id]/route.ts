import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"
import { getSessionLeague } from "@/lib/session"

/** Update starred / custom title for a thread the user owns. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionLeague()
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 })

  const { id: threadId } = await params
  const { starred, custom_title } = await req.json()

  const result = await pool.query(
    `UPDATE chat_threads
        SET starred = $1, title = $2, updated_at = now()
      WHERE id = $3 AND user_id = $4`,
    [Boolean(starred), custom_title ?? null, threadId, ctx.userId]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}

/** Delete a thread (messages cascade) the user owns. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionLeague()
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 })

  const { id: threadId } = await params

  await pool.query(
    `DELETE FROM chat_threads WHERE id = $1 AND user_id = $2`,
    [threadId, ctx.userId]
  )
  return NextResponse.json({ ok: true })
}

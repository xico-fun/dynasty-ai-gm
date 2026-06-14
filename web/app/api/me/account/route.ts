import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { pool } from "@/lib/db"

/**
 * Permanently delete the authenticated user's account. All rows that reference
 * the user (memberships, strategy, untouchables, chat threads/messages, OAuth
 * accounts, sessions) cascade-delete via their foreign keys. Shared league rows
 * are left intact.
 */
export async function DELETE() {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  await pool.query("DELETE FROM users WHERE id = $1", [userId])
  return NextResponse.json({ ok: true })
}

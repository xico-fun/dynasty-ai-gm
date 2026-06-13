import { auth } from "@/auth"
import { pool } from "@/lib/db"

export type SessionLeague = {
  userId: string
  leagueUuid: string
}

/**
 * Resolve the authenticated user and their active league's internal UUID.
 * Returns null if there's no session or the user hasn't onboarded a league.
 * Use this in any route that reads/writes data scoped to a user + league.
 */
export async function getSessionLeague(): Promise<SessionLeague | null> {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) return null

  const result = await pool.query(
    `SELECT league_id FROM user_leagues
      WHERE user_id = $1 AND is_active = true
      LIMIT 1`,
    [userId]
  )
  if (result.rows.length === 0) return null

  return { userId, leagueUuid: result.rows[0].league_id }
}

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { pool } from "@/lib/db"
import { formatStrategyForPrompt } from "@/lib/strategy"

/**
 * Resolve the authenticated user's active league context from the database.
 * This is the authoritative source — the browser forwards these values to the
 * Python backend as headers, but they originate here, from the session.
 */
export async function GET() {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const result = await pool.query(
    `SELECT l.id AS league_uuid, l.sleeper_league_id, l.league_name, l.season,
            ul.sleeper_username, ul.sleeper_user_id
       FROM user_leagues ul
       JOIN leagues l ON l.id = ul.league_id
      WHERE ul.user_id = $1 AND ul.is_active = true
      LIMIT 1`,
    [userId]
  )

  if (result.rows.length === 0) {
    // Logged in but hasn't onboarded a league yet
    return NextResponse.json({ hasLeague: false }, { status: 200 })
  }

  const row = result.rows[0]

  // Pull the user's strategy for this league and format it for the agents.
  const stratRes = await pool.query(
    `SELECT team_stage, offense_prefs, player_prefs, rookie_vs_vet, custom_notes
       FROM user_strategy
      WHERE user_id = $1 AND league_id = $2
      LIMIT 1`,
    [userId, row.league_uuid]
  )
  const strategy = formatStrategyForPrompt(stratRes.rows[0] ?? null)

  return NextResponse.json({
    hasLeague: true,
    leagueId: row.sleeper_league_id,
    leagueName: row.league_name,
    season: row.season,
    username: row.sleeper_username,
    sleeperUserId: row.sleeper_user_id,
    strategy,
  })
}

import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { pool } from "@/lib/db"

/**
 * Everything the account page needs: identity, connected leagues, and the
 * current strategy for the active league (prefs split back into arrays for
 * the chip editors).
 */
export async function GET() {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const userRes = await pool.query(
    `SELECT username, email FROM users WHERE id = $1`,
    [userId]
  )
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found." }, { status: 404 })
  }
  const user = userRes.rows[0]

  const leaguesRes = await pool.query(
    `SELECT l.id AS league_uuid, l.sleeper_league_id, l.league_name, l.season,
            ul.sleeper_username, ul.is_active
       FROM user_leagues ul
       JOIN leagues l ON l.id = ul.league_id
      WHERE ul.user_id = $1
      ORDER BY ul.is_active DESC, ul.joined_at ASC`,
    [userId]
  )
  const leagues = leaguesRes.rows.map((r) => ({
    leagueUuid: r.league_uuid,
    sleeperLeagueId: r.sleeper_league_id,
    leagueName: r.league_name,
    season: r.season,
    sleeperUsername: r.sleeper_username,
    isActive: r.is_active,
  }))
  const activeLeague = leagues.find((l) => l.isActive) ?? null

  let strategy = null
  if (activeLeague) {
    const sRes = await pool.query(
      `SELECT team_stage, offense_prefs, player_prefs, rookie_vs_vet,
              custom_notes, share_with_league
         FROM user_strategy
        WHERE user_id = $1 AND league_id = $2
        LIMIT 1`,
      [userId, activeLeague.leagueUuid]
    )
    const s = sRes.rows[0]
    if (s) {
      const split = (v: string | null) =>
        v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []
      strategy = {
        teamStage: s.team_stage ?? "",
        offensePrefs: split(s.offense_prefs),
        playerPrefs: split(s.player_prefs),
        rookieVsVet: s.rookie_vs_vet ?? "balanced",
        customNotes: s.custom_notes ?? "",
        shareWithLeague: s.share_with_league ?? false,
      }
    }
  }

  return NextResponse.json({
    username: user.username,
    email: user.email,
    leagues,
    activeLeague,
    strategy,
  })
}

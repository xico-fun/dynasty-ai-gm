import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { pool } from "@/lib/db"

const SLEEPER = "https://api.sleeper.app/v1"

/**
 * Validate a Sleeper league ID, determine whether the current user would be
 * the first member from this league or joining an existing one, and return the
 * list of teams so the user can identify which one is theirs.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const { leagueId } = await req.json()
  const cleanId = String(leagueId ?? "").trim()
  if (!cleanId) {
    return NextResponse.json({ error: "Enter a league ID." }, { status: 400 })
  }

  // 1. Validate the league exists on Sleeper
  const leagueRes = await fetch(`${SLEEPER}/league/${cleanId}`)
  if (!leagueRes.ok) {
    return NextResponse.json(
      { error: "We couldn't find a Sleeper league with that ID. Double-check and try again." },
      { status: 404 }
    )
  }
  const league = await leagueRes.json()
  if (!league?.league_id) {
    return NextResponse.json(
      { error: "That doesn't look like a valid league ID." },
      { status: 404 }
    )
  }

  // 2. Fetch the league's teams/users
  const usersRes = await fetch(`${SLEEPER}/league/${cleanId}/users`)
  const sleeperUsers = usersRes.ok ? await usersRes.json() : []
  const teams = (sleeperUsers as Record<string, unknown>[]).map((u) => ({
    sleeperUserId: u.user_id as string,
    displayName: (u.display_name as string) ?? "Unknown",
    teamName:
      ((u.metadata as Record<string, unknown> | null)?.team_name as string) ||
      (u.display_name as string) ||
      "Unknown",
  }))

  // 3. Check whether anyone from this league has already onboarded
  const existing = await pool.query(
    `SELECT ul.id, ul.sleeper_user_id
       FROM user_leagues ul
       JOIN leagues l ON l.id = ul.league_id
      WHERE l.sleeper_league_id = $1`,
    [cleanId]
  )
  const memberCount = existing.rows.length
  const takenSleeperIds = existing.rows
    .map((r) => r.sleeper_user_id)
    .filter(Boolean)

  return NextResponse.json({
    leagueId: cleanId,
    leagueName: league.name,
    season: league.season,
    sport: league.sport ?? "nfl",
    isFirstInLeague: memberCount === 0,
    memberCount,
    teams,
    takenSleeperIds,
  })
}

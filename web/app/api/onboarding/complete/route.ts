import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { pool } from "@/lib/db"

/**
 * Finalize onboarding: upsert the league, create the user's membership, and
 * save their strategy answers — all in a single transaction.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = (session?.user as { id?: string })?.id
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const body = await req.json()
  const {
    leagueId,
    leagueName,
    season,
    sport,
    sleeperUserId,
    sleeperDisplayName,
    strategy,
  } = body

  if (!leagueId || !sleeperUserId) {
    return NextResponse.json({ error: "Missing league or team selection." }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Upsert league, return its uuid
    const leagueRow = await client.query(
      `INSERT INTO leagues (sleeper_league_id, league_name, season, sport)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sleeper_league_id)
       DO UPDATE SET league_name = EXCLUDED.league_name, season = EXCLUDED.season
       RETURNING id`,
      [String(leagueId), leagueName ?? null, season ?? null, sport ?? "nfl"]
    )
    const leagueUuid = leagueRow.rows[0].id

    // Make sure this Sleeper team isn't already claimed by another account
    const claimed = await client.query(
      `SELECT u.id FROM user_leagues ul
         JOIN users u ON u.id = ul.user_id
        WHERE ul.league_id = $1 AND ul.sleeper_user_id = $2 AND ul.user_id <> $3`,
      [leagueUuid, String(sleeperUserId), userId]
    )
    if (claimed.rows.length > 0) {
      await client.query("ROLLBACK")
      return NextResponse.json(
        { error: "That team has already been claimed by another member." },
        { status: 409 }
      )
    }

    // Mark any existing active league for this user inactive, activate this one
    await client.query(
      `UPDATE user_leagues SET is_active = false WHERE user_id = $1`,
      [userId]
    )

    // Create or update this user's membership in the league
    await client.query(
      `INSERT INTO user_leagues (user_id, league_id, sleeper_user_id, sleeper_username, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (user_id, league_id)
       DO UPDATE SET sleeper_user_id = EXCLUDED.sleeper_user_id,
                     sleeper_username = EXCLUDED.sleeper_username,
                     is_active = true`,
      [userId, leagueUuid, String(sleeperUserId), sleeperDisplayName ?? null]
    )

    // Save strategy
    const s = strategy ?? {}
    await client.query(
      `INSERT INTO user_strategy
         (user_id, league_id, team_stage, offense_prefs, player_prefs, rookie_vs_vet, custom_notes, share_with_league)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, league_id)
       DO UPDATE SET team_stage = EXCLUDED.team_stage,
                     offense_prefs = EXCLUDED.offense_prefs,
                     player_prefs = EXCLUDED.player_prefs,
                     rookie_vs_vet = EXCLUDED.rookie_vs_vet,
                     custom_notes = EXCLUDED.custom_notes,
                     share_with_league = EXCLUDED.share_with_league,
                     updated_at = now()`,
      [
        userId,
        leagueUuid,
        s.teamStage ?? null,
        s.offensePrefs ?? null,
        s.playerPrefs ?? null,
        s.rookieVsVet ?? null,
        s.customNotes ?? null,
        s.shareWithLeague ?? false,
      ]
    )

    await client.query("COMMIT")
    return NextResponse.json({ ok: true, leagueUuid })
  } catch (e) {
    await client.query("ROLLBACK")
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to complete onboarding." },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}

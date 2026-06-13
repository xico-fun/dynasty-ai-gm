import { NextRequest, NextResponse } from "next/server"
import { getSessionLeague } from "@/lib/session"
import { pool } from "@/lib/db"

/**
 * Update the user's strategy for their active league. Prefs arrive as arrays
 * and are stored comma-joined (matching the onboarding format).
 */
export async function PATCH(req: NextRequest) {
  const ctx = await getSessionLeague()
  if (!ctx) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 })
  }

  const body = await req.json()
  const join = (v: unknown) =>
    Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : null

  await pool.query(
    `INSERT INTO user_strategy
       (user_id, league_id, team_stage, offense_prefs, player_prefs,
        rookie_vs_vet, custom_notes, share_with_league)
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
      ctx.userId,
      ctx.leagueUuid,
      body.teamStage ?? null,
      join(body.offensePrefs),
      join(body.playerPrefs),
      body.rookieVsVet ?? null,
      body.customNotes ?? null,
      Boolean(body.shareWithLeague),
    ]
  )

  return NextResponse.json({ ok: true })
}

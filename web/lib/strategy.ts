// Shared strategy labels + formatting, used by the context route (to build the
// prompt block sent to the backend) and the account panel (to display/edit).

export const TEAM_STAGE_LABELS: Record<string, string> = {
  rebuild: "Rebuilding — stacking youth & picks for the future",
  retool: "Retooling — competitive but reshaping the roster",
  compete: "Win-now push — going for a playoff run this season",
  contender: "All-in contender — championship-or-bust",
}

export const ROOKIE_VS_VET_LABELS: Record<string, string> = {
  rookies: "Strongly prefers rookies & draft picks",
  lean_rookies: "Leans toward youth",
  balanced: "Balanced between youth and veterans",
  lean_vets: "Leans toward established veterans",
  vets: "Prefers established veterans",
}

// Option sets for the strategy editors (shared by onboarding + account page).
export const TEAM_STAGES = [
  { value: "rebuild", label: "Rebuilding", hint: "Stacking youth & picks" },
  { value: "retool", label: "Retooling", hint: "Competitive but reshaping" },
  { value: "compete", label: "Win-now push", hint: "Going for a playoff run" },
  { value: "contender", label: "All-in contender", hint: "Championship-or-bust" },
]

export const OFFENSE_PREFS = [
  "Pass-heavy / air raid",
  "Ground & pound",
  "Balanced attack",
  "High-tempo",
  "Red-zone bullies",
]

export const PLAYER_PREFS = [
  "Young upside",
  "Proven producers",
  "High-floor consistency",
  "Boom/bust ceiling",
  "Workhorse volume",
]

export const ROOKIE_VS_VET = [
  { value: "rookies", label: "Love rookies & picks" },
  { value: "lean_rookies", label: "Lean youth" },
  { value: "balanced", label: "Balanced" },
  { value: "lean_vets", label: "Lean veterans" },
  { value: "vets", label: "Established vets" },
]

export type StrategyRow = {
  team_stage: string | null
  offense_prefs: string | null
  player_prefs: string | null
  rookie_vs_vet: string | null
  custom_notes: string | null
  share_with_league?: boolean
}

/**
 * Build a readable, prompt-ready strategy block from a user_strategy row.
 * Returns null if the row is essentially empty.
 */
export function formatStrategyForPrompt(row: StrategyRow | null): string | null {
  if (!row) return null
  const lines: string[] = []

  if (row.team_stage) {
    lines.push(`- Team stage: ${TEAM_STAGE_LABELS[row.team_stage] ?? row.team_stage}`)
  }
  if (row.offense_prefs) {
    lines.push(`- Offenses they favor: ${row.offense_prefs}`)
  }
  if (row.player_prefs) {
    lines.push(`- Player types they like: ${row.player_prefs}`)
  }
  if (row.rookie_vs_vet) {
    lines.push(
      `- Rookies vs. veterans: ${ROOKIE_VS_VET_LABELS[row.rookie_vs_vet] ?? row.rookie_vs_vet}`
    )
  }
  if (row.custom_notes && row.custom_notes.trim()) {
    lines.push(`- Additional notes from the owner:\n${row.custom_notes.trim()}`)
  }

  if (lines.length === 0) return null
  return lines.join("\n")
}

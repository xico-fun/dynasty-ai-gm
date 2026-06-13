"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

// ── Types ──────────────────────────────────────────────────────────────────

type Team = { sleeperUserId: string; displayName: string; teamName: string }

type LeagueInfo = {
  leagueId: string
  leagueName: string
  season: string
  sport: string
  isFirstInLeague: boolean
  memberCount: number
  teams: Team[]
  takenSleeperIds: string[]
}

type Strategy = {
  teamStage: string
  offensePrefs: string[]
  playerPrefs: string[]
  rookieVsVet: string
  customNotes: string
  shareWithLeague: boolean
}

// ── Quiz option sets ─────────────────────────────────────────────────────────

const TEAM_STAGES = [
  { value: "rebuild", label: "Rebuilding", hint: "Stacking youth & picks for the future" },
  { value: "retool", label: "Retooling", hint: "Competitive but reshaping the roster" },
  { value: "compete", label: "Win-now push", hint: "Going for a playoff run this season" },
  { value: "contender", label: "All-in contender", hint: "Championship-or-bust mode" },
]

const OFFENSE_PREFS = [
  "Pass-heavy / air raid",
  "Ground & pound",
  "Balanced attack",
  "High-tempo",
  "Red-zone bullies",
]

const PLAYER_PREFS = [
  "Young upside",
  "Proven producers",
  "High-floor consistency",
  "Boom/bust ceiling",
  "Workhorse volume",
]

const ROOKIE_VS_VET = [
  { value: "rookies", label: "Love rookies & picks" },
  { value: "lean_rookies", label: "Lean youth" },
  { value: "balanced", label: "Balanced" },
  { value: "lean_vets", label: "Lean veterans" },
  { value: "vets", label: "Established vets" },
]

// ── Shared styles ────────────────────────────────────────────────────────────

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--foreground)",
}

function focusGreen(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "rgba(34,197,94,0.5)"
}
function blurGreen(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
  e.target.style.borderColor = "rgba(255,255,255,0.1)"
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [leagueIdInput, setLeagueIdInput] = useState("")
  const [league, setLeague] = useState<LeagueInfo | null>(null)
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)

  const [strategy, setStrategy] = useState<Strategy>({
    teamStage: "",
    offensePrefs: [],
    playerPrefs: [],
    rookieVsVet: "balanced",
    customNotes: "",
    shareWithLeague: false,
  })

  // Step 1 → validate league
  async function handleLeagueSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const res = await fetch("/api/onboarding/league", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leagueId: leagueIdInput }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? "Something went wrong.")
      return
    }
    const data: LeagueInfo = await res.json()
    setLeague(data)
    setStep(1)
  }

  // Final submit
  async function handleComplete() {
    if (!league || !selectedTeam) return
    setError("")
    setLoading(true)
    const res = await fetch("/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leagueId: league.leagueId,
        leagueName: league.leagueName,
        season: league.season,
        sport: league.sport,
        sleeperUserId: selectedTeam.sleeperUserId,
        sleeperDisplayName: selectedTeam.displayName,
        strategy: {
          teamStage: strategy.teamStage,
          offensePrefs: strategy.offensePrefs.join(", "),
          playerPrefs: strategy.playerPrefs.join(", "),
          rookieVsVet: strategy.rookieVsVet,
          customNotes: strategy.customNotes,
          shareWithLeague: strategy.shareWithLeague,
        },
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? "Failed to finish setup.")
      return
    }
    router.push("/")
  }

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg animate-fade-up">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === step ? "28px" : "8px",
                background: i <= step ? "var(--accent)" : "rgba(255,255,255,0.12)",
                boxShadow: i === step ? "0 0 10px rgba(34,197,94,0.5)" : "none",
              }}
            />
          ))}
        </div>

        <div className="card-glass rounded-2xl p-8">
          {/* ── Step 0: League ID ─────────────────────────────────────────── */}
          {step === 0 && (
            <form onSubmit={handleLeagueSubmit}>
              <h1 className="text-xl font-semibold mb-1">Connect your league</h1>
              <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
                Enter your Sleeper league ID to get started.
              </p>

              <div className="flex flex-col gap-1.5 mb-4">
                <label className="label-section">Sleeper League ID</label>
                <input
                  type="text"
                  value={leagueIdInput}
                  onChange={(e) => setLeagueIdInput(e.target.value)}
                  required
                  placeholder="e.g. 1312214296511381504"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={focusGreen}
                  onBlur={blurGreen}
                />
              </div>

              <div
                className="card-inner rounded-lg p-3 mb-5 text-xs leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                <strong style={{ color: "var(--muted-bright)" }}>How to find it:</strong> Open
                Sleeper in a web browser and go to your league. The URL looks like{" "}
                <span style={{ color: "var(--accent)" }}>sleeper.com/leagues/<u>1312214296511381504</u>/team</span>
                {" "}— that long number is your league ID.
              </div>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2 mb-4" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg py-2.5 text-sm font-medium transition-all"
                style={{ background: loading ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.85)", color: "#000", cursor: loading ? "not-allowed" : "pointer" }}
              >
                {loading ? "Checking…" : "Continue"}
              </button>
            </form>
          )}

          {/* ── Step 1: Identify team ─────────────────────────────────────── */}
          {step === 1 && league && (
            <div>
              <div
                className="rounded-lg px-3 py-2.5 mb-5 text-sm"
                style={{
                  background: league.isFirstInLeague ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
                  border: `1px solid ${league.isFirstInLeague ? "rgba(34,197,94,0.25)" : "rgba(59,130,246,0.25)"}`,
                }}
              >
                {league.isFirstInLeague ? (
                  <>🎉 <strong>You&apos;re the first from {league.leagueName}!</strong> You&apos;ll be able to invite your leaguemates once you&apos;re set up.</>
                ) : (
                  <>👋 <strong>{league.memberCount} {league.memberCount === 1 ? "leaguemate has" : "leaguemates have"} already joined {league.leagueName}.</strong> Pick your team to jump in.</>
                )}
              </div>

              <h1 className="text-xl font-semibold mb-1">Which team is yours?</h1>
              <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
                Select your team in {league.leagueName} ({league.season}).
              </p>

              <div className="flex flex-col gap-2 mb-5 max-h-72 overflow-auto">
                {league.teams.map((t) => {
                  const taken = league.takenSleeperIds.includes(t.sleeperUserId)
                  const active = selectedTeam?.sleeperUserId === t.sleeperUserId
                  return (
                    <button
                      key={t.sleeperUserId}
                      disabled={taken}
                      onClick={() => setSelectedTeam(t)}
                      className="rounded-lg px-3 py-2.5 text-left text-sm transition-all"
                      style={{
                        background: active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.025)",
                        border: `1px solid ${active ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.06)"}`,
                        opacity: taken ? 0.4 : 1,
                        cursor: taken ? "not-allowed" : "pointer",
                      }}
                    >
                      <div className="font-medium">{t.teamName}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        @{t.displayName} {taken && "· already claimed"}
                      </div>
                    </button>
                  )
                })}
              </div>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2 mb-4" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep(0); setError("") }}
                  className="rounded-lg py-2.5 px-4 text-sm font-medium transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--foreground)" }}
                >
                  Back
                </button>
                <button
                  onClick={() => { if (selectedTeam) { setStep(2); setError("") } }}
                  disabled={!selectedTeam}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-all"
                  style={{ background: selectedTeam ? "rgba(34,197,94,0.85)" : "rgba(34,197,94,0.25)", color: "#000", cursor: selectedTeam ? "pointer" : "not-allowed" }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Strategy quiz ─────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <h1 className="text-xl font-semibold mb-1">Your team strategy</h1>
              <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
                This tunes your AI GM&apos;s advice. You can change any of it later.
              </p>

              {/* Team stage */}
              <div className="mb-5">
                <label className="label-section block mb-2">Where&apos;s your team at?</label>
                <div className="grid grid-cols-2 gap-2">
                  {TEAM_STAGES.map((s) => {
                    const active = strategy.teamStage === s.value
                    return (
                      <button
                        key={s.value}
                        onClick={() => setStrategy({ ...strategy, teamStage: s.value })}
                        className="rounded-lg px-3 py-2 text-left transition-all"
                        style={{
                          background: active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.025)",
                          border: `1px solid ${active ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <div className="text-sm font-medium">{s.label}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>{s.hint}</div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Offense prefs */}
              <div className="mb-5">
                <label className="label-section block mb-2">Offenses you gravitate toward</label>
                <div className="flex flex-wrap gap-2">
                  {OFFENSE_PREFS.map((o) => {
                    const active = strategy.offensePrefs.includes(o)
                    return (
                      <button
                        key={o}
                        onClick={() => setStrategy({ ...strategy, offensePrefs: toggle(strategy.offensePrefs, o) })}
                        className="rounded-full px-3 py-1.5 text-xs transition-all"
                        style={{
                          background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${active ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.08)"}`,
                          color: active ? "var(--accent)" : "var(--muted-bright)",
                        }}
                      >
                        {o}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Player prefs */}
              <div className="mb-5">
                <label className="label-section block mb-2">Types of players you like</label>
                <div className="flex flex-wrap gap-2">
                  {PLAYER_PREFS.map((p) => {
                    const active = strategy.playerPrefs.includes(p)
                    return (
                      <button
                        key={p}
                        onClick={() => setStrategy({ ...strategy, playerPrefs: toggle(strategy.playerPrefs, p) })}
                        className="rounded-full px-3 py-1.5 text-xs transition-all"
                        style={{
                          background: active ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${active ? "rgba(34,197,94,0.45)" : "rgba(255,255,255,0.08)"}`,
                          color: active ? "var(--accent)" : "var(--muted-bright)",
                        }}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Rookie vs vet */}
              <div className="mb-5">
                <label className="label-section block mb-2">Rookies &amp; picks vs. established vets</label>
                <div className="flex gap-1.5">
                  {ROOKIE_VS_VET.map((r) => {
                    const active = strategy.rookieVsVet === r.value
                    return (
                      <button
                        key={r.value}
                        onClick={() => setStrategy({ ...strategy, rookieVsVet: r.value })}
                        className="flex-1 rounded-lg px-1 py-2 text-center transition-all"
                        style={{
                          background: active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.025)",
                          border: `1px solid ${active ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.06)"}`,
                        }}
                      >
                        <div className="text-[0.65rem] leading-tight" style={{ color: active ? "var(--accent)" : "var(--muted-bright)" }}>
                          {r.label}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom notes */}
              <div className="mb-5">
                <label className="label-section block mb-2">Anything else? (optional)</label>
                <textarea
                  value={strategy.customNotes}
                  onChange={(e) => setStrategy({ ...strategy, customNotes: e.target.value })}
                  placeholder="No-trade players, league quirks, how aggressive you want to be, etc."
                  rows={3}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all resize-none"
                  style={inputStyle}
                  onFocus={focusGreen}
                  onBlur={blurGreen}
                />
              </div>

              {/* Share toggle */}
              <button
                onClick={() => setStrategy({ ...strategy, shareWithLeague: !strategy.shareWithLeague })}
                className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 mb-5 card-inner"
              >
                <div className="text-left">
                  <div className="text-sm font-medium">Share strategy with leaguemates</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>Helps power smarter trade scenarios</div>
                </div>
                <div
                  className="w-9 h-5 rounded-full relative transition-all shrink-0"
                  style={{ background: strategy.shareWithLeague ? "var(--accent)" : "rgba(255,255,255,0.15)" }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                    style={{ left: strategy.shareWithLeague ? "18px" : "2px" }}
                  />
                </div>
              </button>

              {error && (
                <p className="text-xs rounded-lg px-3 py-2 mb-4" style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setStep(1); setError("") }}
                  className="rounded-lg py-2.5 px-4 text-sm font-medium transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--foreground)" }}
                >
                  Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={loading || !strategy.teamStage}
                  className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-all"
                  style={{ background: loading || !strategy.teamStage ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.85)", color: "#000", cursor: loading || !strategy.teamStage ? "not-allowed" : "pointer" }}
                >
                  {loading ? "Setting up…" : "Finish setup"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

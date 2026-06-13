"use client"

import { useEffect, useState } from "react"
import { signOut } from "next-auth/react"
import { LogOut, Check } from "lucide-react"
import { apiFetch, clearLeagueContextCache } from "@/lib/api"
import {
  TEAM_STAGES,
  OFFENSE_PREFS,
  PLAYER_PREFS,
  ROOKIE_VS_VET,
} from "@/lib/strategy"

type League = {
  leagueUuid: string
  sleeperLeagueId: string
  leagueName: string
  season: string
  sleeperUsername: string
  isActive: boolean
}

type Strategy = {
  teamStage: string
  offensePrefs: string[]
  playerPrefs: string[]
  rookieVsVet: string
  customNotes: string
  shareWithLeague: boolean
}

type Profile = {
  username: string
  email: string
  leagues: League[]
  activeLeague: League | null
  strategy: Strategy | null
}

const EMPTY_STRATEGY: Strategy = {
  teamStage: "",
  offensePrefs: [],
  playerPrefs: [],
  rookieVsVet: "balanced",
  customNotes: "",
  shareWithLeague: false,
}

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "var(--foreground)",
}

export default function AccountPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [strategy, setStrategy] = useState<Strategy>(EMPTY_STRATEGY)
  const [record, setRecord] = useState<string>("—")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/me/profile")
      .then((r) => r.json())
      .then((d: Profile) => {
        setProfile(d)
        if (d.strategy) setStrategy(d.strategy)
      })
      .catch(() => {})

    // Season record comes from the Sleeper-backed dashboard endpoint.
    apiFetch("/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (d?.record) setRecord(d.record)
      })
      .catch(() => {})
  }, [])

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    await fetch("/api/me/strategy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(strategy),
    })
    // Strategy changed → drop the cached context so agents pick up the new one.
    clearLeagueContextCache()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const initial = (profile?.username ?? "?").charAt(0).toUpperCase()

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div
          className="flex items-center justify-center w-14 h-14 rounded-2xl text-xl font-bold shrink-0"
          style={{
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.3)",
            color: "var(--accent)",
          }}
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{profile?.username ?? "…"}</h1>
          <p className="text-sm truncate" style={{ color: "var(--muted)" }}>
            {profile?.email ?? ""}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--foreground)",
          }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>

      {/* Active league + record */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="card-glass rounded-xl p-4">
          <div className="label-section mb-1">Active League</div>
          <div className="text-sm font-medium">
            {profile?.activeLeague?.leagueName ?? "—"}
          </div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {profile?.activeLeague?.season} · @{profile?.activeLeague?.sleeperUsername}
          </div>
        </div>
        <div className="card-glass rounded-xl p-4">
          <div className="label-section mb-1">Season Record</div>
          <div className="text-sm font-medium">{record}</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {profile?.activeLeague?.season} season
          </div>
        </div>
      </div>

      {/* Strategy editor */}
      <div className="card-glass rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold">Team Strategy</h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Tunes your AI GM&apos;s advice. Update it anytime.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all"
            style={{
              background: saved ? "rgba(34,197,94,0.2)" : "rgba(34,197,94,0.85)",
              color: saved ? "var(--accent)" : "#000",
              border: saved ? "1px solid rgba(34,197,94,0.4)" : "none",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saved ? (<><Check size={15} /> Saved</>) : saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* Team stage */}
        <div className="mb-5">
          <label className="label-section block mb-2">Team stage</label>
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
          <label className="label-section block mb-2">Offenses you favor</label>
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
          <label className="label-section block mb-2">Additional notes</label>
          <textarea
            value={strategy.customNotes}
            onChange={(e) => setStrategy({ ...strategy, customNotes: e.target.value })}
            placeholder="No-trade players, league quirks, how aggressive you want to be, etc."
            rows={3}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-all resize-none"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,197,94,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
          />
        </div>

        {/* Share toggle */}
        <button
          onClick={() => setStrategy({ ...strategy, shareWithLeague: !strategy.shareWithLeague })}
          className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 card-inner"
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
      </div>

      {/* Connected leagues */}
      <div className="card-glass rounded-2xl p-6">
        <h2 className="text-base font-semibold mb-1">Connected Leagues</h2>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          Leagues you&apos;ve joined. League switching is coming soon.
        </p>
        <div className="flex flex-col gap-2">
          {(profile?.leagues ?? []).map((l) => (
            <div
              key={l.leagueUuid}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 card-inner"
            >
              <div>
                <div className="text-sm font-medium">{l.leagueName}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {l.season} · @{l.sleeperUsername}
                </div>
              </div>
              {l.isActive && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(34,197,94,0.12)", color: "var(--accent)", border: "1px solid rgba(34,197,94,0.3)" }}
                >
                  Active
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

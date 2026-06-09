"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; position: string; team: string };

type Standing = {
  team_name: string; manager: string;
  wins: number; losses: number; fpts: number; is_me: boolean;
};

type Transaction = {
  type: string; team: string; adds: string[]; drops: string[];
};

type Matchup = {
  week: number;
  my_team: string; my_record: string; my_streak: string | null;
  my_points: number; my_starters: Player[];
  opp_team: string; opp_record: string; opp_streak: string | null;
  opp_points: number; opp_starters: Player[];
  starters_hash: string;
};

type DashboardData = {
  team_name: string; record: string; season: string; phase: string;
  matchup: Matchup | null; standings: Standing[]; transactions: Transaction[];
};

type PreviewData = { prediction: string; edge: string; watch_out: string; move: string };
type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: PreviewData; lineupChanged: boolean };

type SpotlightPlayer = {
  name: string; position: string; team: string;
  role: "key" | "dud_risk" | "boom";
  projected_stats: string; vegas: string;
  matchup_history: string | null; note: string;
};
type SpotlightState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; players: SpotlightPlayer[] };

type StartSitDecision = {
  position: string;
  start_player: Player;
  sit_player: Player;
  reason: string;
};
type StartSitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; decisions: StartSitDecision[]; offseason: boolean };

type InjuryItem = {
  player_name: string; position: string; team: string; snippet: string;
};
type InjuryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; players: InjuryItem[] };

type Chip = "preview" | "players" | "startsit" | "injuries";

// ── Constants ──────────────────────────────────────────────────────────────────

const POS_COLOR: Record<string, string> = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6",
  TE: "#f97316", K: "#94a3b8", DEF: "#94a3b8",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderBold(text: string) {
  const cleaned = text.replace(/^#{1,6}\s*/gm, "").trim();
  return cleaned.split(/\*\*(.*?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ fontWeight: 600 }}>{part}</strong>
      : part
  );
}

// ── Session cache ─────────────────────────────────────────────────────────────

const _dc: {
  data: DashboardData | null; preview: PreviewState; spotlight: SpotlightState; ts: number;
} = { data: null, preview: { status: "idle" }, spotlight: { status: "idle" }, ts: 0 };
const DASH_TTL = 5 * 60 * 1000;
const dashOk = () => _dc.ts > 0 && Date.now() - _dc.ts < DASH_TTL;

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(_dc.data);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<PreviewState>(_dc.preview);
  const [spotlight, setSpotlight] = useState<SpotlightState>(_dc.spotlight);
  const [startSit, setStartSit] = useState<StartSitState>({ status: "idle" });
  const [injuries, setInjuries] = useState<InjuryState>({ status: "idle" });
  const [regenerating, setRegenerating] = useState(false);
  const [activeChip, setActiveChip] = useState<Chip>("preview");

  useEffect(() => {
    if (dashOk()) return;
    fetch(`${API}/dashboard`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        setData(d); _dc.data = d; _dc.ts = Date.now();
        if (d.matchup) {
          fetchPreview();
          fetchSpotlight();
        }
      })
      .catch(() => setError(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fetchPreview() {
    setPreview({ status: "loading" });
    fetch(`${API}/matchup-preview`)
      .then(r => r.json())
      .then(p => {
        if (p.preview?.prediction) {
          const next: PreviewState = { status: "done", data: p.preview, lineupChanged: p.lineup_changed };
          setPreview(next); _dc.preview = next;
        } else {
          setPreview({ status: "idle" });
        }
      })
      .catch(() => setPreview({ status: "idle" }));
  }

  function fetchSpotlight() {
    setSpotlight({ status: "loading" });
    fetch(`${API}/matchup-spotlight`)
      .then(r => r.json())
      .then(s => {
        const players = s.spotlight?.players;
        if (players?.length) {
          const next: SpotlightState = { status: "done", players };
          setSpotlight(next); _dc.spotlight = next;
        } else {
          setSpotlight({ status: "idle" });
        }
      })
      .catch(() => setSpotlight({ status: "idle" }));
  }

  function fetchStartSit() {
    if (startSit.status !== "idle") return;
    setStartSit({ status: "loading" });
    fetch(`${API}/matchup-startsit`)
      .then(r => r.json())
      .then(d => setStartSit({
        status: "done",
        decisions: d.decisions ?? [],
        offseason: d.offseason ?? false,
      }))
      .catch(() => setStartSit({ status: "idle" }));
  }

  function fetchInjuries() {
    if (injuries.status !== "idle") return;
    setInjuries({ status: "loading" });
    fetch(`${API}/matchup-injuries`)
      .then(r => r.json())
      .then(d => setInjuries({ status: "done", players: d.players ?? [] }))
      .catch(() => setInjuries({ status: "idle" }));
  }

  function handleChip(chip: Chip) {
    setActiveChip(chip);
    if (chip === "startsit") fetchStartSit();
    if (chip === "injuries") fetchInjuries();
  }

  async function regeneratePreview() {
    setRegenerating(true);
    _dc.preview = { status: "idle" }; _dc.ts = 0;
    try {
      const r = await fetch(`${API}/matchup-preview/regenerate`, { method: "POST" });
      const p = await r.json();
      if (p.preview?.prediction) {
        const next: PreviewState = { status: "done", data: p.preview, lineupChanged: false };
        setPreview(next); _dc.preview = next;
      }
    } finally {
      setRegenerating(false);
    }
  }

  if (error) return (
    <div className="p-8" style={{ color: "var(--muted)" }}>
      Could not load dashboard — is the API server running?
    </div>
  );
  if (!data) return (
    <div className="p-8" style={{ color: "var(--muted)" }}>Loading…</div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h1 className="text-xl font-bold">{data.team_name}</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {data.record} &middot; {data.season} Season &middot; {data.phase}
        </p>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">
        {/* Top — Matchup */}
        <div className="flex-1 min-h-0 rounded-xl border overflow-hidden flex flex-col"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {data.matchup ? (
            <MatchupCard
              matchup={data.matchup}
              activeChip={activeChip}
              onChip={handleChip}
              preview={preview}
              spotlight={spotlight}
              startSit={startSit}
              injuries={injuries}
              regenerating={regenerating}
              onRegenerate={regeneratePreview}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2"
              style={{ color: "var(--muted)" }}>
              <p className="text-sm font-medium">No active matchup</p>
              <p className="text-xs">
                {data.phase} — check back when the season starts
              </p>
            </div>
          )}
        </div>

        {/* Bottom — Standings + Transactions */}
        <div className="flex-1 min-h-0 flex gap-4">
          <StandingsCard standings={data.standings} />
          <TransactionsCard transactions={data.transactions} />
        </div>
      </div>
    </div>
  );
}

// ── Matchup Card ──────────────────────────────────────────────────────────────

const CHIPS: { id: Chip; label: string }[] = [
  { id: "preview",  label: "Matchup Preview" },
  { id: "players",  label: "Key Players" },
  { id: "startsit", label: "Start / Sit" },
  { id: "injuries", label: "Injury & News" },
];

function MatchupCard({
  matchup, activeChip, onChip,
  preview, spotlight, startSit, injuries,
  regenerating, onRegenerate,
}: {
  matchup: Matchup; activeChip: Chip; onChip: (c: Chip) => void;
  preview: PreviewState; spotlight: SpotlightState;
  startSit: StartSitState; injuries: InjuryState;
  regenerating: boolean; onRegenerate: () => void;
}) {
  return (
    <>
      {/* Matchup header */}
      <div className="shrink-0 px-5 py-3 border-b"
        style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-4">
          {/* My team */}
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate">{matchup.my_team}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {matchup.my_record}
              </span>
              {matchup.my_streak && <StreakBadge streak={matchup.my_streak} />}
            </div>
          </div>
          {/* Week + VS centered */}
          <div className="shrink-0 flex flex-col items-center gap-0.5">
            <p className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "var(--muted)" }}>Week {matchup.week}</p>
            <span className="text-sm font-bold"
              style={{ color: "var(--muted)" }}>vs</span>
          </div>
          {/* Opp team */}
          <div className="flex-1 min-w-0 text-right">
            <p className="text-base font-bold truncate">{matchup.opp_team}</p>
            <div className="flex items-center justify-end gap-2 mt-0.5">
              {matchup.opp_streak && <StreakBadge streak={matchup.opp_streak} />}
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {matchup.opp_record}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chips row */}
      <div className="flex border-b px-4 shrink-0"
        style={{ borderColor: "var(--border)" }}>
        {CHIPS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onChip(id)}
            className="px-3 py-2.5 text-xs font-medium transition-all
              cursor-pointer mr-1 whitespace-nowrap"
            style={{
              color: activeChip === id ? "var(--foreground)" : "var(--muted)",
              borderBottom: activeChip === id
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Chip content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeChip === "preview" && (
          <PreviewChip
            preview={preview}
            regenerating={regenerating}
            onRegenerate={onRegenerate}
          />
        )}
        {activeChip === "players" && (
          <PlayersChip spotlight={spotlight} />
        )}
        {activeChip === "startsit" && (
          <StartSitChip state={startSit} />
        )}
        {activeChip === "injuries" && (
          <InjuryChip state={injuries} />
        )}
      </div>
    </>
  );
}

function StreakBadge({ streak }: { streak: string }) {
  const isWin = streak.startsWith("W");
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
      style={{
        background: (isWin ? "#22c55e" : "#ef4444") + "22",
        color: isWin ? "#22c55e" : "#ef4444",
      }}>
      {streak}
    </span>
  );
}

// ── Chip content components ───────────────────────────────────────────────────

function PreviewChip({
  preview, regenerating, onRegenerate,
}: {
  preview: PreviewState;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  if (preview.status === "loading") return <ChipLoading label="Analyzing matchup…" />;
  if (preview.status === "idle") return <ChipEmpty label="No preview available" />;

  const { data, lineupChanged } = preview;
  const sections = [
    { label: "Your Edge", text: data.edge },
    { label: "Watch Out", text: data.watch_out },
    { label: "Move to Make", text: data.move },
  ].filter(s => s.text);

  return (
    <div className="p-4 space-y-3">
      {/* Prediction section */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)" }}>Prediction</p>
            {lineupChanged && (
              <p className="text-xs" style={{ color: "var(--warning)" }}>
                · Lineup changed
              </p>
            )}
          </div>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-xs px-2 py-1 rounded-lg border transition-colors
              disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {regenerating ? "Updating…" : "↺ Update"}
          </button>
        </div>
        <p className="text-sm leading-relaxed"
          style={{ color: "var(--foreground)" }}>
          {renderBold(data.prediction)}
        </p>
      </div>
      {sections.map(({ label, text }) => (
        <div key={label} className="pt-3 border-t"
          style={{ borderColor: "var(--border)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: "var(--muted)" }}>{label}</p>
          <p className="text-sm leading-relaxed"
            style={{ color: "var(--foreground)" }}>
            {renderBold(text)}
          </p>
        </div>
      ))}
    </div>
  );
}

function PlayersChip({ spotlight }: { spotlight: SpotlightState }) {
  if (spotlight.status === "loading") return <ChipLoading label="Building roster spotlight…" />;
  if (spotlight.status === "idle") return <ChipEmpty label="No spotlight available" />;

  return (
    <div className="p-3 flex gap-2 h-full">
      {spotlight.players.map((p, i) => (
        <CompactSpotlightCard key={i} player={p} />
      ))}
    </div>
  );
}

function cleanStatText(text: string): string {
  return text
    .replace(/\s*\(Fantasy\s*Pros[^)]*\)/gi, "")
    .replace(/\s*\(consensus\)/gi, "")
    .replace(/pass(?:ing)?\s+yards/gi, "pyds")
    .replace(/rush(?:ing)?\s+yards/gi, "ryds")
    .replace(/rec(?:eiving)?\s+yards/gi, "ryds")
    .replace(/pass(?:ing)?\s+TDs/gi, "PTDs")
    .replace(/rush(?:ing)?\s+TDs/gi, "RTDs")
    .replace(/\s+-1[01][0-9]/g, "")
    .trim();
}

function CompactSpotlightCard({ player }: { player: SpotlightPlayer }) {
  const role = ROLE_CONFIG[player.role] ?? ROLE_CONFIG.key;
  const posColor = POS_COLOR[player.position] ?? "var(--muted)";
  const cleanName = player.name.replace(/\*\*/g, "");
  const cleanNote = player.note?.replace(/\*\*/g, "") ?? "";
  const proj = cleanStatText(player.projected_stats ?? "");
  const vegas = cleanStatText(player.vegas ?? "");

  return (
    <div className="flex-1 rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 min-w-0 overflow-hidden"
      style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
      {/* Single header row: pos | name | team | role */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
          style={{ background: posColor + "22", color: posColor }}>
          {player.position}
        </span>
        <p className="text-sm font-semibold truncate flex-1 min-w-0">{cleanName}</p>
        <p className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
          {player.team}
        </p>
        <span className="text-xs font-semibold shrink-0 px-1.5 py-0.5 rounded"
          style={{ background: role.color + "22", color: role.color }}>
          {role.label}
        </span>
      </div>
      {/* Divider */}
      <div className="border-t shrink-0" style={{ borderColor: "var(--border)" }} />
      {/* Proj + Vegas — side by side */}
      <div className="flex gap-3 shrink-0">
        {proj && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: "var(--muted)" }}>Proj</p>
            <p className="text-xs leading-snug" style={{ color: "var(--foreground)" }}>
              {proj}
            </p>
          </div>
        )}
        {vegas && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
              style={{ color: "var(--muted)" }}>Vegas</p>
            <p className="text-xs leading-snug" style={{ color: "var(--foreground)" }}>
              {vegas}
            </p>
          </div>
        )}
      </div>
      {/* Note — capped at 2 lines, contained */}
      {cleanNote && (
        <p className="text-xs leading-relaxed pt-1 border-t line-clamp-5 flex-1 overflow-hidden"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          {cleanNote}
        </p>
      )}
    </div>
  );
}

function StartSitChip({ state }: { state: StartSitState }) {
  if (state.status === "loading") return <ChipLoading label="Analyzing lineups…" />;
  if (state.status === "idle") return <ChipEmpty label="Loading…" />;
  if (state.offseason || state.decisions.length === 0) return (
    <ChipEmpty label="Start/Sit analysis available during the regular season" />
  );

  return (
    <div className="p-4 space-y-3">
      {state.decisions.map((d, i) => {
        const startColor = POS_COLOR[d.start_player.position] ?? "var(--accent)";
        const sitColor = "#ef4444";
        return (
          <div key={i} className="rounded-xl border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
            <div className="flex items-center gap-3 mb-2">
              {/* Start */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold mb-0.5"
                  style={{ color: "var(--accent)" }}>START</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: startColor + "22", color: startColor }}>
                    {d.start_player.position}
                  </span>
                  <p className="text-sm font-medium truncate">
                    {d.start_player.name}
                  </p>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {d.start_player.team}
                </p>
              </div>
              <span className="text-xs font-bold"
                style={{ color: "var(--muted)" }}>over</span>
              {/* Sit */}
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs font-semibold mb-0.5"
                  style={{ color: sitColor }}>SIT</p>
                <div className="flex items-center justify-end gap-1.5">
                  <p className="text-sm font-medium truncate">
                    {d.sit_player.name}
                  </p>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: sitColor + "22", color: sitColor }}>
                    {d.sit_player.position}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {d.sit_player.team}
                </p>
              </div>
            </div>
            <p className="text-xs leading-relaxed pt-2 border-t"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
              {d.reason}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function InjuryChip({ state }: { state: InjuryState }) {
  if (state.status === "loading") return <ChipLoading label="Fetching injury & news updates…" />;
  if (state.status === "idle") return <ChipEmpty label="Loading…" />;
  if (state.players.length === 0) return <ChipEmpty label="No news found" />;

  return (
    <div className="p-4 space-y-3">
      {state.players.map((p, i) => {
        const c = POS_COLOR[p.position] ?? "var(--muted)";
        return (
          <div key={i} className="rounded-xl border p-3"
            style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                style={{ background: c + "22", color: c }}>
                {p.position}
              </span>
              <p className="text-sm font-medium flex-1 truncate">{p.player_name}</p>
              <p className="text-xs shrink-0" style={{ color: "var(--muted)" }}>{p.team}</p>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              {p.snippet}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ChipLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full py-12">
      <p className="text-xs italic" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

function ChipEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full py-12">
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

// ── Spotlight Card ────────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  key:      { label: "Key Player", color: "var(--accent)" },
  dud_risk: { label: "⚠ Dud Risk", color: "var(--warning)" },
  boom:     { label: "💥 Boom",    color: "#3b82f6" },
};

// ── Standings ─────────────────────────────────────────────────────────────────

function StandingsCard({ standings }: { standings: Standing[] }) {
  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="League Standings" />
      <div className="overflow-y-auto flex-1">
        {standings.map((s, i) => (
          <div key={i}
            className="flex items-center justify-between px-4 py-2.5 border-b last:border-0"
            style={{
              borderColor: "var(--border)",
              background: s.is_me ? "var(--surface-hover)" : "transparent",
            }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-xs w-4 shrink-0 text-right"
                style={{ color: "var(--muted)" }}>{i + 1}</span>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate"
                  style={{
                    color: s.is_me ? "var(--accent)" : "var(--foreground)",
                  }}>
                  {s.team_name}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  {s.manager}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-xs font-semibold">{s.wins}-{s.losses}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {s.fpts} pts
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transactions ──────────────────────────────────────────────────────────────

function TransactionsCard({ transactions }: { transactions: Transaction[] }) {
  const typeLabel: Record<string, string> = {
    free_agent: "FA", waiver: "Waiver", trade: "Trade",
  };

  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="Recent Transactions" />
      <div className="overflow-y-auto flex-1">
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              No recent transactions
            </p>
          </div>
        ) : transactions.map((t, i) => (
          <div key={i} className="px-4 py-2.5 border-b last:border-0"
            style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium truncate">{t.team}</span>
              {t.type && (
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: "var(--surface-hover)",
                    color: "var(--muted)",
                  }}>
                  {typeLabel[t.type] ?? t.type}
                </span>
              )}
            </div>
            {t.adds.map((p, j) => (
              <p key={`a${j}`} className="text-xs"
                style={{ color: "var(--accent)" }}>+ {p}</p>
            ))}
            {t.drops.map((p, j) => (
              <p key={`d${j}`} className="text-xs"
                style={{ color: "var(--muted)" }}>− {p}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-4 py-3 border-b shrink-0 flex items-center gap-2"
      style={{ borderColor: "var(--border)" }}>
      <span className="w-1 h-3 rounded-full shrink-0"
        style={{ background: "var(--accent)" }} />
      <span className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--muted)" }}>{label}</span>
    </div>
  );
}

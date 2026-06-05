"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Player = {
  id: string;
  name: string;
  position: string;
  team: string;
};

type Standing = {
  team_name: string;
  manager: string;
  wins: number;
  losses: number;
  fpts: number;
  is_me: boolean;
};

type Transaction = {
  type: string;
  team: string;
  adds: string[];
  drops: string[];
};

type Matchup = {
  week: number;
  my_team: string;
  my_points: number;
  my_starters: Player[];
  opp_team: string;
  opp_points: number;
  opp_starters: Player[];
  starters_hash: string;
};

type DashboardData = {
  team_name: string;
  record: string;
  season: string;
  phase: string;
  matchup: Matchup | null;
  standings: Standing[];
  transactions: Transaction[];
};

type PreviewData = {
  prediction: string;
  edge: string;
  watch_out: string;
  move: string;
};

type PreviewState =
  | { status: "loading" }
  | { status: "done"; data: PreviewData; lineupChanged: boolean }
  | { status: "none" };

function renderBold(text: string) {
  // Strip any markdown headers/leading hashes the LLM might produce
  const cleaned = text.replace(/^#{1,6}\s*/gm, "").trim();
  return cleaned.split(/\*\*(.*?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ fontWeight: 600 }}>{part}</strong>
      : part
  );
}

const POS_COLOR: Record<string, string> = {
  QB: "#ef4444",
  RB: "#22c55e",
  WR: "#3b82f6",
  TE: "#f97316",
  K: "#94a3b8",
  DEF: "#94a3b8",
};

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "none" });
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetch(`${API}/dashboard`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => {
        setData(d);
        if (d.matchup) fetchPreview();
      })
      .catch(() => setError(true));
  }, []);

  function fetchPreview() {
    setPreview({ status: "loading" });
    fetch(`${API}/matchup-preview`)
      .then(r => r.json())
      .then(p => {
        if (p.preview?.prediction) {
          setPreview({
            status: "done",
            data: p.preview,
            lineupChanged: p.lineup_changed,
          });
        } else {
          setPreview({ status: "none" });
        }
      })
      .catch(() => setPreview({ status: "none" }));
  }

  async function regeneratePreview() {
    setRegenerating(true);
    try {
      const r = await fetch(`${API}/matchup-preview/regenerate`, { method: "POST" });
      const p = await r.json();
      if (p.preview?.prediction) {
        setPreview({ status: "done", data: p.preview, lineupChanged: false });
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
        {/* Top half — Matchup */}
        <div className="flex-1 min-h-0 rounded-xl border overflow-hidden flex flex-col"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {data.matchup ? (
            <MatchupCard
              matchup={data.matchup}
              preview={preview}
              regenerating={regenerating}
              onRegenerate={regeneratePreview}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-2"
              style={{ color: "var(--muted)" }}>
              <p className="text-sm font-medium">No active matchup</p>
              <p className="text-xs">{data.phase} — check back when the season starts</p>
            </div>
          )}
        </div>

        {/* Bottom half — Standings + Transactions */}
        <div className="flex-1 min-h-0 flex gap-4">
          <StandingsCard standings={data.standings} />
          <TransactionsCard transactions={data.transactions} />
        </div>
      </div>
    </div>
  );
}

function MatchupCard({
  matchup,
  preview,
  regenerating,
  onRegenerate,
}: {
  matchup: Matchup;
  preview: PreviewState;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  const maxRows = Math.max(matchup.my_starters.length, matchup.opp_starters.length);

  return (
    <>
      {/* Header strip */}
      <div className="shrink-0 px-5 py-4 border-b flex items-center"
        style={{ borderColor: "var(--border)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold truncate">{matchup.my_team}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            Week {matchup.week}
          </p>
        </div>
        <div className="flex flex-col items-center px-6 shrink-0">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
              {matchup.my_points}
            </span>
            <span className="text-sm" style={{ color: "var(--muted)" }}>vs</span>
            <span className="text-2xl font-bold">{matchup.opp_points}</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 text-right">
          <p className="text-base font-bold truncate">{matchup.opp_team}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            &nbsp;
          </p>
        </div>
      </div>

      {/* AI Preview */}
      <div className="shrink-0 border-b px-5 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
        {preview.status === "loading" && (
          <p className="text-xs italic" style={{ color: "var(--muted)" }}>
            Analyzing matchup…
          </p>
        )}
        {preview.status === "done" && (
          <PreviewPanel
            data={preview.data}
            lineupChanged={preview.lineupChanged}
            regenerating={regenerating}
            onRegenerate={onRegenerate}
          />
        )}
        {preview.status === "none" && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            No preview available
          </p>
        )}
      </div>

      {/* Player rows */}
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: maxRows }).map((_, i) => {
          const mine = matchup.my_starters[i];
          const theirs = matchup.opp_starters[i];
          const pos = mine?.position ?? theirs?.position ?? "?";
          const color = POS_COLOR[pos] ?? "var(--muted)";

          return (
            <div key={i}
              className="grid items-center px-5 py-2.5 border-b last:border-0"
              style={{
                borderColor: "var(--border)",
                gridTemplateColumns: "1fr auto 1fr",
              }}>
              {/* My player — left aligned */}
              {mine ? (
                <div>
                  <p className="text-sm font-medium">{mine.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {mine.position} · {mine.team}
                  </p>
                </div>
              ) : <div />}

              {/* Position badge — centered */}
              <div className="mx-4 px-2.5 py-0.5 rounded-md text-xs font-bold"
                style={{ background: color + "22", color }}>
                {pos}
              </div>

              {/* Opponent player — right aligned */}
              {theirs ? (
                <div className="text-right">
                  <p className="text-sm font-medium">{theirs.name}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {theirs.position} · {theirs.team}
                  </p>
                </div>
              ) : <div />}
            </div>
          );
        })}
      </div>
    </>
  );
}

function PreviewPanel({
  data,
  lineupChanged,
  regenerating,
  onRegenerate,
}: {
  data: PreviewData;
  lineupChanged: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const sections = [
    { label: "Your edge", text: data.edge },
    { label: "Watch out", text: data.watch_out },
    { label: "Move to make", text: data.move },
  ].filter(s => s.text);

  return (
    <div>
      {/* Prediction + controls — always visible */}
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--foreground)" }}>
          {renderBold(data.prediction)}
        </p>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {lineupChanged && (
            <p className="text-xs" style={{ color: "var(--warning)" }}>Lineup changed</p>
          )}
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            {regenerating ? "Updating…" : "↺ Update"}
          </button>
        </div>
      </div>

      {/* Toggle — always visible, directly below prediction */}
      {sections.length > 0 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="mt-1.5 text-xs cursor-pointer transition-colors"
          style={{ color: "var(--accent)" }}>
          {expanded ? "Show less ↑" : "Show more ↓"}
        </button>
      )}

      {/* Expanded sections — scrollable, fixed max height */}
      {expanded && sections.length > 0 && (
        <div className="mt-2.5 space-y-2.5 border-t pt-2.5 pb-2.5 overflow-y-auto"
          style={{ borderColor: "var(--border)", maxHeight: "160px" }}>
          {sections.map(({ label, text }) => (
            <div key={label}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: "var(--muted)" }}>
                {label}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
                {renderBold(text)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StandingsCard({ standings }: { standings: Standing[] }) {
  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}>League Standings</span>
      </div>
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
                  style={{ color: s.is_me ? "var(--accent)" : "var(--foreground)" }}>
                  {s.team_name}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  {s.manager}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-xs font-semibold">{s.wins}-{s.losses}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>{s.fpts} pts</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransactionsCard({ transactions }: { transactions: Transaction[] }) {
  const typeLabel: Record<string, string> = {
    free_agent: "FA",
    waiver: "Waiver",
    trade: "Trade",
  };

  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <div className="px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}>Recent Transactions</span>
      </div>
      <div className="overflow-y-auto flex-1">
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs" style={{ color: "var(--muted)" }}>No recent transactions</p>
          </div>
        ) : transactions.map((t, i) => (
          <div key={i} className="px-4 py-2.5 border-b last:border-0"
            style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium truncate">{t.team}</span>
              {t.type && (
                <span className="text-xs px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: "var(--surface-hover)", color: "var(--muted)" }}>
                  {typeLabel[t.type] ?? t.type}
                </span>
              )}
            </div>
            {t.adds.map((p, j) => (
              <p key={`a${j}`} className="text-xs" style={{ color: "var(--accent)" }}>+ {p}</p>
            ))}
            {t.drops.map((p, j) => (
              <p key={`d${j}`} className="text-xs" style={{ color: "var(--muted)" }}>− {p}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

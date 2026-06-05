"use client";

import { useEffect, useState } from "react";

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
  my_starters: string[];
  opp_team: string;
  opp_points: number;
  opp_starters: string[];
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

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API}/dashboard`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => setError(true));
  }, []);

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
        <div className="flex-1 min-h-0 rounded-xl border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          {data.matchup ? (
            <MatchupCard matchup={data.matchup} />
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

function MatchupCard({ matchup }: { matchup: Matchup }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}>
        <span className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}>
          Week {matchup.week} Matchup
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* My team */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-5 py-3">
          <div className="flex items-baseline justify-between mb-3 shrink-0">
            <span className="text-sm font-semibold truncate mr-2">{matchup.my_team}</span>
            <span className="text-lg font-bold shrink-0" style={{ color: "var(--accent)" }}>
              {matchup.my_points}
            </span>
          </div>
          {matchup.my_starters.map((p, i) => (
            <div key={i} className="text-xs py-1.5 border-b last:border-0"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              {p}
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px shrink-0" style={{ background: "var(--border)" }} />

        {/* Opponent */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto px-5 py-3">
          <div className="flex items-baseline justify-between mb-3 shrink-0">
            <span className="text-sm font-semibold truncate mr-2">{matchup.opp_team}</span>
            <span className="text-lg font-bold shrink-0">{matchup.opp_points}</span>
          </div>
          {matchup.opp_starters.map((p, i) => (
            <div key={i} className="text-xs py-1.5 border-b last:border-0"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              {p}
            </div>
          ))}
        </div>
      </div>
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
              <span className="text-xs w-4 shrink-0 text-right" style={{ color: "var(--muted)" }}>
                {i + 1}
              </span>
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

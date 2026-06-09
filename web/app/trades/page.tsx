"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Zap, Calendar } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────────

type PosTab = "QB" | "RB" | "WR" | "TE" | "Picks";

type Player = { id: string; name: string; position: string; team: string };

type Pick = {
  id: string; label: string; season: string;
  round: number; original_team: string; is_own: boolean;
};

type RosterData = {
  team_name: string; record: string; season: string; phase: string;
  positions: { QB: Player[]; RB: Player[]; WR: Player[]; TE: Player[] };
  picks: Pick[];
};

type TradeItem = {
  id: string; label: string;
  type: "player" | "pick"; position?: string;
};

type Proposal = {
  team: string;
  return_players: string[];
  return_picks: string[];
  rationale: string;
};

type TrendingValue = {
  id: string; name: string; position: string;
  team: string; value_notes: string;
};

type Recommendation = {
  sell_player: string; sell_player_position: string;
  get_back: string; rationale: string;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const POS_COLOR: Record<string, string> = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6",
  TE: "#f97316", K: "#94a3b8", DEF: "#94a3b8",
};

const PICK_COLOR = "#f59e0b";

const NEON = {
  on: {
    background: "transparent",
    color: "#22c55e",
    border: "1px solid #22c55e",
    boxShadow: "0 0 6px #22c55e55, 0 0 14px #22c55e22, inset 0 0 6px #22c55e11",
    textShadow: "0 0 8px #22c55eaa",
  },
  hover: {
    background: "#22c55e0d",
    color: "#22c55e",
    border: "1px solid #22c55e",
    boxShadow: "0 0 10px #22c55e88, 0 0 24px #22c55e44, 0 0 40px #22c55e22, inset 0 0 8px #22c55e22",
    textShadow: "0 0 12px #22c55e",
  },
  off: {
    background: "transparent",
    color: "#22c55e33",
    border: "1px solid #22c55e22",
    boxShadow: "none",
    textShadow: "none",
  },
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function TradesPage() {
  const [rosterData, setRosterData] = useState<RosterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendingValues, setTrendingValues] = useState<TrendingValue[] | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[] | null>(null);

  const [activeTab, setActiveTab] = useState<PosTab>("QB");
  const [tradeOffer, setTradeOffer] = useState<TradeItem[]>([]);

  const [finding, setFinding] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [activeProposal, setActiveProposal] = useState(0);

  useEffect(() => {
    fetch(`${API}/trades/roster`)
      .then(r => r.json())
      .then(d => { setRosterData(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`${API}/trades/trending-values`)
      .then(r => r.json())
      .then(d => setTrendingValues(d.players ?? []))
      .catch(() => setTrendingValues([]));

    fetch(`${API}/trades/recommendations`)
      .then(r => r.json())
      .then(d => setRecommendations(d.recommendations ?? []))
      .catch(() => setRecommendations([]));
  }, []);

  const isInOffer = (id: string) => tradeOffer.some(t => t.id === id);

  function addToOffer(item: TradeItem) {
    if (!isInOffer(item.id)) setTradeOffer(prev => [...prev, item]);
  }

  function removeFromOffer(id: string) {
    setTradeOffer(prev => prev.filter(t => t.id !== id));
  }

  function clearTrade() {
    setTradeOffer([]);
    setProposals(null);
    setActiveProposal(0);
  }

  async function findTrades() {
    const playerIds = tradeOffer.filter(t => t.type === "player").map(t => t.id);
    const pickIds = tradeOffer.filter(t => t.type === "pick").map(t => t.id);

    setFinding(true);
    setProposals(null);

    try {
      const r = await fetch(`${API}/trades/find`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_ids: playerIds, pick_ids: pickIds }),
      });
      const data = await r.json();
      setProposals(data.proposals ?? []);
      setActiveProposal(0);
    } catch {
      setProposals([]);
    } finally {
      setFinding(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full"
      style={{ color: "var(--muted)" }}>Loading…</div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h1 className="text-xl font-bold">{rosterData?.team_name ?? "Trade Center"}</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {rosterData?.record} &middot; {rosterData?.season} Season &middot; {rosterData?.phase}
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 overflow-hidden p-4 gap-4">

        {/* Top half — trade finder */}
        <div className="flex gap-4 flex-1 min-h-0">
          <RosterPanel
            rosterData={rosterData}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            isInOffer={isInOffer}
            onAdd={addToOffer}
            onRemove={removeFromOffer}
          />
          <TradeBuilderPanel
            tradeOffer={tradeOffer}
            onRemove={removeFromOffer}
            finding={finding}
            proposals={proposals}
            activeProposal={activeProposal}
            onActiveProposal={setActiveProposal}
            onFindTrades={findTrades}
            onClear={clearTrade}
          />
        </div>

        {/* Bottom half — market + recommendations */}
        <div className="flex gap-4 flex-1 min-h-0">
          <TrendingValuesPanel players={trendingValues} />
          <RecommendationsPanel recommendations={recommendations} />
        </div>

      </div>
    </div>
  );
}

// ── Shared ─────────────────────────────────────────────────────────────────────

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

// ── Roster Panel ───────────────────────────────────────────────────────────────

function RosterPanel({ rosterData, activeTab, onTabChange, isInOffer, onAdd, onRemove }: {
  rosterData: RosterData | null;
  activeTab: PosTab;
  onTabChange: (t: PosTab) => void;
  isInOffer: (id: string) => boolean;
  onAdd: (item: TradeItem) => void;
  onRemove: (id: string) => void;
}) {
  const TABS: PosTab[] = ["QB", "RB", "WR", "TE", "Picks"];

  const players: Player[] =
    activeTab !== "Picks" && rosterData
      ? rosterData.positions[activeTab] ?? []
      : [];
  const picks: Pick[] =
    activeTab === "Picks" && rosterData ? rosterData.picks : [];

  return (
    <div className="w-5/12 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="My Roster" />

      {/* Tabs */}
      <div className="flex shrink-0 px-3 pt-2 border-b"
        style={{ borderColor: "var(--border)" }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab)}
            className="px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer mr-1"
            style={{
              color: activeTab === tab ? "var(--foreground)" : "var(--muted)",
              borderBottom: activeTab === tab
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {tab}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {activeTab !== "Picks" && players.length === 0 && (
          <p className="text-xs italic text-center py-6"
            style={{ color: "var(--muted)" }}>No {activeTab}s on roster</p>
        )}

        {activeTab !== "Picks" && players.map(p => {
          const inOffer = isInOffer(p.id);
          const c = POS_COLOR[p.position] ?? "var(--muted)";
          return (
            <div key={p.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
              style={{
                background: inOffer ? c + "14" : "transparent",
                border: inOffer ? `1px solid ${c}44` : "1px solid transparent",
              }}>
              <span className="text-xs font-bold w-7 text-center py-0.5 rounded shrink-0"
                style={{ background: c + "22", color: c }}>
                {p.position}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{p.team}</p>
              </div>
              <button
                onClick={() =>
                  inOffer
                    ? onRemove(p.id)
                    : onAdd({ id: p.id, label: p.name, type: "player", position: p.position })
                }
                className="text-xs px-2 py-1 rounded-lg shrink-0 transition-all cursor-pointer"
                style={{
                  background: inOffer ? c + "22" : "var(--accent)22",
                  color: inOffer ? c : "var(--accent)",
                  border: `1px solid ${inOffer ? c + "44" : "var(--accent)33"}`,
                }}>
                {inOffer ? "Remove" : "Add"}
              </button>
            </div>
          );
        })}

        {activeTab === "Picks" && picks.length === 0 && (
          <p className="text-xs italic text-center py-6"
            style={{ color: "var(--muted)" }}>No picks found</p>
        )}

        {activeTab === "Picks" && picks.map(pick => {
          const inOffer = isInOffer(pick.id);
          return (
            <div key={pick.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all"
              style={{
                background: inOffer ? PICK_COLOR + "14" : "transparent",
                border: inOffer ? `1px solid ${PICK_COLOR}44` : "1px solid transparent",
              }}>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ background: PICK_COLOR + "22", color: PICK_COLOR }}>
                {pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : "3rd"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{pick.label}</p>
                <p className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  {pick.is_own ? "Own pick" : `Via ${pick.original_team}`}
                </p>
              </div>
              <button
                onClick={() =>
                  inOffer
                    ? onRemove(pick.id)
                    : onAdd({ id: pick.id, label: pick.label, type: "pick" })
                }
                className="text-xs px-2 py-1 rounded-lg shrink-0 transition-all cursor-pointer"
                style={{
                  background: inOffer ? PICK_COLOR + "22" : "var(--accent)22",
                  color: inOffer ? PICK_COLOR : "var(--accent)",
                  border: `1px solid ${inOffer ? PICK_COLOR + "44" : "var(--accent)33"}`,
                }}>
                {inOffer ? "Remove" : "Add"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Trade Builder Panel ────────────────────────────────────────────────────────

function TradeBuilderPanel({ tradeOffer, onRemove, finding, proposals,
  activeProposal, onActiveProposal, onFindTrades, onClear }: {
  tradeOffer: TradeItem[];
  onRemove: (id: string) => void;
  finding: boolean;
  proposals: Proposal[] | null;
  activeProposal: number;
  onActiveProposal: (i: number) => void;
  onFindTrades: () => void;
  onClear: () => void;
}) {
  const [centerHovered, setCenterHovered] = useState(false);
  const disabled = tradeOffer.length === 0 || finding;
  const hasResults = proposals !== null;

  return (
    <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="Trade Away" />

      {/* Offer chips + inline button */}
      <div className="px-4 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2">
          {tradeOffer.length === 0 && (
            <p className="text-xs italic flex-1" style={{ color: "var(--muted)" }}>
              Add players or picks from the left to build your offer
            </p>
          )}
          {tradeOffer.map(item => (
            <OfferChip key={item.id} item={item} onRemove={() => onRemove(item.id)} />
          ))}
          {hasResults && (
            <button
              onClick={onClear}
              className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5
                rounded-xl text-xs font-semibold transition-all duration-200
                cursor-pointer active:scale-[0.98]"
              style={{
                background: "var(--surface-hover)",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}>
              ↺ New Trade
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {!proposals && !finding && (
          <div className="flex-1 flex items-center justify-center">
            <button
              onClick={onFindTrades}
              disabled={disabled}
              onMouseEnter={() => setCenterHovered(true)}
              onMouseLeave={() => setCenterHovered(false)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                text-sm font-semibold transition-all duration-200
                cursor-pointer active:scale-[0.98] disabled:cursor-not-allowed"
              style={disabled ? NEON.off : centerHovered ? NEON.hover : NEON.on}>
              <Zap size={14} />Find Trades
            </button>
          </div>
        )}

        {finding && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 size={22} className="animate-spin"
              style={{ color: "var(--accent)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
              Analyzing rosters &amp; trade values…
            </p>
          </div>
        )}

        {proposals && proposals.length === 0 && !finding && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs italic" style={{ color: "var(--muted)" }}>
              No proposals found. Try different players.
            </p>
          </div>
        )}

        {proposals && proposals.length > 0 && !finding && (
          <>
            {/* Partner tabs */}
            <div className="flex border-b px-4 shrink-0"
              style={{ borderColor: "var(--border)" }}>
              {proposals.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onActiveProposal(i)}
                  className="px-3 py-2.5 text-xs font-medium transition-all cursor-pointer
                    mr-1 truncate max-w-[160px]"
                  style={{
                    color: activeProposal === i ? "var(--foreground)" : "var(--muted)",
                    borderBottom: activeProposal === i
                      ? "2px solid var(--accent)"
                      : "2px solid transparent",
                    marginBottom: "-1px",
                  }}>
                  {p.team}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <ProposalCard proposal={proposals[activeProposal]} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Offer Chip ─────────────────────────────────────────────────────────────────

function OfferChip({ item, onRemove }: { item: TradeItem; onRemove: () => void }) {
  const color = item.type === "pick"
    ? PICK_COLOR
    : POS_COLOR[item.position ?? ""] ?? "var(--accent)";
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium"
      style={{ background: color + "22", color, border: `1px solid ${color}44` }}>
      {item.type === "pick" && <Calendar size={10} />}
      <span className="max-w-[130px] truncate">{item.label}</span>
      <button onClick={onRemove}
        className="ml-0.5 transition-opacity hover:opacity-60 cursor-pointer"
        style={{ color }}>
        <X size={10} />
      </button>
    </div>
  );
}

// ── Proposal Card ──────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const hasReturn = proposal.return_players.length > 0 || proposal.return_picks.length > 0;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: "var(--muted)" }}>You receive</p>
        {!hasReturn && (
          <p className="text-xs italic" style={{ color: "var(--muted)" }}>
            No return package specified
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {proposal.return_players.map((p, i) => (
            <span key={i}
              className="px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{
                background: "var(--surface-hover)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
              }}>
              {p}
            </span>
          ))}
          {proposal.return_picks.map((p, i) => (
            <span key={i}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{
                background: PICK_COLOR + "18",
                border: `1px solid ${PICK_COLOR}44`,
                color: PICK_COLOR,
              }}>
              <Calendar size={10} />
              {p}
            </span>
          ))}
        </div>
      </div>
      <div className="pt-3 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5"
          style={{ color: "var(--muted)" }}>Why it works</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
          {proposal.rationale}
        </p>
      </div>
    </div>
  );
}

// ── Trending Values Panel ──────────────────────────────────────────────────────

function TrendingValuesPanel({ players }: { players: TrendingValue[] | null }) {
  return (
    <div className="w-1/2 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="Trade Market" />
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {players === null && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin"
              style={{ color: "var(--accent)" }} />
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Fetching KTC values…
            </p>
            <p className="text-xs text-center leading-relaxed"
              style={{ color: "var(--muted)", opacity: 0.6, maxWidth: "160px" }}>
              First load takes ~30s — cached weekly after that
            </p>
          </div>
        )}
        {players !== null && players.length === 0 && (
          <p className="text-xs italic py-6 text-center"
            style={{ color: "var(--muted)" }}>No trade value data available.</p>
        )}
        {players !== null && players.map(p => {
          const c = POS_COLOR[p.position] ?? "var(--muted)";
          return (
            <div key={p.id}
              className="rounded-xl border px-3 py-2.5"
              style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: c + "22", color: c }}>
                  {p.position}
                </span>
                <p className="text-sm font-medium flex-1 truncate">{p.name}</p>
                <p className="text-xs shrink-0" style={{ color: "var(--muted)" }}>{p.team}</p>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {p.value_notes}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Recommendations Panel ──────────────────────────────────────────────────────

function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] | null }) {
  return (
    <div className="w-1/2 flex flex-col rounded-xl border overflow-hidden"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
      <SectionLabel label="Trade Recommendations" />
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {recommendations === null && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Loader2 size={20} className="animate-spin"
              style={{ color: "var(--accent)" }} />
            <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Researching trade market…
            </p>
            <p className="text-xs text-center leading-relaxed"
              style={{ color: "var(--muted)", opacity: 0.6, maxWidth: "160px" }}>
              First load takes ~45s — cached weekly after that
            </p>
          </div>
        )}
        {recommendations !== null && recommendations.length === 0 && (
          <p className="text-xs italic py-6 text-center"
            style={{ color: "var(--muted)" }}>No recommendations available.</p>
        )}
        {recommendations !== null && recommendations.map((rec, i) => {
          const c = POS_COLOR[rec.sell_player_position] ?? "var(--muted)";
          return (
            <div key={i} className="rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold shrink-0"
                  style={{ background: c + "22", color: c, border: `1px solid ${c}44` }}>
                  <span>{rec.sell_player_position}</span>
                  <span>{rec.sell_player}</span>
                </span>
                <span className="text-base" style={{ color: "var(--muted)" }}>→</span>
                <span className="text-xs font-semibold" style={{ color: "var(--foreground)" }}>
                  {rec.get_back}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {rec.rationale}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

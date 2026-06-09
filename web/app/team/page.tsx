"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Zap, Eye, ExternalLink } from "lucide-react";

function renderBold(text: string) {
  const cleaned = text.replace(/^#{1,6}\s*/gm, "").trim();
  return cleaned.split(/\*\*(.*?)\*\*/g).map((part, i) =>
    i % 2 === 1
      ? <strong key={i} style={{ fontWeight: 600 }}>{part}</strong>
      : part
  );
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

type Player = { id: string; name: string; position: string; team: string };

type RosterData = {
  team_name: string; record: string; season: string;
  phase: string; week: number; starters: Player[]; bench: Player[];
};

type Article = {
  player_name: string; player_id: string; title: string;
  intro: string; url: string; source: string; source_color: string;
};

type NewsData = { featured: Article[]; more: Article[] };

type TrendingPlayer = {
  id: string; name: string; position: string; team: string;
  add_count: number; flag: "waiver_add" | "trade"; owned_by: string | null;
};

type PlayerPreview = {
  mode: "weekly" | "offseason" | "error";
  start_sit?: string; confidence?: string; matchup?: string;
  vegas?: string; weather?: string | null; history?: string | null;
  dynasty_rating?: string; season_projection?: string;
  vegas_season_props?: string; summary?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const POS_COLOR: Record<string, string> = {
  QB: "#ef4444", RB: "#22c55e", WR: "#3b82f6",
  TE: "#f97316", K: "#94a3b8", DEF: "#94a3b8",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "#22c55e", medium: "#f59e0b", low: "#ef4444",
};

const RATING_COLOR: Record<string, string> = {
  Buy: "#22c55e", Hold: "#f59e0b", Sell: "#ef4444",
  Start: "#22c55e", Flex: "#f59e0b", Sit: "#ef4444",
};

// ── Session cache (survives navigation within the same tab) ──────────────────

const _c: {
  roster: RosterData | null; news: NewsData | null;
  trending: TrendingPlayer[]; previews: Record<string, PlayerPreview>; ts: number;
} = { roster: null, news: null, trending: [], previews: {}, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000;
const cacheOk = () => _c.ts > 0 && Date.now() - _c.ts < CACHE_TTL;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [roster, setRoster] = useState<RosterData | null>(_c.roster);
  const [news, setNews] = useState<NewsData | null>(_c.news);
  const [trending, setTrending] = useState<TrendingPlayer[]>(_c.trending);
  const [loading, setLoading] = useState(!cacheOk());

  // Preview state — inline accordion
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, PlayerPreview>>(_c.previews);

  useEffect(() => {
    if (cacheOk()) return;
    fetch(`${API}/team/roster`)
      .then(r => r.json())
      .then(d => { setRoster(d); setLoading(false); _c.roster = d; _c.ts = Date.now(); })
      .catch(() => setLoading(false));
    fetch(`${API}/team/news`).then(r => r.json()).then(d => { setNews(d); _c.news = d; }).catch(() => {});
    fetch(`${API}/team/trending`)
      .then(r => r.json())
      .then(d => { const p = d.players ?? []; setTrending(p); _c.trending = p; })
      .catch(() => {});
  }, []);

  function togglePreview(player: Player) {
    if (expandedId === player.id) { setExpandedId(null); return; }
    setExpandedId(player.id);
    if (previews[player.id]) return;
    setLoadingId(player.id);
    fetch(`${API}/team/player-preview/${player.id}`)
      .then(r => r.json())
      .then(data => {
        setPreviews(p => { const n = { ...p, [player.id]: data }; _c.previews = n; return n; });
        setLoadingId(null);
      })
      .catch(() => setLoadingId(null));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full"
      style={{ color: "var(--muted)" }}>Loading…</div>
  );
  if (!roster) return (
    <div className="flex items-center justify-center h-full"
      style={{ color: "var(--muted)" }}>Roster not found.</div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <h1 className="text-xl font-bold">{roster.team_name}</h1>
        <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
          {roster.record} &middot; {roster.season} Season &middot; {roster.phase}
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        {/* Left — Roster */}
        <div className="w-1/2 flex flex-col rounded-xl border overflow-hidden"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <SectionLabel label="My Roster" />
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <RosterSection
              label="Starters" players={roster.starters}
              expandedId={expandedId} loadingId={loadingId}
              previews={previews} onToggle={togglePreview}
            />
            <RosterSection
              label="Bench" players={roster.bench}
              expandedId={expandedId} loadingId={loadingId}
              previews={previews} onToggle={togglePreview} muted
            />
          </div>
        </div>

        {/* Right — News + Trending */}
        <div className="w-1/2 flex flex-col gap-4 overflow-hidden">
          <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <SectionLabel label="Player News" />
            <NewsPanel news={news} />
          </div>
          <div className="flex-1 flex flex-col rounded-xl border overflow-hidden"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
            <SectionLabel label="Trending Players" />
            <TrendingPanel players={trending} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Roster ─────────────────────────────────────────────────────────────────────

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

function RosterSection({ label, players, expandedId, loadingId, previews, onToggle, muted }: {
  label: string; players: Player[];
  expandedId: string | null; loadingId: string | null;
  previews: Record<string, PlayerPreview>;
  onToggle: (p: Player) => void; muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2"
        style={{ color: muted ? "var(--muted)" : "var(--accent)" }}>
        {label}
      </p>
      <div className="space-y-1">
        {players.map(p => (
          <PlayerRow
            key={p.id} player={p}
            expanded={expandedId === p.id}
            loading={loadingId === p.id}
            preview={previews[p.id] ?? null}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, expanded, loading, preview, onToggle }: {
  player: Player; expanded: boolean; loading: boolean;
  preview: PlayerPreview | null; onToggle: (p: Player) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const posColor = POS_COLOR[player.position] ?? "var(--muted)";
  const isCached = !!preview;

  return (
    <div className="rounded-lg overflow-hidden"
      style={{ border: expanded ? `1px solid ${posColor}44` : "1px solid transparent" }}>
      {/* Player row */}
      <div
        className="flex items-center gap-3 px-3 py-2 transition-colors"
        style={{ background: (hovered || expanded) ? "var(--surface-hover)" : "transparent" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}>
        <span className="text-xs font-bold w-8 text-center py-0.5 rounded shrink-0"
          style={{ background: posColor + "22", color: posColor }}>
          {player.position}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{player.name}</p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>{player.team}</p>
        </div>
        {(hovered || expanded) && (
          <button
            onClick={() => onToggle(player)}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg
              shrink-0 transition-all cursor-pointer"
            style={{
              background: "var(--accent)" + "22",
              color: "var(--accent)",
              border: `1px solid ${"var(--accent)"}44`,
            }}>
            {loading
              ? <span className="text-xs" style={{ color: "var(--muted)" }}>…</span>
              : isCached
                ? <Eye size={11} />
                : <Zap size={11} />}
            {expanded ? "Collapse" : "Preview"}
          </button>
        )}
      </div>

      {/* Inline preview accordion */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t"
          style={{ borderColor: posColor + "33", background: "var(--surface-hover)" }}>
          {loading && (
            <p className="text-xs italic py-2" style={{ color: "var(--muted)" }}>
              Generating preview…
            </p>
          )}
          {!loading && preview && preview.mode !== "error" && (
            <div className="space-y-3 mt-1">
              {/* Rating */}
              {(preview.start_sit ?? preview.dynasty_rating) && (
                <div className="flex items-center gap-2">
                  {(() => {
                    const label = preview.start_sit ?? preview.dynasty_rating ?? "";
                    const color = RATING_COLOR[label] ?? "#64748b";
                    return (
                      <>
                        <span className="text-sm font-bold px-3 py-1 rounded-lg"
                          style={{ background: color + "22", color,
                            border: `1px solid ${color}44` }}>
                          {label}
                        </span>
                        {preview.confidence && (
                          <span className="text-xs"
                            style={{ color: CONFIDENCE_COLOR[preview.confidence] ?? "var(--muted)" }}>
                            {preview.confidence} confidence
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {/* Data rows */}
              {[
                { label: "Matchup", val: preview.matchup },
                { label: "Vegas Props", val: preview.vegas ?? preview.vegas_season_props },
                { label: "Projection", val: preview.season_projection },
                { label: "Weather", val: preview.weather },
                { label: "vs Opponent", val: preview.history },
              ].filter(r => r.val).map(({ label, val }) => (
                <div key={label}>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-0.5"
                    style={{ color: "var(--muted)" }}>{label}</p>
                  <p className="text-xs leading-relaxed"
                    style={{ color: "var(--foreground)" }}>{val}</p>
                </div>
              ))}
              {/* Summary */}
              {preview.summary && (
                <p className="text-xs leading-relaxed pt-1 border-t"
                  style={{ color: "var(--foreground)", borderColor: "var(--border)" }}>
                  {renderBold(preview.summary)}
                </p>
              )}
            </div>
          )}
          {!loading && preview?.mode === "error" && (
            <p className="text-xs py-2" style={{ color: "var(--muted)" }}>
              {preview.summary ?? "Could not generate preview."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── News ──────────────────────────────────────────────────────────────────────

function NewsPanel({ news }: { news: NewsData | null }) {
  const [showMore, setShowMore] = useState(false);

  if (!news) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-xs italic" style={{ color: "var(--muted)" }}>Loading news…</p>
    </div>
  );
  if (!news.featured.length && !news.more.length) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-xs" style={{ color: "var(--muted)" }}>No articles found right now.</p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {news.featured.map((a, i) => <ArticleCard key={i} article={a} />)}
      {news.more.length > 0 && (
        <>
          <button onClick={() => setShowMore(s => !s)}
            className="flex items-center gap-1 text-xs cursor-pointer transition-colors"
            style={{ color: "var(--accent)" }}>
            {showMore ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showMore ? "Show less" : `See more news (${news.more.length})`}
          </button>
          {showMore && news.more.map((a, i) => <ArticleCard key={`m${i}`} article={a} />)}
        </>
      )}
    </div>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <a href={article.url || "#"} target="_blank" rel="noopener noreferrer"
      className="block rounded-xl border overflow-hidden transition-colors
        hover:bg-surface-hover group cursor-pointer"
      style={{ borderColor: "var(--border)" }}>
      <div className="px-3 py-1.5 flex items-center gap-2"
        style={{ background: article.source_color + "22" }}>
        <span className="w-2 h-2 rounded-full shrink-0"
          style={{ background: article.source_color }} />
        <span className="text-xs font-semibold"
          style={{ color: article.source_color }}>{article.source}</span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {article.player_name}
        </span>
        <ExternalLink size={11} className="ml-auto shrink-0 opacity-50
          group-hover:opacity-100 transition-opacity"
          style={{ color: article.source_color }} />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold mb-1 leading-snug"
          style={{ color: "var(--foreground)" }}>{article.title}</p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
          {article.intro}
        </p>
      </div>
    </a>
  );
}

// ── Trending ──────────────────────────────────────────────────────────────────

function TrendingPanel({ players }: { players: TrendingPlayer[] }) {
  if (!players.length) return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-xs italic" style={{ color: "var(--muted)" }}>
        Loading trending players…
      </p>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {players.map(p => {
        const posColor = POS_COLOR[p.position] ?? "var(--muted)";
        const isWaiver = p.flag === "waiver_add";
        const flagColor = isWaiver ? "var(--accent)" : "#f59e0b";

        return (
          <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
            style={{ borderColor: "var(--border)", background: "var(--surface-hover)" }}>
            <span className="text-xs font-bold w-8 text-center py-0.5 rounded shrink-0"
              style={{ background: posColor + "22", color: posColor }}>
              {p.position}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{p.name}</p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {p.team}{p.owned_by && ` · ${p.owned_by}`}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className="text-xs font-semibold px-2 py-0.5 rounded"
                style={{ background: flagColor + "22", color: flagColor }}>
                {isWaiver ? "Waiver Add" : "Trade"}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                +{p.add_count.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

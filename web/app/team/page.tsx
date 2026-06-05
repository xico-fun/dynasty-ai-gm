"use client";

import { useEffect, useState } from "react";
import { getRoster, type RosterEntry } from "@/lib/api";

const MY_MANAGER = "Xic";

function PlayerBadge({ player }: { player: string }) {
  const pos = player.match(/\(([A-Z]+),/)?.[1] ?? "";
  const colors: Record<string, string> = {
    QB: "#7c3aed", RB: "#16a34a", WR: "#2563eb",
    TE: "#d97706", K: "#6b7280", DEF: "#6b7280",
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
      style={{ background: "var(--background)", borderColor: "var(--border)" }}>
      {pos && (
        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: colors[pos] ?? "#6b7280", color: "#fff" }}>
          {pos}
        </span>
      )}
      <span>{player.replace(/\s*\(.*\)/, "")}</span>
      <span className="text-xs ml-auto" style={{ color: "var(--muted)" }}>
        {player.match(/,\s*([A-Z]+)\)/)?.[1]}
      </span>
    </div>
  );
}

export default function TeamPage() {
  const [roster, setRoster] = useState<RosterEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoster()
      .then((all) => {
        const mine = all.find(
          (r) => r.manager.toLowerCase() === MY_MANAGER.toLowerCase()
        );
        setRoster(mine ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full"
      style={{ color: "var(--muted)" }}>Loading roster…</div>
  );
  if (!roster) return (
    <div className="flex items-center justify-center h-full"
      style={{ color: "var(--muted)" }}>Roster not found.</div>
  );

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-1">{roster.team_name}</h1>
      <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>
        Manager: {roster.manager} · {roster.starters.length} starters ·{" "}
        {roster.bench.length} bench
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Starters */}
        <div className="rounded-xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: "var(--accent)" }}>
            Starters
          </h2>
          <div className="space-y-2">
            {roster.starters.map((p, i) => (
              <PlayerBadge key={i} player={p} />
            ))}
          </div>
        </div>

        {/* Bench */}
        <div className="rounded-xl border p-5"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4"
            style={{ color: "var(--muted)" }}>
            Bench
          </h2>
          <div className="space-y-2">
            {roster.bench.map((p, i) => (
              <PlayerBadge key={i} player={p} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Message = { role: "user" | "assistant"; content: string };
export type RosterEntry = {
  roster_id: number;
  owner_id: string;
  manager: string;
  team_name: string;
  starters: string[];
  bench: string[];
};

// ── Active-league context ────────────────────────────────────────────────────
// Resolved once from the session via the Next.js /api/me/context route, then
// forwarded to the Python backend as headers so it operates on the right league.

type LeagueCtx = {
  leagueId: string;
  username: string;
  sleeperUserId?: string;
  strategy?: string;
};

let _ctxCache: LeagueCtx | null = null;
let _ctxPromise: Promise<LeagueCtx | null> | null = null;

async function resolveLeagueCtx(): Promise<LeagueCtx | null> {
  if (_ctxCache) return _ctxCache;
  if (!_ctxPromise) {
    _ctxPromise = fetch("/api/me/context")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.hasLeague) {
          _ctxCache = {
            leagueId: d.leagueId,
            username: d.username,
            sleeperUserId: d.sleeperUserId ?? undefined,
            strategy: d.strategy ?? undefined,
          };
        }
        return _ctxCache;
      })
      .catch(() => null);
  }
  return _ctxPromise;
}

/** UTF-8-safe base64 (strategy may contain non-ASCII characters). */
function b64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

/** Clear the cached league context — call after switching active leagues. */
export function clearLeagueContextCache() {
  _ctxCache = null;
  _ctxPromise = null;
}

async function leagueHeaders(): Promise<Record<string, string>> {
  const ctx = await resolveLeagueCtx();
  if (!ctx) return {};
  const h: Record<string, string> = {
    "X-Sleeper-League-Id": ctx.leagueId,
    "X-Sleeper-Username": ctx.username,
  };
  if (ctx.sleeperUserId) h["X-Sleeper-User-Id"] = ctx.sleeperUserId;
  if (ctx.strategy) h["X-User-Strategy"] = b64Utf8(ctx.strategy);
  return h;
}

/**
 * fetch() wrapper for the Python backend. Prepends the API base URL and injects
 * the active-league headers so every request operates on the right league.
 * Pass a path beginning with "/", e.g. apiFetch("/dashboard").
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lh = await leagueHeaders();
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...lh },
  });
}

export async function getRoster(): Promise<RosterEntry[]> {
  const res = await fetch(`${API}/roster`, { headers: await leagueHeaders() });
  if (!res.ok) throw new Error("Failed to fetch roster");
  return res.json();
}

export async function* streamChat(
  message: string,
  threadId?: string
): AsyncGenerator<{ token?: string; thread_id?: string }> {
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await leagueHeaders()) },
    body: JSON.stringify({ message, thread_id: threadId }),
  });

  if (!res.ok || !res.body) throw new Error("Stream failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") return;
      try {
        yield JSON.parse(raw);
      } catch {
        // ignore malformed lines
      }
    }
  }
}

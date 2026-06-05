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

export async function getRoster(): Promise<RosterEntry[]> {
  const res = await fetch(`${API}/roster`);
  if (!res.ok) throw new Error("Failed to fetch roster");
  return res.json();
}

export async function getThreadHistory(threadId: string): Promise<Message[]> {
  const res = await fetch(`${API}/thread/${threadId}/history`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.messages ?? [];
}

export async function* streamChat(
  message: string,
  threadId?: string
): AsyncGenerator<{ token?: string; thread_id?: string }> {
  const res = await fetch(`${API}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

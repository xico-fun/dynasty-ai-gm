"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { streamChat, type Message } from "@/lib/api";
import {
  Star, Pencil, Trash2, MessageSquare, Check, X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const LAST_THREAD_KEY = "dynasty_last_thread_id";

const NEON = {
  base: {
    background: "transparent",
    color: "#22c55e",
    border: "1px solid #22c55e",
    boxShadow:
      "0 0 6px #22c55e55, 0 0 14px #22c55e22, inset 0 0 6px #22c55e11",
    textShadow: "0 0 8px #22c55eaa",
  },
  hover: {
    background: "#22c55e0d",
    color: "#22c55e",
    border: "1px solid #22c55e",
    boxShadow:
      "0 0 10px #22c55e88, 0 0 24px #22c55e44, 0 0 40px #22c55e22, inset 0 0 8px #22c55e22",
    textShadow: "0 0 12px #22c55e",
  },
};

// ── Types ──────────────────────────────────────────────────────────────────────

type ThreadMeta = {
  thread_id: string;
  title: string;
  custom_title: string | null;
  created_at: string;
  starred: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function displayTitle(t: ThreadMeta): string {
  return t.custom_title || t.title;
}

// ── Markdown components ────────────────────────────────────────────────────────

const MD: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>
  ),
  code: ({ children, className }) => {
    const isBlock = !!className;
    return isBlock ? (
      <pre
        className="rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs"
        style={{ background: "var(--background)" }}>
        <code>{children}</code>
      </pre>
    ) : (
      <code
        className="px-1 rounded text-xs"
        style={{ background: "var(--background)" }}>
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th
      className="text-left px-3 py-1.5 font-semibold border-b"
      style={{ borderColor: "rgba(255,255,255,0.05)", color: "var(--muted)" }}>
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      className="px-3 py-1.5 border-b"
      style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote
      className="border-l-2 pl-3 my-1.5 italic"
      style={{ borderColor: "var(--accent)", color: "var(--muted)" }}>
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="my-2" style={{ borderColor: "rgba(255,255,255,0.05)" }} />
  ),
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<ThreadMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  // Thread actions
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // New Chat button
  const [newChatHovered, setNewChatHovered] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  // Load thread list + restore last session
  useEffect(() => {
    fetch(`${API}/threads`)
      .then(r => r.json())
      .then(d => {
        const loaded: ThreadMeta[] = d.threads ?? [];
        setThreads(loaded);
        const lastId = localStorage.getItem(LAST_THREAD_KEY);
        if (lastId && loaded.find(t => t.thread_id === lastId)) {
          loadThread(lastId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-submit ?q= from QuickAsk
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSentRef.current) {
      autoSentRef.current = true;
      setInput(q);
      window.history.replaceState(null, "", "/chat");
    }
  }, [searchParams]);

  useEffect(() => {
    if (autoSentRef.current && input && messages.length === 0 && !loading) {
      send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const loadThread = useCallback(async (threadId: string) => {
    setActiveThreadId(threadId);
    setRenamingId(null);
    localStorage.setItem(LAST_THREAD_KEY, threadId);
    try {
      const r = await fetch(`${API}/thread/${threadId}/history`);
      const d = await r.json();
      setMessages(d.messages ?? []);
    } catch {
      setMessages([]);
    }
  }, []);

  function newChat() {
    setActiveThreadId(undefined);
    setMessages([]);
    setRenamingId(null);
    localStorage.removeItem(LAST_THREAD_KEY);
  }

  // ── Thread actions ────────────────────────────────────────────────────────

  async function toggleStar(t: ThreadMeta) {
    const updated = { ...t, starred: !t.starred };
    setThreads(prev =>
      [...prev.map(x => x.thread_id === t.thread_id ? updated : x)]
        .sort((a, b) => +b.starred - +a.starred)
    );
    await fetch(`${API}/thread/${t.thread_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        starred: updated.starred,
        custom_title: t.custom_title,
      }),
    });
  }

  function startRename(t: ThreadMeta) {
    setRenamingId(t.thread_id);
    setRenameValue(t.custom_title || t.title);
  }

  async function saveRename(t: ThreadMeta) {
    const newTitle = renameValue.trim() || null;
    setThreads(prev =>
      prev.map(x =>
        x.thread_id === t.thread_id
          ? { ...x, custom_title: newTitle }
          : x
      )
    );
    setRenamingId(null);
    await fetch(`${API}/thread/${t.thread_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        starred: t.starred,
        custom_title: newTitle,
      }),
    });
  }

  async function removeThread(t: ThreadMeta) {
    setThreads(prev => prev.filter(x => x.thread_id !== t.thread_id));
    if (activeThreadId === t.thread_id) newChat();
    await fetch(`${API}/thread/${t.thread_id}`, { method: "DELETE" });
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    let assistantText = "";
    let resolvedThreadId = activeThreadId;
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      for await (const chunk of streamChat(text, activeThreadId)) {
        if (chunk.thread_id) {
          resolvedThreadId = chunk.thread_id;
          setActiveThreadId(chunk.thread_id);
          localStorage.setItem(LAST_THREAD_KEY, chunk.thread_id);
        }
        if (chunk.token) {
          assistantText += chunk.token;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantText,
            };
            return updated;
          });
        }
      }

      if (resolvedThreadId && assistantText) {
        await fetch(`${API}/thread/${resolvedThreadId}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_message: text,
            assistant_message: assistantText,
          }),
        });

        setThreads(prev => {
          if (prev.find(t => t.thread_id === resolvedThreadId)) return prev;
          return [
            {
              thread_id: resolvedThreadId!,
              title: text,
              custom_title: null,
              created_at: new Date().toISOString(),
              starred: false,
            },
            ...prev,
          ];
        });
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Is the API server running?",
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden animate-fade-in">

      {/* ── Thread history panel ─────────────────────────────────────────── */}
      <div className="w-56 flex flex-col border-r shrink-0"
        style={{ background: "rgba(10,12,18,0.9)", borderColor: "rgba(255,255,255,0.05)" }}>

        {/* Label */}
        <div className="px-4 py-3 border-b shrink-0 flex items-center gap-2.5"
          style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <span className="w-[3px] h-3 rounded-full shrink-0"
            style={{ background: "linear-gradient(180deg, var(--accent) 0%, rgba(34,197,94,0.2) 100%)" }} />
          <span className="label-section">Recent Chats</span>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto py-2">
          {threads.length === 0 && (
            <p className="text-xs px-4 py-3 italic"
              style={{ color: "var(--muted)" }}>
              No conversations yet
            </p>
          )}
          {threads.map(t => {
            const active = t.thread_id === activeThreadId;
            const hovered = hoveredId === t.thread_id;
            const renaming = renamingId === t.thread_id;

            return (
              <div
                key={t.thread_id}
                className="relative px-3 py-2 transition-colors cursor-pointer"
                style={{
                  background: active ? "var(--surface-hover)" : "transparent",
                }}
                onMouseEnter={() => setHoveredId(t.thread_id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => !renaming && loadThread(t.thread_id)}>

                {/* Active accent bar */}
                {active && (
                  <span className="absolute left-0 top-1 bottom-1 w-0.5
                    rounded-full"
                    style={{ background: "var(--accent)" }} />
                )}

                <div className="flex items-start gap-2">
                  <MessageSquare size={12} className="shrink-0 mt-0.5"
                    style={{
                      color: active ? "var(--accent)" : "var(--muted)",
                    }} />
                  <div className="min-w-0 flex-1">
                    {/* Title / rename input */}
                    {renaming ? (
                      <div className="flex items-center gap-1"
                        onClick={e => e.stopPropagation()}>
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveRename(t);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={() => saveRename(t)}
                          className="flex-1 min-w-0 text-xs rounded px-1 outline-none
                            border"
                          style={{
                            background: "var(--background)",
                            borderColor: "var(--accent)",
                            color: "var(--foreground)",
                          }}
                        />
                        <button onClick={() => saveRename(t)}
                          className="shrink-0 cursor-pointer"
                          style={{ color: "var(--accent)" }}>
                          <Check size={11} />
                        </button>
                        <button onClick={() => setRenamingId(null)}
                          className="shrink-0 cursor-pointer"
                          style={{ color: "var(--muted)" }}>
                          <X size={11} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs font-medium truncate leading-snug"
                        style={{
                          color: active
                            ? "var(--foreground)" : "var(--muted)",
                        }}>
                        {t.starred && (
                          <span className="mr-1 text-yellow-400">★</span>
                        )}
                        {displayTitle(t)}
                      </p>
                    )}

                    {/* Timestamp + hover actions */}
                    {!renaming && (
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs"
                          style={{ color: "var(--muted)", opacity: 0.6 }}>
                          {timeAgo(t.created_at)}
                        </p>
                        {hovered && (
                          <div className="flex items-center gap-1"
                            onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => toggleStar(t)}
                              title={t.starred ? "Unstar" : "Star"}
                              className="cursor-pointer transition-opacity
                                hover:opacity-100 opacity-60"
                              style={{
                                color: t.starred
                                  ? "#facc15" : "var(--muted)",
                              }}>
                              <Star size={11}
                                fill={t.starred ? "#facc15" : "none"} />
                            </button>
                            <button
                              onClick={() => startRename(t)}
                              title="Rename"
                              className="cursor-pointer transition-opacity
                                hover:opacity-100 opacity-60"
                              style={{ color: "var(--muted)" }}>
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={() => removeThread(t)}
                              title="Delete"
                              className="cursor-pointer transition-opacity
                                hover:opacity-100 opacity-60"
                              style={{ color: "var(--danger)" }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chat area ────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b shrink-0 flex items-center
          justify-between"
          style={{
            borderColor: "rgba(255,255,255,0.05)",
            background: "transparent",
          }}>
          <div>
            <h1 className="font-semibold">AI GM Chat</h1>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Ask anything about your dynasty team
            </p>
          </div>
          <button
            onClick={newChat}
            onMouseEnter={() => setNewChatHovered(true)}
            onMouseLeave={() => setNewChatHovered(false)}
            className="flex items-center px-3 py-2 rounded-xl text-sm
              font-medium transition-all duration-200 cursor-pointer
              active:scale-95"
            style={newChatHovered ? NEON.hover : NEON.base}>
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center
              h-full gap-3"
              style={{ color: "var(--muted)" }}>
              <span className="text-4xl">💬</span>
              <p className="text-sm">
                Ask your AI GM anything about your team.
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
                {[
                  "Who should I start at flex this week?",
                  "Are there any good waiver wire pickups?",
                  "Who in the league needs a QB?",
                ].map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="text-xs text-left px-4 py-2 rounded-lg
                      transition-colors cursor-pointer card-inner"
                    style={{ color: "var(--muted)" }}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i}
              className={`flex ${msg.role === "user"
                ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[75%] px-4 py-3 text-sm"
                style={msg.role === "user" ? {
                  background: "rgba(34,197,94,0.08)",
                  color: "var(--foreground)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  boxShadow: "0 0 16px rgba(34,197,94,0.12), inset 0 1px 0 rgba(34,197,94,0.15)",
                  borderRadius: "1rem 1rem 0.25rem 1rem",
                } : {
                  background: "rgba(255,255,255,0.03)",
                  color: "var(--foreground)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                  borderRadius: "1rem 1rem 1rem 0.25rem",
                }}>
                {msg.role === "assistant" ? (
                  msg.content
                    ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={MD}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : loading && i === messages.length - 1
                      ? <span style={{ color: "var(--muted)" }}>
                          Thinking…
                        </span>
                      : null
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t"
          style={{
            borderColor: "rgba(255,255,255,0.05)",
            background: "rgba(10,12,18,0.85)",
          }}>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e =>
                e.key === "Enter" && !e.shiftKey && send()
              }
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Ask your AI GM…"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-xl text-sm outline-none
                border transition-all duration-200"
              style={{
                background: "var(--background)",
                color: "var(--foreground)",
                borderColor: inputFocused ? "#22c55e" : "var(--border)",
                boxShadow: inputFocused
                  ? "0 0 0 1px #22c55e33, 0 0 8px #22c55e22"
                  : "none",
              }}
            />
            <SendButton onClick={send} disabled={loading || !input.trim()} />
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Send Button ────────────────────────────────────────────────────────────────

function SendButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="px-4 py-2 rounded-xl text-sm font-medium transition-all
        duration-200 cursor-pointer active:scale-95 disabled:cursor-not-allowed"
      style={
        disabled
          ? {
              background: "transparent",
              color: "#22c55e33",
              border: "1px solid #22c55e22",
            }
          : hovered
            ? NEON.hover
            : NEON.base
      }>
      Send
    </button>
  );
}

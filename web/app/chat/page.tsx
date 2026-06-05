"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { streamChat, type Message } from "@/lib/api";

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-submit message passed via ?q= from QuickAsk
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !autoSentRef.current) {
      autoSentRef.current = true;
      setInput(q);
      // Push state to clean up the URL without a re-render loop
      window.history.replaceState(null, "", "/chat");
    }
  }, [searchParams]);

  // Fire send once input is set from the ?q= param
  useEffect(() => {
    if (autoSentRef.current && input && messages.length === 0 && !loading) {
      send();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    let assistantText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      for await (const chunk of streamChat(text, threadId)) {
        if (chunk.thread_id) setThreadId(chunk.thread_id);
        if (chunk.token) {
          assistantText += chunk.token;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantText,
            };
            return updated;
          });
        }
      }
    } catch {
      setMessages((prev) => {
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

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div>
          <h1 className="font-semibold">AI GM Chat</h1>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Ask anything about your dynasty team
          </p>
        </div>
        {threadId && (
          <button onClick={() => { setMessages([]); setThreadId(undefined); }}
            className="text-xs px-3 py-1 rounded-lg border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
            New Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3"
            style={{ color: "var(--muted)" }}>
            <span className="text-4xl">💬</span>
            <p className="text-sm">Ask your AI GM anything about your team.</p>
            <div className="flex flex-col gap-2 w-full max-w-sm mt-2">
              {[
                "Who should I start at flex this week?",
                "Are there any good waiver wire pickups?",
                "Who in the league needs a QB?",
              ].map((q) => (
                <button key={q} onClick={() => setInput(q)}
                  className="text-xs text-left px-4 py-2 rounded-lg border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--muted)", background: "var(--surface)" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap"
              style={{
                background: msg.role === "user" ? "var(--accent)" : "var(--surface)",
                color: msg.role === "user" ? "#fff" : "var(--foreground)",
                borderRadius: msg.role === "user"
                  ? "1rem 1rem 0.25rem 1rem"
                  : "1rem 1rem 1rem 0.25rem",
              }}>
              {msg.content || (loading && i === messages.length - 1
                ? <span style={{ color: "var(--muted)" }}>Thinking…</span>
                : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask your AI GM…"
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-xl text-sm outline-none border transition-colors"
            style={{
              background: "var(--background)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
          />
          <button onClick={send} disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: "var(--accent)", color: "#fff" }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function QuickAsk() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (pathname === "/chat") return null;

  function submit() {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setOpen(false);
    router.push(`/chat?q=${encodeURIComponent(q)}`);
  }

  return (
    <div ref={containerRef} style={{ position: "fixed", top: "14px", right: "20px", zIndex: 50 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
        style={{ background: "var(--accent)", color: "#fff" }}>
        Ask AI GM
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 rounded-xl border shadow-xl"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            width: "300px",
          }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs mb-2.5 font-medium" style={{ color: "var(--muted)" }}>
              Ask your AI GM anything
            </p>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Who should I start this week?"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none border transition-colors"
              style={{
                background: "var(--background)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>
          <div className="px-4 pb-3 flex justify-end">
            <button
              onClick={submit}
              disabled={!input.trim()}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Send →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NEON = {
  base: {
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
};

export default function QuickAsk() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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
    <div ref={containerRef}
      style={{ position: "fixed", top: "20px", right: "20px", zIndex: 50 }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="flex items-center px-3 py-2 rounded-xl text-sm font-medium
          transition-all duration-200 cursor-pointer active:scale-95 neon-pulse"
        style={hovered ? NEON.hover : NEON.base}>
        Ask AI GM
      </button>

      {open && (
        <div className="absolute right-0 mt-2 rounded-xl border shadow-xl"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            width: "300px",
          }}>
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs mb-2.5 font-medium"
              style={{ color: "var(--muted)" }}>
              Ask your AI GM anything
            </p>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              placeholder="Who should I start this week?"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none
                border transition-colors"
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
              className="px-4 py-1.5 rounded-lg text-xs font-medium
                transition-all disabled:opacity-40 cursor-pointer
                hover:opacity-90 active:scale-95"
              style={{ background: "var(--accent)", color: "#fff" }}>
              Send →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

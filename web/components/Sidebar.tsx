"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/",       label: "Dashboard",    icon: "⬡" },
  { href: "/team",   label: "My Team",      icon: "👥" },
  { href: "/chat",   label: "AI GM Chat",   icon: "💬" },
  { href: "/waiver", label: "Waiver Wire",  icon: "📋" },
  { href: "/trades", label: "Trade Center", icon: "🔄" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col min-h-screen border-r shrink-0 transition-all duration-200"
      style={{
        width: collapsed ? "56px" : "224px",
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}>

      {/* Logo + toggle */}
      <div className="flex items-center border-b px-3 py-5"
        style={{ borderColor: "var(--border)", justifyContent: collapsed ? "center" : "space-between" }}>
        {!collapsed && (
          <div>
            <span className="text-sm font-semibold tracking-widest uppercase"
              style={{ color: "var(--accent)" }}>Dynasty</span>
            <p className="text-lg font-bold leading-tight" style={{ color: "var(--foreground)" }}>AI GM</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="rounded-lg p-1 transition-colors cursor-pointer"
          style={{ color: "var(--muted)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              title={collapsed ? label : undefined}
              className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors"
              style={{
                background: active ? "var(--surface-hover)" : "transparent",
                color: active ? "var(--foreground)" : "var(--muted)",
                justifyContent: collapsed ? "center" : undefined,
              }}>
              <span className="shrink-0">{icon}</span>
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-5 py-4 border-t text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
          Stl Dynasty · 2026
        </div>
      )}
    </aside>
  );
}

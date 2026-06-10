"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const NAV = [
  { href: "/",       label: "Dashboard",    icon: LayoutDashboard },
  { href: "/team",   label: "My Team",      icon: Users },
  { href: "/trades", label: "Trade Center", icon: ArrowLeftRight },
  { href: "/chat",   label: "AI GM Chat",   icon: MessageSquare },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className="flex flex-col min-h-screen shrink-0 transition-all duration-300"
      style={{
        width: collapsed ? "56px" : "224px",
        background: "linear-gradient(180deg, #161a26 0%, #111420 100%)",
        borderRight: "1px solid var(--border-subtle)",
        boxShadow: "1px 0 0 0 rgba(255,255,255,0.03)",
      }}>

      {/* Logo + toggle */}
      <div
        className="flex items-center px-3 py-5"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          justifyContent: collapsed ? "center" : "space-between",
        }}>
        {!collapsed && (
          <div className="select-none">
            <p className="text-xs font-semibold tracking-[0.18em] uppercase"
              style={{ color: "var(--accent)", opacity: 0.85 }}>Dynasty</p>
            <p className="text-base font-bold tracking-tight leading-tight"
              style={{ color: "var(--foreground)" }}>AI GM</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="rounded-md p-1.5 cursor-pointer transition-colors"
          style={{ color: "var(--muted)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed
            ? <ChevronRight size={15} />
            : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              title={collapsed ? label : undefined}
              className={[
                "relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm",
                "font-medium transition-all duration-150",
                collapsed ? "justify-center" : "",
              ].join(" ")}
              style={{
                color: active ? "var(--foreground)" : "var(--muted)",
                background: active
                  ? "linear-gradient(90deg, rgba(34,197,94,0.1) 0%, rgba(34,197,94,0.04) 100%)"
                  : "transparent",
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--foreground)";
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                if (!active) (e.currentTarget as HTMLElement).style.color = "var(--muted)";
              }}>
              {/* Green left accent bar on active item */}
              {active && !collapsed && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                  style={{ background: "var(--accent)" }} />
              )}
              <Icon
                size={16}
                className="shrink-0"
                style={{ color: active ? "var(--accent)" : "inherit" }}
              />
              {!collapsed && (
                <span className="tracking-tight">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-4 text-xs"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--muted)",
            opacity: 0.6,
          }}>
          Stl Dynasty · 2026
        </div>
      )}
    </aside>
  );
}

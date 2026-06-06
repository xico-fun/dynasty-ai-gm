"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  ListChecks,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const NAV = [
  { href: "/",       label: "Dashboard",    icon: LayoutDashboard },
  { href: "/team",   label: "My Team",      icon: Users },
  { href: "/chat",   label: "AI GM Chat",   icon: MessageSquare },
  { href: "/waiver", label: "Waiver Wire",  icon: ListChecks },
  { href: "/trades", label: "Trade Center", icon: ArrowLeftRight },
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
        style={{
          borderColor: "var(--border)",
          justifyContent: collapsed ? "center" : "space-between",
        }}>
        {!collapsed && (
          <div>
            <span className="text-sm font-semibold tracking-widest uppercase"
              style={{ color: "var(--accent)" }}>Dynasty</span>
            <p className="text-lg font-bold leading-tight"
              style={{ color: "var(--foreground)" }}>AI GM</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="rounded-lg p-1.5 cursor-pointer transition-colors"
          style={{ color: "var(--muted)" }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed
            ? <ChevronRight size={16} />
            : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              title={collapsed ? label : undefined}
              className={[
                "relative flex items-center gap-3 rounded-lg px-2 py-2 text-sm",
                "font-medium transition-colors",
                active
                  ? "bg-surface-hover text-foreground"
                  : "text-muted hover:bg-surface-hover hover:text-foreground",
                collapsed ? "justify-center" : "",
              ].join(" ")}>
              {/* Green left accent bar on active item */}
              {active && !collapsed && (
                <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                  style={{ background: "var(--accent)" }} />
              )}
              <Icon size={17} className="shrink-0" />
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

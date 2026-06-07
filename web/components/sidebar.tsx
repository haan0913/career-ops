"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Inbox, Briefcase, BarChart3 } from "lucide-react";

const nav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: Inbox },
  { href: "/applications", label: "Applications", icon: Briefcase },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col border-r border-white/[0.06] bg-zinc-950/70 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-400 to-violet-600 text-sm font-bold text-white shadow-lg shadow-indigo-500/25">
          c
        </div>
        <span className="font-semibold tracking-tight">career-ops</span>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-white/[0.06] text-white"
                  : "text-zinc-400 hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <Icon className={`size-4 ${active ? "text-indigo-400" : ""}`} strokeWidth={2} />
              {label}
              {active && <span className="ml-auto size-1.5 rounded-full bg-indigo-400" />}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/[0.06] px-5 py-4 text-[11px] text-zinc-600">
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          local · :3737
        </div>
      </div>
    </aside>
  );
}

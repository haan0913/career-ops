import { ReactNode } from "react";
import { daysAgo, freshLabel, freshTone } from "@/lib/fresh";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`surface ${className}`}>{children}</div>;
}

export function StatCard({
  label,
  value,
  sub,
  accent = "text-white",
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="surface surface-hover group p-5">
      {/* faint accent wash that warms on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-[0.85rem] bg-gradient-to-br from-indigo-500/[0.06] to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
          {icon && <span className="text-zinc-600 transition-colors group-hover:text-indigo-400">{icon}</span>}
        </div>
        <div className={`mt-2.5 font-mono text-[30px] font-semibold leading-none tabular-nums ${accent}`}>{value}</div>
        {sub && <div className="mt-2 text-xs text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="relative">
        <span className="absolute -left-3 top-1 h-7 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-violet-500" />
        <h1 className="text-[22px] font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold tracking-tight text-zinc-200">{title}</h2>
      {action}
    </div>
  );
}

export function FreshnessPill({ posted }: { posted: string }) {
  const d = daysAgo(posted);
  const tone = freshTone(d);
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      <span className={tone.text}>{freshLabel(d)}</span>
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const tone = /offer/.test(s)
    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
    : /interview|entrevista/.test(s)
      ? "bg-indigo-500/10 text-indigo-300 ring-indigo-500/20"
      : /applied|aplicado|responded/.test(s)
        ? "bg-amber-500/10 text-amber-300 ring-amber-500/20"
        : /reject|discard|descart/.test(s)
          ? "bg-rose-500/10 text-rose-300 ring-rose-500/20"
          : "bg-white/[0.04] text-zinc-400 ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {status || "—"}
    </span>
  );
}

export function Bar({ value, max, tone = "bg-indigo-500" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  // Map the old solid-tone API to a richer gradient + faint glow, keeping every
  // existing caller working without changes.
  const grad: Record<string, string> = {
    "bg-indigo-500": "linear-gradient(90deg,#6366f1,#a855f7)",
    "bg-violet-500": "linear-gradient(90deg,#8b5cf6,#d946ef)",
    "bg-sky-500": "linear-gradient(90deg,#0ea5e9,#38bdf8)",
    "bg-emerald-500": "linear-gradient(90deg,#10b981,#34d399)",
    "bg-lime-500": "linear-gradient(90deg,#65a30d,#a3e635)",
    "bg-amber-500": "linear-gradient(90deg,#d97706,#fbbf24)",
    "bg-rose-500": "linear-gradient(90deg,#e11d48,#fb7185)",
    "bg-zinc-500": "linear-gradient(90deg,#52525b,#a1a1aa)",
    "bg-zinc-600": "linear-gradient(90deg,#3f3f46,#71717a)",
    "bg-zinc-700": "linear-gradient(90deg,#27272a,#52525b)",
  };
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: grad[tone] ?? "linear-gradient(90deg,#6366f1,#a855f7)" }}
      />
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.08] bg-zinc-900/20 p-12 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

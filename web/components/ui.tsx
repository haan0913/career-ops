import { ReactNode } from "react";
import { daysAgo, freshLabel, freshTone } from "@/lib/fresh";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-white/[0.06] bg-zinc-900/40 ${className}`}>{children}</div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent = "text-white",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="group rounded-xl border border-white/[0.06] bg-zinc-900/40 p-5 transition-all duration-300 hover:border-white/[0.12] hover:bg-zinc-900/60">
      <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-2 font-mono text-[28px] font-semibold leading-none tabular-nums ${accent}`}>
        {value}
      </div>
      {sub && <div className="mt-2 text-xs text-zinc-500">{sub}</div>}
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>}
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
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.04]">
      <div className={`h-full rounded-full ${tone} transition-all duration-700`} style={{ width: `${pct}%` }} />
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

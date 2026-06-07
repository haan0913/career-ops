// Pure freshness/score helpers — safe in both server and client components.

export function daysAgo(posted?: string | null): number | null {
  if (!posted) return null;
  const d = new Date(posted + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}

export function freshLabel(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "today";
  if (d === 1) return "1d";
  if (d < 14) return `${d}d`;
  if (d < 60) return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
}

export function freshTone(d: number | null): { dot: string; text: string } {
  if (d === null) return { dot: "bg-zinc-600", text: "text-zinc-500" };
  if (d <= 7) return { dot: "bg-emerald-400", text: "text-emerald-400" };
  if (d <= 30) return { dot: "bg-lime-400", text: "text-lime-400" };
  if (d <= 90) return { dot: "bg-amber-400", text: "text-amber-400" };
  return { dot: "bg-zinc-600", text: "text-zinc-500" };
}

export function scoreTone(score: number): string {
  if (score >= 65) return "text-emerald-400";
  if (score >= 45) return "text-amber-400";
  return "text-zinc-400";
}

export type Mode = "Remote" | "Hybrid" | "Onsite" | "";

export function workMode(location?: string | null): Mode {
  const s = (location || "").toLowerCase();
  if (!s) return "";
  if (/\bhybrid\b/.test(s)) return "Hybrid"; // "Hybrid (2 days remote)" → Hybrid
  if (/\bremote\b|telecommute|anywhere|\bwfh\b/.test(s)) return "Remote";
  return "Onsite";
}

export function modeTone(mode: Mode): string {
  return mode === "Remote"
    ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
    : mode === "Hybrid"
      ? "text-sky-400 bg-sky-500/10 ring-sky-500/20"
      : mode === "Onsite"
        ? "text-zinc-300 bg-white/[0.04] ring-white/10"
        : "text-zinc-500 bg-white/[0.04] ring-white/10";
}

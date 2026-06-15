"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { markVisited } from "@/lib/actions";

type Lite = { url: string; company: string; title: string; discovered: string | null };

// "What changed since my last visit." The boundary is persisted server-side
// (meta table) via markVisited, so it survives across browsers/devices: the
// action returns the PREVIOUS visit time, then advances the marker to now.
export function NewSinceVisit({ jobs }: { jobs: Lite[] }) {
  const [since, setSince] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    markVisited().then((prev) => { if (active) setSince(prev); }).catch(() => { if (active) setSince(0); });
    return () => { active = false; };
  }, []);

  if (since === null) return null; // first paint, before we know the boundary

  const fresh = jobs.filter((j) => {
    if (!j.discovered) return false;
    const t = Date.parse(j.discovered.length <= 10 ? `${j.discovered}T00:00:00Z` : j.discovered);
    return Number.isFinite(t) && t > since;
  });

  if (since === 0) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-zinc-900/40 px-4 py-3 text-sm text-zinc-500">
        <Sparkles className="mr-1.5 inline size-3.5 text-indigo-400" />
        Welcome — we&apos;ll highlight what&apos;s new here on your next visit.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-indigo-200">
        <Sparkles className="size-4" />
        {fresh.length === 0
          ? "Nothing new discovered since your last visit"
          : `${fresh.length} new role${fresh.length === 1 ? "" : "s"} discovered since your last visit`}
      </div>
      {fresh.length > 0 && (
        <ul className="mt-2 space-y-1">
          {fresh.slice(0, 5).map((j) => (
            <li key={j.url} className="truncate text-xs text-zinc-400">
              <span className="font-medium text-zinc-200">{j.company}</span> · {j.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

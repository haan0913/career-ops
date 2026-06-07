"use client";

import { useState, useTransition } from "react";
import { scoreRole } from "@/lib/actions";

// On-demand local match score for a single role (spawns match-score.mjs on the title).
// A lightweight triage signal — the full JD-based score happens in the pipeline eval.
export function MatchCell({ jd }: { jd: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [pending, start] = useTransition();

  if (score !== null) {
    if (score < 0) return <span className="text-xs text-red-500">err</span>;
    const color = score >= 60 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-zinc-500";
    return <span className={`tabular-nums text-sm font-medium ${color}`}>{score}</span>;
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            const r = await scoreRole(jd);
            setScore(r.score);
          } catch {
            setScore(-1);
          }
        })
      }
      className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-50 dark:hover:text-zinc-200"
    >
      {pending ? "…" : "score"}
    </button>
  );
}

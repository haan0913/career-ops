"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { scoreRole } from "@/lib/actions";
import { scoreTone } from "@/lib/fresh";

// On-demand local match score for a single role (spawns match-score.mjs on the title).
// A lightweight triage signal — the full JD-based score happens in the pipeline eval.
export function MatchCell({ jd }: { jd: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [pending, start] = useTransition();

  if (score !== null) {
    if (score < 0) return <span className="font-mono text-xs text-rose-400">err</span>;
    return (
      <span className={`font-mono text-sm font-semibold tabular-nums ${scoreTone(score)}`}>{score}</span>
    );
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
      className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 py-0.5 font-mono text-[11px] text-zinc-500 transition-colors hover:border-white/20 hover:text-zinc-300 disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : "score"}
    </button>
  );
}

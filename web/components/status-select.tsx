"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { setStatus } from "@/lib/actions";

const STATUSES = ["Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP"];

function tone(s: string): string {
  const x = (s || "").toLowerCase();
  if (/offer/.test(x)) return "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20";
  if (/interview/.test(x)) return "text-indigo-300 bg-indigo-500/10 ring-indigo-500/20";
  if (/applied|responded/.test(x)) return "text-amber-300 bg-amber-500/10 ring-amber-500/20";
  if (/reject|discard/.test(x)) return "text-rose-300 bg-rose-500/10 ring-rose-500/20";
  return "text-zinc-300 bg-white/[0.04] ring-white/10";
}

export function StatusSelect({ number, status }: { number: number; status: string }) {
  const [val, setVal] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Keep a non-canonical current value (e.g. legacy "Resume ready") selectable until changed.
  const options = STATUSES.includes(val) ? STATUSES : [val, ...STATUSES];

  return (
    <div className="relative inline-flex items-center">
      <select
        value={val}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          setVal(v);
          start(async () => {
            const r = await setStatus(number, v);
            if (r.ok) router.refresh();
            else setVal(status);
          });
        }}
        className={`cursor-pointer appearance-none rounded-md py-0.5 pl-2 pr-6 text-xs font-medium outline-none ring-1 ring-inset transition-colors hover:ring-white/20 disabled:opacity-50 ${tone(val)}`}
      >
        {options.map((s) => (
          <option key={s} value={s} className="bg-zinc-900 text-zinc-200">
            {s}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="pointer-events-none absolute right-1.5 size-3 animate-spin opacity-70" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-1.5 size-3 opacity-50" />
      )}
    </div>
  );
}

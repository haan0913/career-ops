"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar } from "lucide-react";
import { runScan } from "@/lib/actions";

export function ScanBar() {
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2.5">
      {msg && <span className="font-mono text-xs text-zinc-500">{msg}</span>}
      <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-400">
        <span>max age</span>
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 30)}
          className="w-9 bg-transparent text-center font-mono text-zinc-200 outline-none"
        />
        <span>d</span>
      </div>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg("scanning…");
            try {
              const r = await runScan(days);
              setMsg(`+${r.added} new`);
              router.refresh();
            } catch {
              setMsg("scan failed");
            }
          })
        }
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:bg-indigo-400 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
        {pending ? "Scanning" : "Run scan"}
      </button>
    </div>
  );
}

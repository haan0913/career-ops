"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runScan } from "@/lib/actions";

export function ScanBar() {
  const [days, setDays] = useState(30);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-zinc-500">
        max age
        <input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 30)}
          className="ml-1 w-14 rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700"
        />
        d
      </label>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg("scanning…");
            try {
              const r = await runScan(days);
              setMsg(`+${r.added} added`);
              router.refresh();
            } catch {
              setMsg("scan failed");
            }
          })
        }
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-black"
      >
        {pending ? "Scanning…" : "Run scan"}
      </button>
      {msg && <span className="text-sm text-zinc-500">{msg}</span>}
    </div>
  );
}

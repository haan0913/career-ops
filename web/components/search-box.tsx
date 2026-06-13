"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";

// Free-text corpus search. Debounces input and pushes ?q= so the server
// component re-runs searchJobs. Submitting (Enter) navigates immediately.
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (value: string) => {
    const params = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : "";
    startTransition(() => router.push(`/search${params}`));
  };

  useEffect(() => {
    if (q === initial) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(q), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(q);
      }}
      className="relative"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
        placeholder="Search titles, companies, and full descriptions —  e.g. implementation coordinator equity, &quot;degree or equivalent&quot;"
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] py-3 pl-11 pr-20 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-400/40"
      />
      <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
        {pending && <Loader2 className="size-4 animate-spin text-zinc-500" />}
        {q && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              if (timer.current) clearTimeout(timer.current);
              startTransition(() => router.push("/search"));
            }}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
    </form>
  );
}

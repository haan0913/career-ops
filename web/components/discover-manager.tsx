"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Trash2, Loader2, Radar, Save, Building2 } from "lucide-react";
import { saveSourcing, type SavedSearch } from "@/lib/sourcing";
import { runScan } from "@/lib/actions";

const POSTED_OPTIONS = [
  { label: "Past 24 hours", val: "today" },
  { label: "Past 3 days", val: "3days" },
  { label: "Past week", val: "week" },
  { label: "Past month", val: "month" },
  { label: "Any time", val: "all" },
];

// Quick-add role keywords tuned to non-technical financial-services / ops / PM roles.
const ROLE_CHIPS = [
  "project coordinator",
  "implementation analyst",
  "operations analyst",
  "business analyst",
  "PMO analyst",
  "program coordinator",
  "project manager",
  "data analyst",
  "financial analyst",
  "product operations",
  "client onboarding",
  "operations associate",
];

function composeQuery(keywords: string, location: string): string {
  const terms = keywords
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (terms.length === 0) return "";
  const head = terms.length === 1 ? terms[0] : `(${terms.join(" OR ")})`;
  const loc = location.trim();
  return loc ? `${head} in ${loc}` : head;
}

export function DiscoverManager({
  initial,
  atsCount,
}: {
  initial: SavedSearch[];
  atsCount: number;
}) {
  const router = useRouter();
  const [searches, setSearches] = useState<SavedSearch[]>(initial);
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("New York");
  const [datePosted, setDatePosted] = useState("week");
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();

  const preview = useMemo(() => composeQuery(keywords, location), [keywords, location]);

  const addSearch = () => {
    const query = preview;
    if (!query) return;
    const kw0 = keywords.split(/[,\n]/)[0]?.trim() || "roles";
    const name = `${kw0}${location.trim() ? ` · ${location.trim()}` : ""}`;
    setSearches((s) => [
      ...s,
      { name, query, datePosted, numPages: 1, country: "us", enabled: true },
    ]);
    setKeywords("");
    setDirty(true);
    setMsg("");
  };

  const removeSearch = (i: number) => {
    setSearches((s) => s.filter((_, idx) => idx !== i));
    setDirty(true);
  };
  const toggleSearch = (i: number) => {
    setSearches((s) => s.map((x, idx) => (idx === i ? { ...x, enabled: !x.enabled } : x)));
    setDirty(true);
  };
  const addChip = (chip: string) => {
    setKeywords((k) => (k.trim() ? `${k.replace(/[,\s]+$/, "")}, ${chip}` : chip));
  };

  const persist = async () => {
    const r = await saveSourcing({ searches });
    if (r.ok) {
      setDirty(false);
      setMsg(`Saved ${r.searches ?? searches.length} searches`);
    } else {
      setMsg(`Save failed: ${r.error ?? "unknown"}`);
    }
    return r.ok;
  };

  const save = () => startSave(async () => { setMsg("Saving…"); await persist(); });
  const saveAndScan = () =>
    startSave(async () => {
      setMsg("Saving…");
      if (!(await persist())) return;
      setMsg("Scanning… (this runs the engine, ~1 min)");
      try {
        const res = await runScan(30);
        setMsg(`+${res.added} new role${res.added === 1 ? "" : "s"}${res.quota ? ` · ${res.quota.remaining} JSearch left` : ""}`);
        router.refresh();
      } catch {
        setMsg("Scan failed — try the Run scan button on Pipeline.");
      }
    });

  return (
    <div className="space-y-5 pb-24">
      {/* Builder */}
      <div className="rounded-xl border border-white/[0.07] bg-zinc-900/40 p-5">
        <h2 className="text-sm font-semibold text-white">New search</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Pick the roles and place you want. This sources matching jobs from across the market on the next scan.
        </p>

        <label className="mt-4 block text-xs font-medium text-zinc-400">Roles / keywords</label>
        <input
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder="project coordinator, implementation analyst, operations associate…"
          className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-400/40"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ROLE_CHIPS.map((c) => (
            <button
              key={c}
              onClick={() => addChip(c)}
              className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:border-indigo-400/40 hover:text-zinc-100"
            >
              + {c}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-400">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="New York, Remote, Chicago…"
              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-indigo-400/40"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400">Posted within</label>
            <select
              value={datePosted}
              onChange={(e) => setDatePosted(e.target.value)}
              className="mt-1.5 w-full cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-400/40"
            >
              {POSTED_OPTIONS.map((o) => (
                <option key={o.val} value={o.val} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {preview && (
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2 font-mono text-xs text-zinc-400">
            <span className="text-zinc-600">query · </span>
            {preview}
          </div>
        )}

        <button
          onClick={addSearch}
          disabled={!preview}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-40"
        >
          <Plus className="size-4" /> Add search
        </button>
      </div>

      {/* Saved searches */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Your searches</h2>
          <span className="text-xs text-zinc-500">{searches.length} active sources</span>
        </div>
        {searches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.1] p-8 text-center text-sm text-zinc-500">
            No saved searches yet. Build one above to start sourcing roles you choose.
          </div>
        ) : (
          <ul className="space-y-2">
            {searches.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-3 ${
                  s.enabled ? "" : "opacity-50"
                }`}
              >
                <button
                  onClick={() => toggleSearch(i)}
                  title={s.enabled ? "Enabled — click to pause" : "Paused — click to enable"}
                  className={`size-2.5 shrink-0 rounded-full ${s.enabled ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">{s.name}</div>
                  <div className="truncate font-mono text-xs text-zinc-500">{s.query}</div>
                </div>
                <span className="shrink-0 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-zinc-400 ring-1 ring-inset ring-white/10">
                  {POSTED_OPTIONS.find((o) => o.val === s.datePosted)?.label ?? s.datePosted}
                </span>
                <button
                  onClick={() => removeSearch(i)}
                  className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                  aria-label="Remove"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <Building2 className="size-3.5" /> Plus {atsCount} company career boards scanned every time.
        </p>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-zinc-950/80 backdrop-blur-xl">
        <div className="ml-60 flex items-center gap-3 px-8 py-3">
          {msg && <span className="font-mono text-xs text-zinc-400">{msg}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3.5 py-2 text-sm text-zinc-200 transition-colors hover:border-white/20 disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save changes
            </button>
            <button
              onClick={saveAndScan}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Radar className="size-4" />}
              Save &amp; run scan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

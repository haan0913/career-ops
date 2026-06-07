"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ExternalLink,
  MapPin,
  Loader2,
  X,
  Building2,
  Search,
  DollarSign,
  Briefcase,
  CalendarClock,
} from "lucide-react";
import { fetchJd, type JdResult } from "@/lib/jd";
import { scoreRole } from "@/lib/actions";
import { daysAgo, freshLabel, freshTone, workMode, modeTone, scoreTone, type Mode } from "@/lib/fresh";

export type CardJob = {
  url: string;
  company: string;
  title: string;
  posted: string;
  location: string | null;
  source: string | null;
};

type ModeFilter = "all" | "Remote" | "Hybrid" | "Onsite";
type AgeFilter = 0 | 7 | 30 | 90;

export function PipelineGrid({ jobs }: { jobs: CardJob[] }) {
  const [active, setActive] = useState<CardJob | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [maxAge, setMaxAge] = useState<AgeFilter>(0);

  const filtered = useMemo(
    () =>
      jobs.filter((j) => {
        if (q) {
          const hay = `${j.title} ${j.company} ${j.location ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (mode !== "all" && workMode(`${j.location ?? ""} ${j.title}`) !== mode) return false;
        if (maxAge) {
          const d = daysAgo(j.posted);
          if (d === null || d > maxAge) return false;
        }
        return true;
      }),
    [jobs, q, mode, maxAge],
  );

  return (
    <>
      <FilterBar
        q={q}
        setQ={setQ}
        mode={mode}
        setMode={setMode}
        maxAge={maxAge}
        setMaxAge={setMaxAge}
        count={filtered.length}
        total={jobs.length}
      />

      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-xl border border-dashed border-white/[0.08] bg-zinc-900/20 p-12 text-sm text-zinc-500">
          No roles match these filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((j, i) => (
            <JobCard key={`${j.url}-${i}`} job={j} onOpen={() => setActive(j)} />
          ))}
        </div>
      )}

      {active && <JobDrawer job={active} onClose={() => setActive(null)} />}
    </>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { label: string; val: T }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
      {options.map((o) => (
        <button
          key={String(o.val)}
          onClick={() => onChange(o.val)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.val ? "bg-white/[0.1] text-white shadow-sm" : "text-zinc-400 hover:text-white"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterBar({
  q,
  setQ,
  mode,
  setMode,
  maxAge,
  setMaxAge,
  count,
  total,
}: {
  q: string;
  setQ: (v: string) => void;
  mode: ModeFilter;
  setMode: (v: ModeFilter) => void;
  maxAge: AgeFilter;
  setMaxAge: (v: AgeFilter) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
      <div className="flex min-w-[200px] flex-1 items-center gap-2 px-1">
        <Search className="size-4 shrink-0 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search roles or companies…"
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
        />
      </div>
      <Segmented<ModeFilter>
        value={mode}
        onChange={setMode}
        options={[
          { label: "All", val: "all" },
          { label: "Remote", val: "Remote" },
          { label: "Hybrid", val: "Hybrid" },
          { label: "Onsite", val: "Onsite" },
        ]}
      />
      <Segmented<AgeFilter>
        value={maxAge}
        onChange={setMaxAge}
        options={[
          { label: "Any", val: 0 },
          { label: "≤7d", val: 7 },
          { label: "≤30d", val: 30 },
          { label: "≤90d", val: 90 },
        ]}
      />
      <span className="ml-auto whitespace-nowrap pr-1 font-mono text-xs text-zinc-500">
        {count}
        <span className="text-zinc-600"> / {total}</span>
      </span>
    </div>
  );
}

function ModeBadge({ mode }: { mode: Mode }) {
  if (!mode) return null;
  return (
    <span
      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${modeTone(mode)}`}
    >
      {mode}
    </span>
  );
}

function JobCard({ job, onOpen }: { job: CardJob; onOpen: () => void }) {
  const d = daysAgo(job.posted);
  const tone = freshTone(d);
  const mode = workMode(`${job.location ?? ""} ${job.title}`);
  return (
    <button
      onClick={onOpen}
      className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-zinc-900/70 hover:shadow-lg hover:shadow-black/30"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
          <span className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={tone.text}>{freshLabel(d)}</span>
        </span>
        <ModeBadge mode={mode} />
      </div>

      <div className="flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-white">
          {job.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{job.company}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-xs text-zinc-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{job.location || "location n/a"}</span>
        </span>
        {job.source && <span className="shrink-0 font-mono text-[10px] text-zinc-600">{job.source}</span>}
      </div>
    </button>
  );
}

function MetaChip({ icon: Icon, label }: { icon: typeof DollarSign; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1 text-xs text-zinc-300 ring-1 ring-inset ring-white/10">
      <Icon className="size-3 text-zinc-500" />
      {label}
    </span>
  );
}

function reasonText(reason?: string, error?: string) {
  if (reason === "expired") return "This posting looks expired — it may have been filled or taken down.";
  if (reason === "blocked") return "This site blocks automated reads, so the description can't be shown inline.";
  if (error) return "Couldn't load the description inline.";
  return "No description found on the page.";
}

function JobDrawer({ job, onClose }: { job: CardJob; onClose: () => void }) {
  const [jd, setJd] = useState<JdResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState<number | null>(null);
  const [scoring, startScore] = useTransition();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchJd(job.url).then((r) => {
      if (alive) {
        setJd(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [job.url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = daysAgo(job.posted);
  const tone = freshTone(d);
  const loc = jd?.location || job.location || "";
  const mode = (workMode(`${loc} ${job.title}`) || (jd?.mode as Mode) || "") as Mode;
  const hasMeta = !!(jd?.salary || jd?.employmentType || jd?.validThrough);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex h-full w-full max-w-2xl flex-col border-l border-white/10 bg-zinc-950 shadow-2xl"
        style={{ animation: "slideIn 0.3s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <span className={`size-1.5 rounded-full ${tone.dot}`} />
                <span className={tone.text}>{freshLabel(d)}</span>
              </span>
              {job.source && <span className="font-mono text-zinc-600">· {job.source}</span>}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold leading-tight text-white">{job.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                {job.company}
              </span>
              {loc && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {loc}
                </span>
              )}
              <ModeBadge mode={mode} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
          <a
            href={job.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
          >
            Apply <ExternalLink className="size-3.5" />
          </a>
          <button
            disabled={scoring}
            onClick={() =>
              startScore(async () => {
                try {
                  const r = await scoreRole(`${job.company} ${job.title}`);
                  setScore(r.score);
                } catch {
                  setScore(-1);
                }
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-white/20 disabled:opacity-50"
          >
            {scoring ? <Loader2 className="size-3.5 animate-spin" /> : "Match score"}
            {score !== null && score >= 0 && (
              <span className={`font-mono font-semibold ${scoreTone(score)}`}>{score}</span>
            )}
          </button>
        </div>

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
            {jd?.salary && <MetaChip icon={DollarSign} label={jd.salary} />}
            {jd?.employmentType && <MetaChip icon={Briefcase} label={jd.employmentType} />}
            {jd?.validThrough && <MetaChip icon={CalendarClock} label={`apply by ${jd.validThrough}`} />}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Loading job description…
            </div>
          ) : jd?.ok && jd.descriptionHtml ? (
            <div className="jd-prose" dangerouslySetInnerHTML={{ __html: jd.descriptionHtml }} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-8 text-center text-sm text-zinc-500">
              <p>{reasonText(jd?.reason, jd?.error)}</p>
              <a
                href={job.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-indigo-400 hover:underline"
              >
                Open the original posting <ExternalLink className="size-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  Globe,
} from "lucide-react";
import { fetchJd, type JdResult } from "@/lib/jd";
import { scoreRole } from "@/lib/actions";
import { daysAgo, freshLabel, freshTone, workMode, modeTone, scoreTone, type Mode } from "@/lib/fresh";
import { levelLabel, levelTone, matchesLevel, type Level } from "@/lib/level";

export type CardJob = {
  url: string;
  company: string;
  title: string;
  posted: string;
  location: string | null;
  source: string | null;
  description: string | null;
  salary: string | null;
  logo: string | null;
  apply_url: string | null;
  publisher: string | null;
  level: string | null;
};

type ModeFilter = "all" | "Remote" | "Hybrid" | "Onsite";
type AgeFilter = 0 | 7 | 30 | 90;
type LevelFilter = "all" | "intern" | "entry" | "mid" | "senior" | "leadplus";

export function PipelineGrid({ jobs }: { jobs: CardJob[] }) {
  const [active, setActive] = useState<CardJob | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [maxAge, setMaxAge] = useState<AgeFilter>(0);
  const [level, setLevel] = useState<LevelFilter>("all");

  const filtered = useMemo(
    () =>
      jobs.filter((j) => {
        if (q) {
          const hay = `${j.title} ${j.company} ${j.location ?? ""} ${j.description ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (mode !== "all" && workMode(`${j.location ?? ""} ${j.title}`) !== mode) return false;
        if (!matchesLevel((j.level ?? "") as Level, level)) return false;
        if (maxAge) {
          const d = daysAgo(j.posted);
          if (d === null || d > maxAge) return false;
        }
        return true;
      }),
    [jobs, q, mode, maxAge, level],
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
        level={level}
        setLevel={setLevel}
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
  level,
  setLevel,
  count,
  total,
}: {
  q: string;
  setQ: (v: string) => void;
  mode: ModeFilter;
  setMode: (v: ModeFilter) => void;
  maxAge: AgeFilter;
  setMaxAge: (v: AgeFilter) => void;
  level: LevelFilter;
  setLevel: (v: LevelFilter) => void;
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
          placeholder="Search roles, companies, descriptions…"
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
      <Segmented<LevelFilter>
        value={level}
        onChange={setLevel}
        options={[
          { label: "All lvl", val: "all" },
          { label: "Intern", val: "intern" },
          { label: "Entry", val: "entry" },
          { label: "Mid", val: "mid" },
          { label: "Senior", val: "senior" },
          { label: "Lead+", val: "leadplus" },
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
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${modeTone(mode)}`}
    >
      {mode}
    </span>
  );
}

function LevelBadge({ level }: { level: string | null }) {
  const l = (level ?? "") as Level;
  if (!l) return null;
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${levelTone(l)}`}
    >
      {levelLabel(l)}
    </span>
  );
}

// Employer logo with a graceful fallback to a building glyph when missing/broken.
function LogoImg({ src, alt, size = "size-9" }: { src?: string | null; alt: string; size?: string }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) {
    return (
      <div
        className={`grid ${size} shrink-0 place-items-center rounded-lg bg-white/[0.04] text-zinc-500 ring-1 ring-inset ring-white/10`}
      >
        <Building2 className="size-4" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className={`${size} shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-inset ring-white/10`}
    />
  );
}

function SalaryChip({ salary }: { salary: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
      <DollarSign className="size-3" />
      {salary.replace(/^\$/, "")}
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
      <div className="flex items-start gap-3">
        <LogoImg src={job.logo} alt={job.company} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100 transition-colors group-hover:text-white">
            {job.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
            <span className="truncate font-medium">{job.company}</span>
            {job.publisher && <span className="truncate text-zinc-600">· via {job.publisher}</span>}
          </div>
        </div>
        <ModeBadge mode={mode} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <LevelBadge level={job.level} />
        {job.salary && <SalaryChip salary={job.salary} />}
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums">
          <span className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={tone.text}>{freshLabel(d)}</span>
        </span>
      </div>

      {job.description && (
        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">{job.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5 text-xs text-zinc-500">
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

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
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

  // Lock the background page scroll while the drawer is open — stops the page
  // from scrolling behind the panel and prevents scroll-chaining past the JD.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const d = daysAgo(job.posted);
  const tone = freshTone(d);
  const loc = jd?.location || job.location || "";
  const mode = (workMode(`${loc} ${job.title}`) || (jd?.mode as Mode) || "") as Mode;
  const salary = jd?.salary || job.salary || "";
  const publisher = jd?.publisher || job.publisher || "";
  const logo = jd?.logo || job.logo || null;
  const hasMeta = !!(salary || jd?.employmentType || jd?.validThrough || publisher);

  // Apply paths: primary best link, plus any distinct alternatives and a Google
  // Jobs fallback that resolves even when the direct posting has rotted.
  const applyUrl = jd?.applyUrl || job.apply_url || job.url;
  const googleLink = jd?.googleLink || "";
  const alts = (jd?.applyOptions || []).filter((o) => o.url && o.url !== applyUrl).slice(0, 3);

  // Portal to <body> so the fixed overlay is sized by the viewport, not by any
  // ancestor with a transform (e.g. the page's animate-fadeUp wrapper), which
  // would otherwise become the containing block and stretch it to full page height.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-white/10 bg-zinc-950 shadow-2xl"
        style={{ animation: "slideIn 0.3s cubic-bezier(0.22,1,0.36,1) both" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
          <div className="flex min-w-0 gap-3">
            <LogoImg src={logo} alt={job.company} size="size-11" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${tone.dot}`} />
                  <span className={tone.text}>{freshLabel(d)}</span>
                </span>
                {job.source && <span className="font-mono text-zinc-600">· {job.source}</span>}
              </div>
              <h2 className="mt-1 text-lg font-semibold leading-tight text-white">{job.title}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-1.5 font-medium">
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
                <LevelBadge level={job.level} />
              </div>
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

        <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-3">
          <a
            href={applyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400"
          >
            Apply
            {publisher && <span className="font-normal text-indigo-100/80">· via {publisher}</span>}
            <ExternalLink className="size-3.5" />
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
          {googleLink && (
            <a
              href={googleLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
            >
              <Globe className="size-3.5" /> Google Jobs
            </a>
          )}
        </div>

        {alts.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] px-5 py-2 text-xs text-zinc-500">
            <span>Other ways to apply:</span>
            {alts.map((o, i) => (
              <a
                key={i}
                href={o.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-indigo-300 hover:underline"
              >
                {o.publisher || hostLabel(o.url)}
                <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        )}

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
            {salary && <MetaChip icon={DollarSign} label={salary} />}
            {jd?.employmentType && <MetaChip icon={Briefcase} label={jd.employmentType} />}
            {jd?.validThrough && <MetaChip icon={CalendarClock} label={`apply by ${jd.validThrough}`} />}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="size-4 animate-spin" /> Loading job description…
            </div>
          ) : jd?.ok && jd.descriptionHtml ? (
            <div className="jd-prose" dangerouslySetInnerHTML={{ __html: jd.descriptionHtml }} />
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.1] p-8 text-center text-sm text-zinc-500">
              <p>{reasonText(jd?.reason, jd?.error)}</p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-indigo-400 hover:underline"
                >
                  Open the original posting <ExternalLink className="size-3.5" />
                </a>
                {googleLink && (
                  <a
                    href={googleLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 hover:underline"
                  >
                    <Globe className="size-3.5" /> Search Google Jobs
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

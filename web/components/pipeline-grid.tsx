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
import { classifyRole, roleLabel, ROLE_FAMILIES, type RoleFamily } from "@/lib/role";
import { parseSalaryAnnualMin, SALARY_BANDS } from "@/lib/salary";
import { computeFit } from "@/lib/fit";

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
  sources_count: number | null;
  sources_json: string | null;
  liveness: string | null;
  last_verified: string | null;
  reposted: number | null;
  discovered: string | null;
  date_confidence: string | null;
};

type ModeFilter = "all" | "Remote" | "Hybrid" | "Onsite";
type AgeFilter = 0 | 7 | 30 | 90;
type LevelFilter = "all" | "intern" | "entry" | "mid" | "senior" | "leadplus";
type RoleFilter = RoleFamily | "all";

export function PipelineGrid({ jobs, laneSignal }: { jobs: CardJob[]; laneSignal?: Record<string, number> }) {
  const [active, setActive] = useState<CardJob | null>(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<ModeFilter>("all");
  const [maxAge, setMaxAge] = useState<AgeFilter>(0);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [role, setRole] = useState<RoleFilter>("all");
  const [salaryMin, setSalaryMin] = useState(0);
  const [company, setCompany] = useState("all");
  const [showClosed, setShowClosed] = useState(false);

  const companies = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.company).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  // Everything matching the user's facets, ignoring liveness.
  const filteredAll = useMemo(
    () =>
      jobs.filter((j) => {
        if (q) {
          const hay = `${j.title} ${j.company} ${j.location ?? ""} ${j.description ?? ""}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        if (role !== "all" && classifyRole(j.title) !== role) return false;
        if (!matchesLevel((j.level ?? "") as Level, level)) return false;
        if (salaryMin > 0) {
          const pay = parseSalaryAnnualMin(j.salary);
          if (pay === null || pay < salaryMin) return false; // salary filter needs known pay ≥ min
        }
        if (mode !== "all" && workMode(`${j.location ?? ""} ${j.title}`) !== mode) return false;
        if (company !== "all" && j.company !== company) return false;
        if (maxAge) {
          const d = daysAgo(j.posted);
          if (d === null || d > maxAge) return false;
        }
        return true;
      }),
    [jobs, q, role, level, salaryMin, mode, company, maxAge],
  );

  // Dead listings are hidden from the default view (reversible — toggle to show).
  const deadHidden = useMemo(() => filteredAll.filter((j) => j.liveness === "dead").length, [filteredAll]);
  const filtered = useMemo(
    () => (showClosed ? filteredAll : filteredAll.filter((j) => j.liveness !== "dead")),
    [filteredAll, showClosed],
  );

  const anyActive = !!q || role !== "all" || level !== "all" || salaryMin > 0 || mode !== "all" || company !== "all" || maxAge > 0;
  const clearAll = () => {
    setQ("");
    setRole("all");
    setLevel("all");
    setSalaryMin(0);
    setMode("all");
    setCompany("all");
    setMaxAge(0);
  };

  return (
    <>
      <FilterBar
        q={q}
        setQ={setQ}
        role={role}
        setRole={setRole}
        level={level}
        setLevel={setLevel}
        salaryMin={salaryMin}
        setSalaryMin={setSalaryMin}
        mode={mode}
        setMode={setMode}
        company={company}
        setCompany={setCompany}
        companies={companies}
        maxAge={maxAge}
        setMaxAge={setMaxAge}
        anyActive={anyActive}
        clearAll={clearAll}
        count={filtered.length}
        total={jobs.length}
      />

      {deadHidden > 0 && (
        <button
          onClick={() => setShowClosed((v) => !v)}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200"
        >
          <span className="size-1.5 rounded-full bg-rose-400/80" />
          {showClosed ? `Hide ${deadHidden} closed` : `${deadHidden} closed hidden — show`}
        </button>
      )}

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

      {active && <JobDrawer job={active} laneSignal={laneSignal} onClose={() => setActive(null)} />}
    </>
  );
}

// A labeled dropdown facet (Indeed/LinkedIn-style). Highlights when set off its
// default (the first option).
function FacetSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; val: string }[];
}) {
  const active = options.length > 0 && options[0].val !== value;
  return (
    <label
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        active
          ? "border-indigo-400/40 bg-indigo-500/10 text-zinc-100"
          : "border-white/[0.08] bg-white/[0.02] text-zinc-400 hover:border-white/20"
      }`}
    >
      <span className="text-zinc-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[150px] cursor-pointer truncate bg-transparent font-medium text-current outline-none"
      >
        {options.map((o) => (
          <option key={o.val} value={o.val} className="bg-zinc-900 text-zinc-200">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterBar({
  q,
  setQ,
  role,
  setRole,
  level,
  setLevel,
  salaryMin,
  setSalaryMin,
  mode,
  setMode,
  company,
  setCompany,
  companies,
  maxAge,
  setMaxAge,
  anyActive,
  clearAll,
  count,
  total,
}: {
  q: string;
  setQ: (v: string) => void;
  role: RoleFilter;
  setRole: (v: RoleFilter) => void;
  level: LevelFilter;
  setLevel: (v: LevelFilter) => void;
  salaryMin: number;
  setSalaryMin: (v: number) => void;
  mode: ModeFilter;
  setMode: (v: ModeFilter) => void;
  company: string;
  setCompany: (v: string) => void;
  companies: string[];
  maxAge: AgeFilter;
  setMaxAge: (v: AgeFilter) => void;
  anyActive: boolean;
  clearAll: () => void;
  count: number;
  total: number;
}) {
  return (
    <div className="mb-4 space-y-2.5 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-2.5">
      <div className="flex items-center gap-2 px-1">
        <Search className="size-4 shrink-0 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search roles, companies, descriptions…"
          className="w-full bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
        />
        <span className="shrink-0 whitespace-nowrap pl-2 font-mono text-xs text-zinc-500">
          {count}
          <span className="text-zinc-600"> / {total}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-2.5">
        <FacetSelect
          label="Role"
          value={role}
          onChange={(v) => setRole(v as RoleFilter)}
          options={[{ label: "All roles", val: "all" }, ...ROLE_FAMILIES.map((r) => ({ label: roleLabel(r), val: r }))]}
        />
        <FacetSelect
          label="Level"
          value={level}
          onChange={(v) => setLevel(v as LevelFilter)}
          options={[
            { label: "All levels", val: "all" },
            { label: "Intern", val: "intern" },
            { label: "Entry", val: "entry" },
            { label: "Mid", val: "mid" },
            { label: "Senior", val: "senior" },
            { label: "Lead+", val: "leadplus" },
          ]}
        />
        <FacetSelect
          label="Pay"
          value={String(salaryMin)}
          onChange={(v) => setSalaryMin(Number(v))}
          options={SALARY_BANDS.map((b) => ({ label: b.label, val: String(b.min) }))}
        />
        <FacetSelect
          label="Mode"
          value={mode}
          onChange={(v) => setMode(v as ModeFilter)}
          options={[
            { label: "Any mode", val: "all" },
            { label: "Remote", val: "Remote" },
            { label: "Hybrid", val: "Hybrid" },
            { label: "Onsite", val: "Onsite" },
          ]}
        />
        <FacetSelect
          label="Posted"
          value={String(maxAge)}
          onChange={(v) => setMaxAge(Number(v) as AgeFilter)}
          options={[
            { label: "Any time", val: "0" },
            { label: "Past week", val: "7" },
            { label: "Past month", val: "30" },
            { label: "Past 90 days", val: "90" },
          ]}
        />
        <FacetSelect
          label="Company"
          value={company}
          onChange={setCompany}
          options={[{ label: "All companies", val: "all" }, ...companies.map((c) => ({ label: c, val: c }))]}
        />
        {anyActive && (
          <button
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="size-3.5" /> Clear
          </button>
        )}
      </div>
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
        <LivenessChip liveness={job.liveness} />
        {job.reposted === 1 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300/90 ring-1 ring-inset ring-amber-500/20">
            reposted
          </span>
        )}
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

// Liveness status chip. 'live' is left unmarked (the default, no visual noise);
// only dead/unknown earn a chip so the eye goes to what needs attention.
function LivenessChip({ liveness }: { liveness: string | null }) {
  if (liveness === "dead") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300 ring-1 ring-inset ring-rose-500/25">
        closed
      </span>
    );
  }
  if (liveness === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 ring-1 ring-inset ring-white/10">
        unverified
      </span>
    );
  }
  return null;
}

// Distinct dates, never conflated: when the employer POSTED it, when WE
// DISCOVERED it, and when liveness was last VERIFIED. Posted carries a
// confidence tag (high = authoritative ATS date, medium = aggregator).
function PostingTimeline({ job }: { job: CardJob }) {
  const fmt = (s: string | null | undefined) => {
    if (!s) return null;
    const d = new Date(s.length <= 10 ? `${s}T00:00:00Z` : s);
    if (Number.isNaN(d.getTime())) return null;
    const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
    const rel = days <= 0 ? "today" : days === 1 ? "1d ago" : `${days}d ago`;
    return `${s.slice(0, 10)} · ${rel}`;
  };
  const posted = fmt(job.posted);
  const discovered = fmt(job.discovered);
  const verified = fmt(job.last_verified);
  if (!posted && !discovered && !verified) return null;
  const confTone =
    job.date_confidence === "high" ? "text-emerald-400/80"
      : job.date_confidence === "medium" ? "text-amber-400/80" : "text-zinc-600";
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/[0.06] px-5 py-2.5 text-xs">
      {posted && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-zinc-500">Posted</span>
          <span className="text-zinc-300">{posted}</span>
          {job.date_confidence && job.date_confidence !== "unknown" && (
            <span className={`text-[10px] uppercase ${confTone}`}>{job.date_confidence}-confidence</span>
          )}
        </span>
      )}
      {discovered && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-zinc-500">Discovered</span>
          <span className="text-zinc-400">{discovered}</span>
        </span>
      )}
      {verified && (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-zinc-500">Verified</span>
          <span className="text-zinc-400">{verified}</span>
        </span>
      )}
    </div>
  );
}

// Explainable fit/winnability — deterministic (no API cost). Separate scored
// components + a calibrated label + concerns, grounded in Amir's archetypes and
// proof points. Recomputed when the JD loads so evidence/degree reflect the body.
function FitPanel({ job, jdHtml, laneSignal }: { job: CardJob; jdHtml?: string | null; laneSignal?: Record<string, number> }) {
  const fit = useMemo(() => computeFit(job, jdHtml, laneSignal), [job, jdHtml, laneSignal]);
  const toneRing: Record<string, string> = {
    good: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/25",
    ok: "text-amber-200 bg-amber-500/10 ring-amber-500/20",
    warn: "text-rose-300 bg-rose-500/10 ring-rose-500/25",
  };
  const dotTone: Record<string, string> = { good: "bg-emerald-400", ok: "bg-amber-400", warn: "bg-rose-400" };
  return (
    <div className="mb-5 rounded-xl border border-white/[0.07] bg-zinc-900/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">Fit analysis</span>
        <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${toneRing[fit.tone]}`}>
          {fit.overall}
          <span className="font-mono text-[10px] opacity-70">{fit.score}</span>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-1.5 sm:grid-cols-2">
        {fit.components.map((c) => (
          <div key={c.key} className="flex items-start gap-2 text-xs">
            <span className={`mt-1 size-1.5 shrink-0 rounded-full ${dotTone[c.tone]}`} />
            <span className="text-zinc-500">{c.label}:</span>
            <span className="text-zinc-300">{c.note}</span>
          </div>
        ))}
      </div>

      {fit.evidence.length > 0 && (
        <div className="mt-3 border-t border-white/[0.06] pt-2.5 text-xs">
          <span className="text-zinc-500">Your evidence: </span>
          <span className="text-emerald-300/90">{fit.evidence.join(" · ")}</span>
        </div>
      )}

      {fit.degree === "flexible" && (
        <div className="mt-2 text-xs text-emerald-300/80">✓ Degree-flexible — &ldquo;or equivalent experience&rdquo; language present.</div>
      )}

      {fit.concerns.length > 0 && (
        <div className="mt-2 border-t border-white/[0.06] pt-2.5 text-xs">
          <span className="text-zinc-500">Watch: </span>
          <span className="text-amber-200/90">{fit.concerns.join(" · ")}</span>
        </div>
      )}
    </div>
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

function JobDrawer({ job, onClose, laneSignal }: { job: CardJob; onClose: () => void; laneSignal?: Record<string, number> }) {
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

        {(job.sources_count ?? 1) > 1 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.06] px-5 py-2 text-xs text-zinc-500">
            <span>Seen on {job.sources_count} sources:</span>
            {(JSON.parse(job.sources_json || "[]") as { source: string; url: string; seen: string }[]).map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={`first seen ${s.seen}`}
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-indigo-300 hover:underline"
              >
                {s.source.replace(/-api$/, "")}
                <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        )}

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

        <PostingTimeline job={job} />

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
          <FitPanel job={job} jdHtml={jd?.descriptionHtml} laneSignal={laneSignal} />
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

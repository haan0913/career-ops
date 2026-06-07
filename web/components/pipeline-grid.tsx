"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, MapPin, Loader2, X, Building2 } from "lucide-react";
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

export function PipelineGrid({ jobs }: { jobs: CardJob[] }) {
  const [active, setActive] = useState<CardJob | null>(null);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {jobs.map((j, i) => (
          <JobCard key={i} job={j} onOpen={() => setActive(j)} />
        ))}
      </div>
      {active && <JobDrawer job={active} onClose={() => setActive(null)} />}
    </>
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
      className="group flex h-full flex-col gap-3 rounded-xl border border-white/[0.06] bg-zinc-900/40 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-zinc-900/70"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-xs tabular-nums">
          <span className={`size-1.5 rounded-full ${tone.dot}`} />
          <span className={tone.text}>{freshLabel(d)}</span>
        </span>
        <ModeBadge mode={mode} />
      </div>

      <div className="flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">{job.title}</h3>
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
          {jd?.salary && <span className="ml-auto font-mono text-xs text-zinc-400">{jd.salary}</span>}
        </div>

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

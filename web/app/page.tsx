import Link from "next/link";
import { ArrowUpRight, Zap, MapPin, AlertTriangle, Radio } from "lucide-react";
import { sync, getStats, getApplyQueue, getFollowUps, getPipeline } from "@/lib/data";
import { getRegistry } from "@/lib/sources";
import { StatCard, Card, SectionHeader, StatusBadge, PageHeader, EmptyState } from "@/components/ui";
import { ScanBar } from "@/components/scan-bar";
import { NewSinceVisit } from "@/components/new-since-visit";

export const dynamic = "force-dynamic";

export default async function Overview() {
  sync();
  const s = getStats();
  const queue = getApplyQueue(8);
  const followUps = getFollowUps().slice(0, 6);
  const pending = getPipeline("pending");
  const deadHidden = pending.filter((j) => j.liveness === "dead").length;
  const reg = await getRegistry();
  // Distinguish "registry came back empty" (subprocess unavailable) from a
  // genuine all-fresh state, so the panel never claims health it didn't check.
  const registryOk = reg.summary.providers > 0;
  const staleSources = reg.providers.filter((p) => p.health === "stale");
  const liteJobs = pending.map((j) => ({ url: j.url, company: j.company, title: j.title, discovered: j.discovered }));

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Command center" subtitle="What's new, what to apply to first, and what needs a nudge.">
        <ScanBar />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Apply-first queue" value={queue.length} sub="ranked & live" accent="text-indigo-300" />
        <StatCard label="In pipeline" value={s.pending} sub={`${s.freshWeek} fresh this week`} />
        <StatCard label="Follow-ups due" value={followUps.length} sub="applied, awaiting reply" accent={followUps.length ? "text-amber-300" : "text-white"} />
        <StatCard label="Interviewing" value={s.interviewing} sub={`${s.offers} offer${s.offers === 1 ? "" : "s"}`} accent="text-emerald-300" />
      </div>

      <div className="mt-6">
        <NewSinceVisit jobs={liteJobs} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            title="Apply first"
            action={
              <Link href="/pipeline" className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white">
                Full pipeline <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <Card>
            {queue.length === 0 ? (
              <EmptyState>
                No ranked roles yet. Hit <span className="mx-1 font-medium text-zinc-300">Run scan</span>, or check the full pipeline.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {queue.map(({ job, reasons }) => (
                  <li key={job.url} className="px-4 py-3 transition-colors hover:bg-white/[0.02]">
                    <div className="flex items-start gap-3">
                      <Zap className="mt-0.5 size-4 shrink-0 text-indigo-400" />
                      <div className="min-w-0 flex-1">
                        <a href={job.apply_url || job.url} target="_blank" rel="noreferrer" className="block truncate text-sm hover:underline">
                          <span className="font-medium text-zinc-100">{job.company}</span>
                          <span className="text-zinc-500"> · {job.title}</span>
                        </a>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                          {job.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />{job.location}
                            </span>
                          )}
                          {reasons.length > 0 && <span className="text-indigo-300/80">{reasons.join(" · ")}</span>}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <SectionHeader
              title="Follow-ups due"
              action={<Link href="/applications" className="text-xs text-zinc-400 transition-colors hover:text-white">All</Link>}
            />
            <Card className="p-2">
              {followUps.length === 0 ? (
                <EmptyState>Nothing awaiting a reply.</EmptyState>
              ) : (
                <ul className="space-y-1">
                  {followUps.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.02]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-200">{a.company}</div>
                        <div className="truncate text-xs text-zinc-500">{a.role}</div>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader title="Needs attention" />
            <Card className="space-y-2 p-3 text-sm">
              <AttentionRow
                tone={deadHidden ? "amber" : "ok"}
                icon={AlertTriangle}
                label={deadHidden ? `${deadHidden} closed listing${deadHidden === 1 ? "" : "s"} hidden in pipeline` : "No dead listings in your queue"}
              />
              <AttentionRow
                tone={staleSources.length ? "amber" : "ok"}
                icon={Radio}
                label={
                  !registryOk
                    ? "Source health unavailable — open Sources to refresh"
                    : staleSources.length
                      ? `${staleSources.length} source${staleSources.length === 1 ? "" : "s"} stale: ${staleSources.map((p) => p.id).slice(0, 2).join(", ")}`
                      : "All active sources fresh"
                }
              />
              <Link href="/sources" className="block pt-1 text-xs text-zinc-500 hover:text-zinc-300">
                View source health →
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function AttentionRow({ tone, icon: Icon, label }: { tone: "ok" | "amber"; icon: typeof AlertTriangle; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`size-3.5 shrink-0 ${tone === "amber" ? "text-amber-400" : "text-emerald-400/70"}`} />
      <span className={tone === "amber" ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
    </div>
  );
}

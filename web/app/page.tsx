import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { sync, getStats, getPipeline, getApplications } from "@/lib/data";
import {
  StatCard,
  Card,
  SectionHeader,
  FreshnessPill,
  StatusBadge,
  PageHeader,
  EmptyState,
} from "@/components/ui";
import { ScanBar } from "@/components/scan-bar";
import { MatchCell } from "@/components/match-cell";

export const dynamic = "force-dynamic";

export default function Overview() {
  sync();
  const s = getStats();
  const fresh = getPipeline("pending").slice(0, 8);
  const recent = getApplications().slice(0, 6);

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Overview" subtitle="Your job search at a glance">
        <ScanBar />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Applications" value={s.totalApps} sub="tracked" />
        <StatCard
          label="In pipeline"
          value={s.pending}
          sub={`${s.freshWeek} fresh this week`}
          accent="text-indigo-300"
        />
        <StatCard
          label="Interviewing"
          value={s.interviewing}
          sub={`${s.offers} offer${s.offers === 1 ? "" : "s"}`}
          accent="text-emerald-300"
        />
        <StatCard
          label="Avg fit score"
          value={s.avgScore != null ? s.avgScore.toFixed(1) : "—"}
          sub="of evaluated roles"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            title="Fresh roles"
            action={
              <Link
                href="/pipeline"
                className="inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-white"
              >
                View all <ArrowUpRight className="size-3" />
              </Link>
            }
          />
          <Card>
            {fresh.length === 0 ? (
              <EmptyState>
                No roles in the pipeline yet. Hit{" "}
                <span className="mx-1 font-medium text-zinc-300">Run scan</span> to find some.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {fresh.map((j, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="w-16 shrink-0">
                      <FreshnessPill posted={j.posted} />
                    </span>
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 truncate text-sm hover:underline"
                    >
                      <span className="font-medium text-zinc-100">{j.company}</span>
                      <span className="text-zinc-500"> · {j.title}</span>
                    </a>
                    <MatchCell jd={`${j.company} ${j.title}`} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <SectionHeader
            title="Recent applications"
            action={
              <Link href="/applications" className="text-xs text-zinc-400 transition-colors hover:text-white">
                All
              </Link>
            }
          />
          <Card className="p-2">
            {recent.length === 0 ? (
              <EmptyState>No applications yet.</EmptyState>
            ) : (
              <ul className="space-y-1">
                {recent.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/[0.02]"
                  >
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
      </div>
    </div>
  );
}

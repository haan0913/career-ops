import { ExternalLink } from "lucide-react";
import { sync, getPipeline } from "@/lib/data";
import { Card, FreshnessPill, PageHeader, EmptyState } from "@/components/ui";
import { ScanBar } from "@/components/scan-bar";
import { MatchCell } from "@/components/match-cell";

export const dynamic = "force-dynamic";

function domain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function Pipeline() {
  sync();
  const jobs = getPipeline("pending");

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Pipeline" subtitle={`${jobs.length} fresh roles, newest first`}>
        <ScanBar />
      </PageHeader>

      {jobs.length === 0 ? (
        <EmptyState>Nothing in the pipeline. Run a scan to populate it.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Posted</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 text-right font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {jobs.map((j, i) => (
                <tr key={i} className="group transition-colors hover:bg-white/[0.02]">
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <FreshnessPill posted={j.posted} />
                  </td>
                  <td className="px-4 py-2.5">
                    <a
                      href={j.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5"
                    >
                      <span className="font-medium text-zinc-100">{j.company}</span>
                      <span className="text-zinc-500">{j.title}</span>
                      <ExternalLink className="size-3 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-500">
                    {domain(j.url)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <MatchCell jd={`${j.company} ${j.title}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

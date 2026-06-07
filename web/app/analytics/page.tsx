import {
  sync,
  getStats,
  getStatusDistribution,
  getFreshnessBuckets,
  getTopCompanies,
} from "@/lib/data";
import { Card, SectionHeader, Bar, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Analytics() {
  sync();
  const s = getStats();
  const status = getStatusDistribution();
  const fresh = getFreshnessBuckets();
  const companies = getTopCompanies(8);

  const maxStatus = Math.max(1, ...status.map((x) => x.count));
  const maxFresh = Math.max(1, ...fresh.map((x) => x.count));
  const maxCo = Math.max(1, ...companies.map((x) => x.count));

  const funnel = [
    { label: "Applied", value: s.totalApps, tone: "bg-zinc-500" },
    { label: "Interviewing", value: s.interviewing, tone: "bg-indigo-500" },
    { label: "Offers", value: s.offers, tone: "bg-emerald-500" },
  ];
  const maxFunnel = Math.max(1, ...funnel.map((f) => f.value));
  const freshTones = ["bg-emerald-500", "bg-lime-500", "bg-amber-500", "bg-zinc-600", "bg-zinc-700"];

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Analytics" subtitle="Pipeline health & outcomes" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Outcome funnel" />
          <div className="space-y-3.5">
            {funnel.map((f, i) => (
              <div key={i}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-zinc-400">{f.label}</span>
                  <span className="font-mono tabular-nums text-zinc-300">{f.value}</span>
                </div>
                <Bar value={f.value} max={maxFunnel} tone={f.tone} />
              </div>
            ))}
            <p className="pt-1 text-xs text-zinc-500">
              Response rate:{" "}
              <span className="font-mono text-zinc-300">
                {s.responseRate != null ? `${Math.round(s.responseRate * 100)}%` : "—"}
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Pipeline freshness" />
          <div className="space-y-3.5">
            {fresh.map((f, i) => (
              <div key={i}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-zinc-400">{f.label}</span>
                  <span className="font-mono tabular-nums text-zinc-300">{f.count}</span>
                </div>
                <Bar value={f.count} max={maxFresh} tone={freshTones[i]} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Applications by status" />
          {status.length === 0 ? (
            <p className="text-sm text-zinc-500">No applications yet.</p>
          ) : (
            <div className="space-y-3.5">
              {status.map((x, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <StatusBadge status={x.status} />
                    <span className="font-mono tabular-nums text-zinc-300">{x.count}</span>
                  </div>
                  <Bar value={x.count} max={maxStatus} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeader title="Top companies in pipeline" />
          {companies.length === 0 ? (
            <p className="text-sm text-zinc-500">Run a scan to populate the pipeline.</p>
          ) : (
            <div className="space-y-3.5">
              {companies.map((c, i) => (
                <div key={i}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="truncate text-zinc-300">{c.company}</span>
                    <span className="font-mono tabular-nums text-zinc-400">{c.count}</span>
                  </div>
                  <Bar value={c.count} max={maxCo} tone="bg-violet-500" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

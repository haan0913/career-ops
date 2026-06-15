import {
  sync,
  getStats,
  getStatusDistribution,
  getFreshnessBuckets,
  getTopCompanies,
  getLaneOutcomes,
  getMarketIntel,
} from "@/lib/data";
import { Card, SectionHeader, Bar, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Analytics() {
  sync();
  const s = getStats();
  const outcomes = getLaneOutcomes();
  const market = getMarketIntel();
  const maxRole = Math.max(1, ...market.roleDemand.map((x) => x.count));
  const maxComp = Math.max(1, ...market.compBands.map((x) => x.count));
  const maxGeo = Math.max(1, ...market.geoSplit.map((x) => x.count));
  const maxTrend = Math.max(1, ...market.discoveryTrend.map((x) => x.added));
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

        <Card className="p-5 lg:col-span-2">
          <SectionHeader title="What's converting — by lane" />
          {outcomes.totalApplied === 0 ? (
            <p className="text-sm text-zinc-500">
              No sent applications resolved yet. Once you log responses, interviews, and rejections in the tracker,
              this learns which lanes convert and feeds the fit ranking.
            </p>
          ) : (
            <>
              {!outcomes.dataReady && (
                <p className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200/90">
                  Tentative — only {outcomes.totalApplied} resolved application{outcomes.totalApplied === 1 ? "" : "s"} so far.
                  No lane has reached the sample size needed to influence ranking yet; shown for visibility only.
                </p>
              )}
              <div className="space-y-3">
                {outcomes.lanes.map((l) => (
                  <div key={l.lane} className="flex items-center gap-3 text-sm">
                    <span className="w-44 shrink-0 truncate text-zinc-300">{l.label}</span>
                    <div className="flex-1">
                      <Bar value={l.positive} max={Math.max(1, l.applied)} tone="bg-emerald-500" />
                    </div>
                    <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-400">
                      {l.positive}/{l.applied} {l.enough ? `· ${Math.round((l.rate ?? 0) * 100)}%` : "· n/a"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-zinc-600">
                &ldquo;Positive&rdquo; = responded, screened, interviewed, or offered. A lane needs ≥4 resolved applications
                before its rate is trusted enough to nudge the fit score.
              </p>
            </>
          )}
        </Card>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold tracking-tight text-zinc-200">
        Market intelligence
        <span className="ml-2 text-xs font-normal text-zinc-600">across {market.total} live roles in your lanes</span>
      </h2>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Demand by role family" />
          <div className="space-y-3.5">
            {market.roleDemand.slice(0, 8).map((r) => (
              <div key={r.label}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-zinc-400">{r.label}</span>
                  <span className="font-mono tabular-nums text-zinc-300">{r.count}</span>
                </div>
                <Bar value={r.count} max={maxRole} tone="bg-indigo-500" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Geographic split" />
          <div className="space-y-3.5">
            {market.geoSplit.map((g) => (
              <div key={g.label}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-zinc-400">{g.label}</span>
                  <span className="font-mono tabular-nums text-zinc-300">{g.count}</span>
                </div>
                <Bar value={g.count} max={maxGeo} tone="bg-sky-500" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Compensation distribution" />
          {market.withSalary === 0 ? (
            <p className="text-sm text-zinc-500">No employer-provided salaries in the current pipeline.</p>
          ) : (
            <div className="space-y-3.5">
              {market.compBands.map((b, i) => (
                <div key={b.label}>
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-zinc-400">{b.label}</span>
                    <span className="font-mono tabular-nums text-zinc-300">{b.count}</span>
                  </div>
                  <Bar value={b.count} max={maxComp} tone={["bg-rose-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"][i]} />
                </div>
              ))}
              <p className="pt-1 text-xs text-zinc-600">{market.withSalary} of {market.total} roles list pay; estimates excluded.</p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeader title="Discovery volume per scan" />
          {market.discoveryTrend.length < 2 ? (
            <p className="text-sm text-zinc-500">
              Trend builds as you scan — {market.discoveryTrend.length} run logged so far. Each scan records its new-role count here.
            </p>
          ) : (
            <div className="space-y-2.5">
              {market.discoveryTrend.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 font-mono text-zinc-500">{t.date}</span>
                  <div className="flex-1"><Bar value={t.added} max={maxTrend} tone="bg-violet-500" /></div>
                  <span className="w-8 shrink-0 text-right font-mono tabular-nums text-zinc-400">{t.added}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-zinc-600">New roles added per scan — early signal; more runs sharpen the trend.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

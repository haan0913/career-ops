import {
  sync,
  getStats,
  getStatusDistribution,
  getFreshnessBuckets,
  getTopCompanies,
  getLaneOutcomes,
  getMarketIntel,
  getFitDistribution,
} from "@/lib/data";
import { Card, SectionHeader, Bar, PageHeader, StatusBadge } from "@/components/ui";
import { Donut, Legend, Sparkline, Gauge } from "@/components/charts";

export const dynamic = "force-dynamic";

// Cohesive palettes — warm-to-cool so charts read at a glance.
const FIT_COLORS: Record<string, string> = {
  "Apply immediately": "#34d399",
  "Strong application": "#22d3ee",
  "Worth applying": "#818cf8",
  "Stretch but defensible": "#fbbf24",
  "Low probability": "#52525b",
};
const WHEEL = ["#818cf8", "#a855f7", "#22d3ee", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#c084fc"];

export default function Analytics() {
  sync();
  const s = getStats();
  const outcomes = getLaneOutcomes();
  const market = getMarketIntel();
  const fitDist = getFitDistribution();
  const status = getStatusDistribution();
  const fresh = getFreshnessBuckets();
  const companies = getTopCompanies(8);

  const maxComp = Math.max(1, ...market.compBands.map((x) => x.count));
  const maxStatus = Math.max(1, ...status.map((x) => x.count));
  const maxFresh = Math.max(1, ...fresh.map((x) => x.count));
  const maxCo = Math.max(1, ...companies.map((x) => x.count));

  const fitSlices = fitDist.map((f) => ({ label: f.label, value: f.count, color: FIT_COLORS[f.label] ?? "#52525b" }));
  const roleSlices = market.roleDemand.slice(0, 7).map((r, i) => ({ label: r.label, value: r.count, color: WHEEL[i % WHEEL.length] }));
  const geoSlices = market.geoSplit.map((g, i) => ({ label: g.label, value: g.count, color: WHEEL[i % WHEEL.length] }));
  const applyNow = fitDist.find((f) => f.label === "Apply immediately")?.count ?? 0;
  const freshTones = ["bg-emerald-500", "bg-lime-500", "bg-amber-500", "bg-zinc-600", "bg-zinc-700"];

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Analytics" subtitle="Pipeline health, fit distribution, and what the market is hiring in your lanes." />

      {/* ── Hero bento ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-1">
          <SectionHeader title="Fit distribution" />
          {fitSlices.length === 0 ? (
            <p className="text-sm text-zinc-500">Run a scan to populate fit.</p>
          ) : (
            <>
              <Donut data={fitSlices} center={String(s.pending)} centerSub="live roles scored" />
              <div className="mt-4">
                <Legend data={fitSlices} />
              </div>
            </>
          )}
        </Card>

        <Card className="flex flex-col justify-between p-5">
          <SectionHeader title="Discovery volume" />
          {market.discoveryTrend.length < 2 ? (
            <p className="text-sm text-zinc-500">
              Builds as you scan — {market.discoveryTrend.length} run logged. Each scan records new roles found.
            </p>
          ) : (
            <div>
              <div className="font-mono text-3xl font-semibold leading-none text-gradient tabular-nums">
                {market.discoveryTrend.at(-1)?.added ?? 0}
                <span className="ml-2 align-middle text-xs font-normal text-zinc-500">last scan</span>
              </div>
              <div className="mt-3">
                <Sparkline values={market.discoveryTrend.map((t) => t.added)} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
                <span>{market.discoveryTrend[0]?.date}</span>
                <span>{market.discoveryTrend.at(-1)?.date}</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeader title="Application funnel" />
          <div className="flex items-center gap-5">
            <Gauge value={s.responseRate != null ? s.responseRate * 100 : 0} label="response" />
            <div className="flex-1 space-y-2.5">
              {[
                { label: "Applied", value: s.totalApps, tone: "text-zinc-300" },
                { label: "Interviewing", value: s.interviewing, tone: "text-indigo-300" },
                { label: "Offers", value: s.offers, tone: "text-emerald-300" },
              ].map((f) => (
                <div key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">{f.label}</span>
                  <span className={`font-mono font-semibold tabular-nums ${f.tone}`}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-4 border-t border-white/[0.06] pt-2.5 text-xs text-zinc-500">
            <span className="font-mono text-emerald-300/90">{applyNow}</span> roles flagged
            <span className="text-emerald-300/90"> Apply immediately</span>
          </p>
        </Card>
      </div>

      {/* ── Market intelligence ────────────────────────────────────── */}
      <h2 className="mb-3 mt-10 text-sm font-semibold tracking-tight text-zinc-200">
        Market intelligence
        <span className="ml-2 text-xs font-normal text-zinc-600">across {market.total} live roles in your lanes</span>
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Demand by role family" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Donut data={roleSlices} size={120} />
            <div className="min-w-[180px] flex-1">
              <Legend data={roleSlices} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <SectionHeader title="Geographic split" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            <Donut data={geoSlices} size={120} />
            <div className="min-w-[180px] flex-1">
              <Legend data={geoSlices} />
            </div>
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
      </div>

      {/* ── Applications + companies ───────────────────────────────── */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
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

      {/* ── Outcome learning ───────────────────────────────────────── */}
      <Card className="mt-4 p-5">
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
  );
}

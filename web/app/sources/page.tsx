import { getRegistry } from "@/lib/sources";
import { PageHeader, StatCard, SectionHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const HEALTH_TONE: Record<string, string> = {
  healthy: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
  degraded: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
  stale: "text-zinc-400 bg-white/[0.04] ring-white/10",
  productive: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
  "no-matches": "text-zinc-500 bg-white/[0.03] ring-white/10",
};

function Pill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${HEALTH_TONE[status] ?? "text-zinc-400 bg-white/[0.04] ring-white/10"}`}>
      {status}
    </span>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(d)) return "never";
  return d <= 0 ? "today" : d === 1 ? "1d ago" : `${d}d ago`;
}

export default async function Sources() {
  const reg = await getRegistry();
  const s = reg.summary;

  if (s.providers === 0 && s.boardsConfigured === 0) {
    return (
      <div className="animate-fadeUp">
        <PageHeader title="Sources" subtitle="Coverage and health across every source." />
        <EmptyState>No source data yet. Run a scan to populate the registry.</EmptyState>
      </div>
    );
  }

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Sources"
        subtitle="What's covered, what's contributing unique inventory, and what's gone quiet."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Canonical jobs" value={s.canonicalJobs} sub={`${s.multiSourceJobs} seen on multiple sources`} />
        <StatCard label="Employer boards" value={s.boardsConfigured} sub={`${s.boardsProductive} productive · ${s.boardsNoMatches} no matches yet`} accent="text-indigo-300" />
        <StatCard label="Providers + searches" value={`${s.providers}+${s.jsearchSearches}`} sub="provider types · saved searches" />
        <StatCard label="Last scan" value={ago(s.lastScan)} sub={s.lastScanErrors != null ? `${s.lastScanErrors} errors` : "—"} accent={s.lastScanErrors ? "text-amber-300" : "text-white"} />
      </div>

      <section className="mb-8">
        <SectionHeader title="Providers — by unique contribution" />
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Source</th>
                <th className="px-3 py-2.5 text-left font-medium">Health</th>
                <th className="px-3 py-2.5 text-right font-medium">Added</th>
                <th className="px-3 py-2.5 text-right font-medium">Unique</th>
                <th className="px-3 py-2.5 text-right font-medium">Dupe rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Companies</th>
                <th className="px-4 py-2.5 text-right font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {reg.providers.map((p) => (
                <tr key={p.id} className="text-zinc-300 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-[13px] text-zinc-200">{p.id}</td>
                  <td className="px-3 py-2.5"><Pill status={p.health} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.added}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300/90">{p.unique}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{p.dupeRate > 0 ? `${Math.round(p.dupeRate * 100)}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-500">{p.companies}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-500">{ago(p.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <SectionHeader title={`Employer boards (${reg.boards.length})`} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reg.boards.map((b) => (
            <div key={b.name} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-900/30 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm text-zinc-200">{b.name}</div>
                <div className="text-[11px] text-zinc-600">
                  {b.added > 0 ? `${b.added} added · ${ago(b.lastSeen)}` : "no matches in your lanes yet"}
                </div>
              </div>
              <Pill status={b.status} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          &ldquo;No matches&rdquo; means the board is configured and enabled but nothing has entered your pipeline from it —
          it may be filtered out by your title/location lanes rather than empty.
        </p>
      </section>
    </div>
  );
}

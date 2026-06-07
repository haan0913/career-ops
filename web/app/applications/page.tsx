import { sync, getApplications } from "@/lib/data";
import { Card, StatusBadge, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Applications() {
  sync();
  const apps = getApplications();

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Applications" subtitle={`${apps.length} tracked`} />

      {apps.length === 0 ? (
        <EmptyState>No applications tracked yet.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-[11px] uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Company</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Fit</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {apps.map((a, i) => (
                <tr key={i} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{a.number}</td>
                  <td className="px-4 py-2.5 font-medium text-zinc-100">{a.company}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{a.role}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-zinc-500">{a.date}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-300">{a.score}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={a.status} />
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

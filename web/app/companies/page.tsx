import Link from "next/link";
import { sync, getCompanies } from "@/lib/data";
import { PageHeader, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function Companies() {
  sync();
  const companies = getCompanies();

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Companies" subtitle={`${companies.length} employers across your pipeline`} />
      {companies.length === 0 ? (
        <EmptyState>No companies yet. Run a scan to populate the pipeline.</EmptyState>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Company</th>
                <th className="px-3 py-2.5 text-right font-medium">Openings</th>
                <th className="px-3 py-2.5 text-right font-medium">Fresh (7d)</th>
                <th className="px-4 py-2.5 text-right font-medium">You applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {companies.map((c) => (
                <tr key={c.company} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${encodeURIComponent(c.company)}`} className="font-medium text-zinc-100 hover:text-indigo-300 hover:underline">
                      {c.company}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-zinc-300">{c.openings}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300/80">{c.fresh || "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-zinc-400">{c.applied || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

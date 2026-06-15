import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin } from "lucide-react";
import { sync, getCompany } from "@/lib/data";
import { PageHeader, Card, SectionHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  sync();
  const c = getCompany(decodeURIComponent(slug));
  if (!c) notFound();

  const live = c.openings.filter((j) => j.liveness !== "dead");

  return (
    <div className="animate-fadeUp">
      <Link href="/companies" className="mb-4 inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="size-3.5" /> All companies
      </Link>
      <PageHeader
        title={c.company}
        subtitle={`${live.length} live opening${live.length === 1 ? "" : "s"}${c.applications.length ? ` · you've applied ${c.applications.length}×` : ""}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader title="Open roles" />
          <Card className="p-0">
            {live.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">No live openings right now.</p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {live.map((j) => (
                  <li key={j.url} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]">
                    <div className="min-w-0 flex-1">
                      <a href={j.apply_url || j.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-zinc-100 hover:underline">
                        {j.title}
                      </a>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                        {j.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{j.location}</span>}
                        {j.posted && <span>· {j.posted}</span>}
                      </div>
                    </div>
                    <ExternalLink className="size-3.5 shrink-0 text-zinc-600" />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <SectionHeader title="Role mix" />
            <Card className="space-y-1.5 p-4 text-sm">
              {c.roleMix.length === 0 ? (
                <p className="text-zinc-500">—</p>
              ) : (
                c.roleMix.map((r) => (
                  <div key={r.role} className="flex justify-between">
                    <span className="text-zinc-300">{r.role}</span>
                    <span className="font-mono tabular-nums text-zinc-500">{r.count}</span>
                  </div>
                ))
              )}
              {c.sources.length > 0 && (
                <p className="border-t border-white/[0.06] pt-2 text-xs text-zinc-600">
                  via {c.sources.join(", ")}
                </p>
              )}
            </Card>
          </div>

          {c.applications.length > 0 && (
            <div>
              <SectionHeader title="Your history" />
              <Card className="space-y-1 p-2">
                {c.applications.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{a.role}</div>
                      <div className="text-xs text-zinc-600">{a.date}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

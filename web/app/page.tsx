import { syncAll } from "@/lib/sync";
import { sqlite } from "@/db";

export const dynamic = "force-dynamic"; // re-read the md/TSV on every load

type App = { number: number; company: string; role: string; score: string; status: string };
type Job = { url: string; company: string; title: string; posted: string };

export default function Home() {
  syncAll();
  const apps = sqlite.prepare("SELECT * FROM applications ORDER BY number DESC").all() as App[];
  const pending = sqlite
    .prepare("SELECT * FROM jobs WHERE state='pending' ORDER BY (posted='') ASC, posted DESC")
    .all() as Job[];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">career-ops</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {apps.length} applications · {pending.length} fresh in pipeline
          </p>
        </header>

        <section className="mb-10">
          <h2 className="mb-3 text-lg font-semibold">Pipeline — fresh, newest first</h2>
          <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
            {pending.length === 0 && (
              <li className="p-4 text-sm text-zinc-500">No pending roles. Run a scan.</li>
            )}
            {pending.map((j, i) => (
              <li key={i} className="flex items-center gap-4 p-3 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-zinc-400">{j.posted || "—"}</span>
                <a href={j.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                  <span className="font-medium">{j.company}</span>
                  <span className="text-zinc-500"> · {j.title}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Applications</h2>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="p-3 font-medium">#</th>
                  <th className="p-3 font-medium">Company</th>
                  <th className="p-3 font-medium">Role</th>
                  <th className="p-3 font-medium">Score</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                {apps.map((a, i) => (
                  <tr key={i}>
                    <td className="p-3 tabular-nums text-zinc-400">{a.number}</td>
                    <td className="p-3 font-medium">{a.company}</td>
                    <td className="p-3">{a.role}</td>
                    <td className="p-3 tabular-nums">{a.score}</td>
                    <td className="p-3">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const color = s.includes("offer")
    ? "bg-green-100 text-green-800"
    : s.includes("interview") || s.includes("entrevista")
      ? "bg-blue-100 text-blue-800"
      : s.includes("applied") || s.includes("aplicado")
        ? "bg-amber-100 text-amber-800"
        : s.includes("reject") || s.includes("descart")
          ? "bg-red-100 text-red-800"
          : "bg-zinc-100 text-zinc-700";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${color}`}>{status || "—"}</span>;
}

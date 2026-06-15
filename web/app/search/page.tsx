import { sync, getLaneSignal } from "@/lib/data";
import { searchJobs, hasExpansion } from "@/lib/search";
import { PageHeader, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/search-box";
import { PipelineGrid } from "@/components/pipeline-grid";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  sync();
  const query = q.trim();
  const results = query ? searchJobs(query) : [];
  const laneSignal = getLaneSignal();

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Search"
        subtitle="Full-text across every title, company, and job description in your corpus — then narrow with the facets below."
      />
      <div className="mb-5">
        <SearchBox initial={query} />
      </div>

      {!query ? (
        <EmptyState>
          Search the whole corpus. Try a role (<span className="text-zinc-400">implementation coordinator</span>),
          a skill (<span className="text-zinc-400">power bi</span>), or an exact phrase
          (<span className="text-zinc-400">&quot;degree or equivalent&quot;</span>).
        </EmptyState>
      ) : results.length === 0 ? (
        <EmptyState>
          No matches for <span className="text-zinc-300">{query}</span>. Try fewer or broader terms.
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-500">
            {results.length} match{results.length === 1 ? "" : "es"} for{" "}
            <span className="text-zinc-300">{query}</span>
            {hasExpansion(query) && <span className="text-indigo-300/70"> · including related terms (e.g. acronyms, synonyms)</span>}
          </p>
          <PipelineGrid jobs={results} laneSignal={laneSignal} />
        </>
      )}
    </div>
  );
}

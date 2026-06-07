import { sync, getPipeline } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { ScanBar } from "@/components/scan-bar";
import { PipelineGrid } from "@/components/pipeline-grid";

export const dynamic = "force-dynamic";

export default function Pipeline() {
  sync();
  const jobs = getPipeline("pending");

  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Pipeline"
        subtitle={`${jobs.length} fresh roles · click any card to read the description inline`}
      >
        <ScanBar />
      </PageHeader>

      {jobs.length === 0 ? (
        <EmptyState>Nothing in the pipeline. Run a scan to populate it.</EmptyState>
      ) : (
        <PipelineGrid jobs={jobs} />
      )}
    </div>
  );
}

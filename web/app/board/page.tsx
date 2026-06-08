import { sync, getApplications } from "@/lib/data";
import { PageHeader, EmptyState } from "@/components/ui";
import { Board } from "@/components/board";

export const dynamic = "force-dynamic";

export default function BoardPage() {
  sync();
  const apps = getApplications();

  return (
    <div className="animate-fadeUp">
      <PageHeader title="Board" subtitle="Drag a role across stages — changes save to your tracker" />
      {apps.length === 0 ? (
        <EmptyState>No applications yet.</EmptyState>
      ) : (
        <Board apps={apps} />
      )}
    </div>
  );
}

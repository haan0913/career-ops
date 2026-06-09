import { getSourcing } from "@/lib/sourcing";
import { PageHeader } from "@/components/ui";
import { DiscoverManager } from "@/components/discover-manager";

export const dynamic = "force-dynamic";

export default async function Discover() {
  const sourcing = await getSourcing();
  return (
    <div className="animate-fadeUp">
      <PageHeader
        title="Discover"
        subtitle="Choose the roles and places you want — your searches drive what gets sourced on the next scan."
      />
      <DiscoverManager initial={sourcing.searches} atsCount={sourcing.atsCount} />
    </div>
  );
}

import { getSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="animate-fadeUp">
      <PageHeader title="Settings" subtitle="Your profile — identity, comp, target roles, and how roles get scored" />
      <SettingsForm profile={s.profile ?? {}} profileMd={s.profileMd ?? ""} />
    </div>
  );
}

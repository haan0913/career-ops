"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Save } from "lucide-react";
import { saveSettings, type Profile } from "@/lib/settings";
import { Card, SectionHeader } from "@/components/ui";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-indigo-500/50"
      />
    </label>
  );
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

export function SettingsForm({ profile, profileMd }: { profile: Profile; profileMd: string }) {
  const c = profile.candidate ?? {};
  const comp = profile.compensation ?? {};

  const [fullName, setFullName] = useState(str(c.full_name));
  const [email, setEmail] = useState(str(c.email));
  const [phone, setPhone] = useState(str(c.phone));
  const [loc, setLoc] = useState(str(c.location));
  const [linkedin, setLinkedin] = useState(str(c.linkedin));
  const [minComp, setMinComp] = useState(str(comp.minimum));
  const [targetComp, setTargetComp] = useState(str(comp.target_range));
  const [band, setBand] = useState(str(comp.realistic_band));
  const [flex, setFlex] = useState(str(comp.location_flexibility));
  const [roles, setRoles] = useState((profile.target_roles?.primary ?? []).join("\n"));
  const [md, setMd] = useState(profileMd);

  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const router = useRouter();

  function save() {
    setSaved(false);
    setErr("");
    const updates = {
      profile: {
        candidate: { full_name: fullName, email, phone, location: loc, linkedin },
        compensation: {
          minimum: minComp,
          target_range: targetComp,
          realistic_band: band,
          location_flexibility: flex,
        },
        target_roles: {
          primary: roles
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      },
      profileMd: md,
    };
    start(async () => {
      const r = await saveSettings(updates);
      if (r.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } else {
        setErr(r.error || "save failed");
      }
    });
  }

  return (
    <div className="space-y-6 pb-24">
      <Card className="p-5">
        <SectionHeader title="Identity" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" value={fullName} onChange={setFullName} />
          <Field label="Email" value={email} onChange={setEmail} />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <Field label="Location" value={loc} onChange={setLoc} />
          <Field label="LinkedIn" value={linkedin} onChange={setLinkedin} />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Compensation" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum (screening floor)" value={minComp} onChange={setMinComp} placeholder="$70,000" />
          <Field label="Target" value={targetComp} onChange={setTargetComp} placeholder="$120,000" />
          <Field label="Realistic band" value={band} onChange={setBand} placeholder="$70,000-$110,000" />
          <Field label="Location flexibility" value={flex} onChange={setFlex} placeholder="NYC; hybrid; remote-US ok" />
        </div>
      </Card>

      <Card className="p-5">
        <SectionHeader title="Target roles" />
        <p className="mb-2 text-xs text-zinc-500">One role per line — the lanes you want surfaced and scored highest.</p>
        <textarea
          value={roles}
          onChange={(e) => setRoles(e.target.value)}
          rows={5}
          spellCheck={false}
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-sm text-zinc-100 outline-none focus:border-indigo-500/50"
        />
      </Card>

      <Card className="p-5">
        <SectionHeader title="Archetypes, scoring & writing style" />
        <p className="mb-2 text-xs text-zinc-500">
          The full profile the evaluator reads (<span className="font-mono">modes/_profile.md</span>) — archetypes,
          A–F scoring calibration, and writing voice. Markdown.
        </p>
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          rows={22}
          spellCheck={false}
          className="w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed text-zinc-200 outline-none focus:border-indigo-500/50"
        />
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/[0.08] bg-zinc-950/90 px-8 py-3 backdrop-blur-xl sm:left-60">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
          {err && <span className="text-sm text-rose-400">{err}</span>}
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
              <Check className="size-4" /> Saved to your config
            </span>
          )}
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-colors hover:bg-indigo-400 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Saving" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

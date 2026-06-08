"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ROOT } from "./paths";

const run = promisify(execFile);

export type Profile = {
  candidate?: Record<string, unknown>;
  compensation?: Record<string, unknown>;
  target_roles?: { primary?: string[]; [k: string]: unknown };
  [k: string]: unknown;
};

export async function getSettings(): Promise<{ ok: boolean; profile: Profile; profileMd: string }> {
  try {
    const { stdout } = await run("node", ["config-io.mjs", "read"], {
      cwd: ROOT,
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } catch {
    return { ok: false, profile: {}, profileMd: "" };
  }
}

// Writes through config-io.mjs (deep-merge + backup) — the dashboard never edits the
// config files directly. Updates go via a temp JSON file to handle large markdown safely.
export async function saveSettings(updates: {
  profile?: Profile;
  profileMd?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const tmp = join(tmpdir(), `career-ops-settings-${randomUUID()}.json`);
  await writeFile(tmp, JSON.stringify(updates), "utf8");
  try {
    const { stdout } = await run("node", ["config-io.mjs", "write", tmp], { cwd: ROOT, timeout: 15_000 });
    return JSON.parse(stdout.trim());
  } catch (e) {
    try {
      await unlink(tmp);
    } catch {
      /* best-effort */
    }
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

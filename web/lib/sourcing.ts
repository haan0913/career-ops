"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { ROOT } from "./paths";

const run = promisify(execFile);

export type SavedSearch = {
  name: string;
  query: string;
  datePosted: string; // today | 3days | week | month | all
  numPages: number;
  country: string;
  enabled: boolean;
};

export type Sourcing = {
  ok: boolean;
  searches: SavedSearch[];
  titleFilter: { positive: string[]; negative: string[] };
  locationFilter: { allow: string[]; block: string[] };
  atsCount: number;
};

// Read the user's sourcing config (jsearch saved searches + filters) from portals.yml.
export async function getSourcing(): Promise<Sourcing> {
  try {
    const { stdout } = await run("node", ["sourcing-io.mjs", "read"], {
      cwd: ROOT,
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } catch {
    return { ok: false, searches: [], titleFilter: { positive: [], negative: [] }, locationFilter: { allow: [], block: [] }, atsCount: 0 };
  }
}

// Persist saved searches (and optionally the filters) through sourcing-io.mjs, which
// preserves every ATS board + seniority_boost and backs portals.yml up to .bak.
export async function saveSourcing(updates: {
  searches?: SavedSearch[];
  titleFilter?: { positive: string[]; negative: string[] };
  locationFilter?: { allow: string[]; block: string[] };
}): Promise<{ ok: boolean; error?: string; searches?: number }> {
  const tmp = join(tmpdir(), `career-ops-sourcing-${randomUUID()}.json`);
  await writeFile(tmp, JSON.stringify(updates), "utf8");
  try {
    const { stdout } = await run("node", ["sourcing-io.mjs", "write", tmp], { cwd: ROOT, timeout: 15_000 });
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

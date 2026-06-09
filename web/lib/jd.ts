"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./paths";
import { readSnapshot } from "./snapshot";

const run = promisify(execFile);

export type ApplyOption = { url: string; publisher?: string; isDirect?: boolean };

export type JdResult = {
  ok: boolean;
  url: string;
  cached?: boolean; // served from the scan-time snapshot store (instant, dead-link-proof)
  source?: string;
  title?: string;
  company?: string;
  location?: string;
  mode?: string;
  employmentType?: string;
  salary?: string;
  posted?: string;
  validThrough?: string;
  publisher?: string;
  logo?: string;
  applyUrl?: string;
  googleLink?: string;
  applyOptions?: ApplyOption[];
  descriptionHtml?: string;
  reason?: string;
  error?: string;
};

// Snapshot-first: a scan-time snapshot (data/jd) is read IN-PROCESS — no child
// process, so the common path is instant and immune to `node` spawn failures
// (the production server can hit STATUS_DLL_INIT_FAILED under Windows process
// pressure). Only rows WITHOUT a snapshot fall back to spawning jd-fetch.mjs
// for a live tiered fetch (ATS API → JSON-LD → browser render).
export async function fetchJd(url: string): Promise<JdResult> {
  const snap = readSnapshot(url);
  if (snap && typeof snap.descriptionHtml === "string" && snap.descriptionHtml.length >= 200) {
    return { ok: true, cached: true, ...snap, url } as JdResult;
  }

  try {
    const { stdout } = await run("node", ["jd-fetch.mjs", url], {
      cwd: ROOT,
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim());
  } catch (e) {
    return { ok: false, url, error: String((e as Error)?.message || e) };
  }
}

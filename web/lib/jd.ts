"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./paths";

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

// Spawns the repo-root jd-fetch.mjs (tiered: ATS API → JSON-LD → browser render).
export async function fetchJd(url: string): Promise<JdResult> {
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

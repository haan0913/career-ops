"use server";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./paths";

const run = promisify(execFile);

// Server actions spawn the existing hardened CLIs from the repo root (reusing its
// node_modules, .env, model cache, and the tier-aware liveness gate) — no logic is
// duplicated in the dashboard.

export async function runScan(maxAgeDays = 30): Promise<{ added: number; tail: string }> {
  // Real scan: writes fresh roles to data/pipeline.md (Tier-1 direct, Tier-2 gated).
  const { stdout } = await run("node", ["scan.mjs", "--max-age-days", String(maxAgeDays)], {
    cwd: ROOT,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const added = Number(stdout.match(/New offers added:\s*(\d+)/)?.[1] ?? 0);
  return { added, tail: stdout.split("\n").slice(-20).join("\n") };
}

export async function scoreRole(jd: string): Promise<{ score: number; mode: string }> {
  const { stdout } = await run("node", ["match-score.mjs", "--jd", jd, "--json"], {
    cwd: ROOT,
    timeout: 90_000,
  });
  return JSON.parse(stdout.trim());
}

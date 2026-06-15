import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ROOT } from "./paths";

const run = promisify(execFile);

export type ProviderHealth = {
  id: string;
  rows: number;
  added: number;
  skipped: number;
  companies: number;
  lastSeen: string | null;
  ageDays: number | null;
  unique: number;
  contributed: number;
  dupeRate: number;
  health: "healthy" | "degraded" | "stale";
};

export type BoardHealth = {
  name: string;
  url: string;
  enabled: boolean;
  added: number;
  lastSeen: string | null;
  status: "productive" | "stale" | "no-matches";
};

export type ScanRun = {
  ts: string;
  date: string;
  companies: number;
  found: number;
  added: number;
  merged: number;
  dupes: number;
  errors: number;
  duration_ms: number;
  error_sources: string[];
};

export type Registry = {
  summary: {
    providers: number;
    boardsConfigured: number;
    boardsProductive: number;
    boardsNoMatches: number;
    jsearchSearches: number;
    canonicalJobs: number;
    multiSourceJobs: number;
    lastScan: string | null;
    lastScanErrors: number | null;
  };
  providers: ProviderHealth[];
  boards: BoardHealth[];
  runs: ScanRun[];
  lastErrorSources: string[];
};

const EMPTY: Registry = {
  summary: {
    providers: 0, boardsConfigured: 0, boardsProductive: 0, boardsNoMatches: 0,
    jsearchSearches: 0, canonicalJobs: 0, multiSourceJobs: 0, lastScan: null, lastScanErrors: null,
  },
  providers: [], boards: [], runs: [], lastErrorSources: [],
};

// Synthesized by the engine (source-registry.mjs) from portals.yml + scan
// history + canonical store. Spawned the same way the Discover page loads
// sourcing config; returns an empty registry if the spawn fails.
export async function getRegistry(): Promise<Registry> {
  try {
    const { stdout } = await run("node", ["source-registry.mjs", "--json"], {
      cwd: ROOT,
      timeout: 20_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(stdout.trim()) as Registry;
  } catch {
    return EMPTY;
  }
}

import "server-only";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import path from "path";
import { JD_DIR } from "./paths";

// In-process reader for the JD snapshot store (data/jd/<sha1(url)>.json), written
// at scan time by jd-store.mjs. The dashboard reads snapshots DIRECTLY here — no
// child process — so the common path (a job that already has a snapshot) never
// depends on spawning `node`, which the production server can fail to do under
// Windows process pressure (STATUS_DLL_INIT_FAILED / 0xC0000142).

export type JdSnapshot = {
  url: string;
  descriptionHtml?: string;
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
  applyOptions?: { url: string; publisher?: string; isDirect?: boolean }[];
  source?: string;
};

// Must match jd-store.mjs snapshotKey(): sha1(url) hex, first 16 chars.
function snapshotPath(url: string): string {
  const key = createHash("sha1").update(String(url)).digest("hex").slice(0, 16);
  return path.join(JD_DIR, key + ".json");
}

export function readSnapshot(url: string): JdSnapshot | null {
  try {
    const p = snapshotPath(url);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf-8")) as JdSnapshot;
  } catch {
    return null;
  }
}

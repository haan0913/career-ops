// jd-store.mjs — JD snapshot store. One JSON file per job URL under data/jd/.
//
// The proper-aggregator pattern: a job's full description + apply metadata is
// captured ONCE at scan time (from the provider payload — jsearch job_description,
// greenhouse content=true) and persisted here. The dashboard then reads the
// snapshot instead of live-fetching the employer page, so the JD is shown
// instantly and stays readable even after the employer link rots (the #1 failure
// mode of aggregator links).
//
// Snapshots are user-layer data — they live under data/ which is gitignored.
// The store is keyed by a hash of the job URL (the same dedup key scan.mjs uses),
// so a snapshot lines up 1:1 with a pipeline.md row.

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Anchor to the repo root (this file's directory) so the store resolves to the
// same data/ dir whether scan.mjs, jd-fetch.mjs, or the dashboard spawned us.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const JD_DIR = path.join(ROOT, 'data', 'jd');

export function snapshotKey(url) {
  return createHash('sha1').update(String(url)).digest('hex').slice(0, 16);
}

export function snapshotPath(url) {
  return path.join(JD_DIR, snapshotKey(url) + '.json');
}

export function hasSnapshot(url) {
  return existsSync(snapshotPath(url));
}

export function readSnapshot(url) {
  try {
    const p = snapshotPath(url);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf-8'));
  } catch {
    return null;
  }
}

// Persist a snapshot. Requires `url` (the key) and ideally `descriptionHtml`.
// Returns true on write. Callers gate on description length before calling.
export function writeSnapshot(snap) {
  if (!snap || !snap.url) return false;
  mkdirSync(JD_DIR, { recursive: true });
  const out = { schema: 1, fetchedAt: new Date().toISOString(), ...snap };
  writeFileSync(snapshotPath(snap.url), JSON.stringify(out, null, 2), 'utf-8');
  return true;
}

export { JD_DIR };

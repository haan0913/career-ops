/**
 * liveness-store.mjs — per-URL liveness verdicts (data/liveness.jsonl).
 *
 * One record per job URL: { url, status, lastVerified, reason, via }.
 *   status: 'live' | 'dead' | 'unknown'
 *
 * Separate from the canonical job store so a liveness re-check never rewrites
 * pipeline.md (the human source of truth). The dashboard reads this to show a
 * status chip and auto-hide dead listings from the default view — reversible,
 * nothing is deleted.
 *
 * Seeding is reliable (derives 'dead' from signals already in scan-history.tsv
 * and pipeline.md). Active re-verification (Playwright) is on-demand via
 * liveness-sweep.mjs, kept out of the page-load path.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const LIVENESS_PATH = path.join(ROOT, 'data', 'liveness.jsonl');
const HISTORY_PATH = path.join(ROOT, 'data', 'scan-history.tsv');
const PIPELINE_PATH = path.join(ROOT, 'data', 'pipeline.md');

export function loadLiveness(file = LIVENESS_PATH) {
  const map = new Map();
  if (!existsSync(file)) return map;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t);
      if (rec.url) map.set(rec.url, rec);
    } catch { /* skip corrupt line */ }
  }
  return map;
}

export function saveLiveness(map, file = LIVENESS_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  const lines = [...map.values()].map((r) => JSON.stringify(r));
  writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''), 'utf-8');
}

export function setVerdict(map, url, status, reason = '', via = 'sweep', date = new Date().toISOString()) {
  map.set(url, { url, status, lastVerified: date, reason, via });
  return map;
}

/**
 * Seed 'dead' verdicts from signals already on disk:
 *   - scan-history.tsv rows with status skipped_expired
 *   - pipeline.md lines marked [!] (… DEAD …)
 * Existing records win unless they're older/unknown — seeding never downgrades
 * a confirmed-live verdict from an actual re-check.
 */
export function seedFromHistory(map = loadLiveness()) {
  let added = 0;
  if (existsSync(HISTORY_PATH)) {
    for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const c = line.split('\t');
      const url = c[0];
      const status = c[5];
      if (!url) continue;
      if (status === 'skipped_expired') {
        const cur = map.get(url);
        if (!cur || cur.status === 'unknown') {
          setVerdict(map, url, 'dead', 'expired at scan time', 'scan-history', `${c[1] || ''}T00:00:00Z`);
          added++;
        }
      }
    }
  }
  if (existsSync(PIPELINE_PATH)) {
    for (const line of readFileSync(PIPELINE_PATH, 'utf-8').split('\n')) {
      const m = line.match(/^- \[!\]\s*(?:#\d+\s*)?(https?:\/\/\S+)/);
      if (!m) continue;
      const url = m[1];
      const cur = map.get(url);
      if (!cur || cur.status === 'unknown') {
        setVerdict(map, url, 'dead', 'marked DEAD in pipeline', 'pipeline-marker');
        added++;
      }
    }
  }
  return { map, added };
}

// ── CLI: node liveness-store.mjs seed ──────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('seed')) {
    const { map, added } = seedFromHistory();
    saveLiveness(map);
    const dead = [...map.values()].filter((r) => r.status === 'dead').length;
    console.log(`seeded ${added} dead verdict(s); store now ${map.size} records (${dead} dead).`);
  } else {
    const map = loadLiveness();
    const by = {};
    for (const r of map.values()) by[r.status] = (by[r.status] || 0) + 1;
    console.log(`liveness store: ${map.size} records`, by);
  }
}

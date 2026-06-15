/**
 * liveness-sweep.mjs — re-verify pipeline URLs and record verdicts.
 *
 * Seeds dead verdicts from existing signals, then (unless --seed-only) uses the
 * same Playwright check as check-liveness.mjs to re-verify pending pipeline URLs
 * that haven't been checked within the cadence window. Sequential (project rule:
 * never Playwright in parallel) and best-effort: if Playwright isn't installed
 * the sweep still completes with the seeded verdicts.
 *
 * This is meant to run on a cadence (manually, or wire it to a scheduled task) —
 * it is deliberately NOT invoked during dashboard page loads.
 *
 *   node liveness-sweep.mjs --seed-only         # no browser, just derive dead
 *   node liveness-sweep.mjs                      # re-verify stale (default 4d)
 *   node liveness-sweep.mjs --max-age-days 7 --limit 20
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLiveness, saveLiveness, setVerdict, seedFromHistory } from './liveness-store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PIPELINE_PATH = path.join(ROOT, 'data', 'pipeline.md');

const args = process.argv.slice(2);
const seedOnly = args.includes('--seed-only');
const limitFlag = args.indexOf('--limit');
const limit = limitFlag !== -1 ? parseInt(args[limitFlag + 1], 10) : Infinity;
const ageFlag = args.indexOf('--max-age-days');
const maxAgeDays = ageFlag !== -1 ? parseInt(args[ageFlag + 1], 10) : 4;

function pendingUrls() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const urls = [];
  for (const line of readFileSync(PIPELINE_PATH, 'utf-8').split('\n')) {
    const m = line.match(/^- \[ \] (https?:\/\/\S+)/);
    if (m) urls.push(m[1]);
  }
  return urls;
}

function staleEnough(rec) {
  if (!rec || !rec.lastVerified) return true;
  const days = (Date.now() - Date.parse(rec.lastVerified)) / 86_400_000;
  return !Number.isFinite(days) || days >= maxAgeDays;
}

async function main() {
  const { map, added } = seedFromHistory();
  console.log(`seeded ${added} dead verdict(s) from history.`);

  if (seedOnly) {
    saveLiveness(map);
    summarize(map);
    return;
  }

  // Re-verify pending URLs whose verdict is stale or missing (skip known-dead).
  const candidates = pendingUrls().filter((u) => {
    const rec = map.get(u);
    if (rec && rec.status === 'dead') return false;
    return staleEnough(rec);
  }).slice(0, limit);

  if (candidates.length === 0) {
    console.log('Nothing stale to re-verify.');
    saveLiveness(map);
    summarize(map);
    return;
  }

  let chromium, checkUrlLiveness;
  try {
    ({ chromium } = await import('playwright'));
    ({ checkUrlLiveness } = await import('./liveness-browser.mjs'));
  } catch (e) {
    console.error(`⚠️  Playwright unavailable (${e.message.split('\n')[0]}) — keeping seeded verdicts only.`);
    saveLiveness(map);
    summarize(map);
    return;
  }

  console.log(`Re-verifying ${candidates.length} pending URL(s) (sequential)...`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let live = 0, dead = 0, unknown = 0;
  for (const url of candidates) {
    try {
      const { result, reason } = await checkUrlLiveness(page, url);
      if (result === 'active') { setVerdict(map, url, 'live', reason || 'verified active', 'sweep'); live++; }
      else if (result === 'expired') { setVerdict(map, url, 'dead', reason || 'expired', 'sweep'); dead++; }
      else { setVerdict(map, url, 'unknown', reason || 'uncertain', 'sweep'); unknown++; }
    } catch (e) {
      setVerdict(map, url, 'unknown', `check failed: ${e.message.split('\n')[0]}`, 'sweep');
      unknown++;
    }
  }
  await browser.close();
  console.log(`re-verified: ${live} live  ${dead} dead  ${unknown} unknown`);
  saveLiveness(map);
  summarize(map);
}

function summarize(map) {
  const by = {};
  for (const r of map.values()) by[r.status] = (by[r.status] || 0) + 1;
  console.log(`liveness store: ${map.size} records`, by);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

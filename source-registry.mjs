/**
 * source-registry.mjs — per-source health & contribution, synthesized from
 * existing data (no new capture needed beyond data/scan-runs.tsv):
 *   portals.yml          — what's CONFIGURED (provider types + employer boards)
 *   data/scan-history.tsv — what was actually DISCOVERED (per provider/company)
 *   data/jobs.jsonl       — canonical entities → unique vs duplicate contribution
 *   data/scan-runs.tsv    — last-scan time, run volume, which sources errored
 *
 * Answers the coverage questions the mandate centers on: which sources add
 * unique fresh inventory, which add mostly duplicates, which are silent or
 * stale, and which errored on the last run.
 *
 *   node source-registry.mjs          # human summary
 *   node source-registry.mjs --json   # machine JSON (dashboard reads this)
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import yaml from 'js-yaml';
import { loadJobs } from './jobs-store.mjs';
import { normalizeCompany } from './canonical.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const P = (rel) => path.join(ROOT, rel);

const STALE_DAYS = 21; // a configured board silent this long is "stale"

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return Infinity;
  return Math.floor((Date.now() - t) / 86_400_000);
}

function readScanHistory() {
  const f = P('data/scan-history.tsv');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf-8').split('\n').slice(1).filter(Boolean).map((line) => {
    const [url, first_seen, portal, title, company, status, location, posted] = line.split('\t');
    return { url, first_seen, portal, title, company, status, location, posted };
  });
}

function readScanRuns() {
  const f = P('data/scan-runs.tsv');
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf-8').split('\n').slice(1).filter(Boolean).map((line) => {
    const [ts, date, companies, found, added, merged, dupes, errors, duration_ms, error_sources] = line.split('\t');
    return {
      ts, date,
      companies: +companies, found: +found, added: +added, merged: +merged,
      dupes: +dupes, errors: +errors, duration_ms: +duration_ms,
      error_sources: (error_sources || '').split(';').filter(Boolean),
    };
  });
}

export function buildRegistry() {
  const portals = existsSync(P('portals.yml')) ? yaml.load(readFileSync(P('portals.yml'), 'utf-8')) : {};
  const allTracked = (portals.tracked_companies || []);
  // JSearch saved searches live in tracked_companies with provider: jsearch (or a
  // `query` field) — they're aggregator searches, not employer boards. Split them out.
  const isJsearch = (e) => e.provider === 'jsearch' || typeof e.query === 'string';
  const boardsCfg = allTracked.filter((e) => !isJsearch(e));
  const jsearchCfg = allTracked.filter(isJsearch);
  const history = readScanHistory();
  const runs = readScanRuns();
  const jobs = loadJobs();

  // ── Per-provider rollup (greenhouse-api, jsearch-api, …) ────────────────
  const providers = new Map();
  for (const r of history) {
    const id = (r.portal || 'unknown').trim();
    if (!providers.has(id)) providers.set(id, { id, rows: 0, added: 0, skipped: 0, lastSeen: '', companies: new Set() });
    const p = providers.get(id);
    p.rows++;
    if (r.status === 'added') p.added++; else p.skipped++;
    if (r.company) p.companies.add(normalizeCompany(r.company));
    if (r.first_seen > p.lastSeen) p.lastSeen = r.first_seen;
  }
  // Unique vs duplicate contribution from the canonical store.
  for (const job of jobs) {
    const srcIds = job.sources.map((s) => (s.source || '').trim());
    const distinct = [...new Set(srcIds)];
    const soleSource = distinct.length === 1;
    for (const id of distinct) {
      const p = providers.get(id);
      if (!p) continue;
      p.contributed = (p.contributed || 0) + 1;
      if (soleSource && job.sources.length === 1) p.unique = (p.unique || 0) + 1;
      else p.inMerged = (p.inMerged || 0) + 1;
    }
  }

  const lastErrorSources = new Set(runs.length ? runs[runs.length - 1].error_sources : []);
  const providerList = [...providers.values()].map((p) => {
    const contributed = p.contributed || 0;
    const dupeRate = contributed ? +(1 - (p.unique || 0) / contributed).toFixed(2) : 0;
    let health = 'healthy';
    if (daysSince(p.lastSeen) > STALE_DAYS) health = 'stale';
    if (p.added === 0 && p.rows > 0) health = 'degraded'; // scanned but never produced a kept job
    return {
      id: p.id, rows: p.rows, added: p.added, skipped: p.skipped,
      companies: p.companies.size, lastSeen: p.lastSeen || null,
      ageDays: Number.isFinite(daysSince(p.lastSeen)) ? daysSince(p.lastSeen) : null,
      unique: p.unique || 0, contributed, dupeRate, health,
    };
  }).sort((a, b) => (b.unique - a.unique) || (b.added - a.added));

  // ── Per configured employer board (which of the 45 are productive?) ─────
  const addedByCompany = new Map();
  const lastByCompany = new Map();
  for (const r of history) {
    if (!r.company) continue;
    const key = normalizeCompany(r.company);
    if (r.status === 'added') addedByCompany.set(key, (addedByCompany.get(key) || 0) + 1);
    if (!lastByCompany.has(key) || r.first_seen > lastByCompany.get(key)) lastByCompany.set(key, r.first_seen);
  }
  const boards = boardsCfg.map((b) => {
    const key = normalizeCompany(b.name);
    const added = addedByCompany.get(key) || 0;
    const lastSeen = lastByCompany.get(key) || '';
    // We can only assert what reached the pipeline, not whether a board was
    // scanned-but-filtered, so a board with no kept jobs is "no-matches"
    // (configured + enabled, nothing has entered your lanes from it) — a
    // coverage signal, not proof it was never tried.
    let status = 'productive';
    if (added === 0) status = 'no-matches';
    else if (daysSince(lastSeen) > STALE_DAYS) status = 'stale';
    return { name: b.name, url: b.careers_url || b.api || '', enabled: b.enabled !== false, added, lastSeen: lastSeen || null, status };
  }).sort((a, b) => b.added - a.added);

  const summary = {
    providers: providerList.length,
    boardsConfigured: boardsCfg.length,
    boardsProductive: boards.filter((b) => b.status === 'productive').length,
    boardsNoMatches: boards.filter((b) => b.status === 'no-matches').length,
    jsearchSearches: jsearchCfg.length,
    canonicalJobs: jobs.length,
    multiSourceJobs: jobs.filter((j) => j.sources.length > 1).length,
    lastScan: runs.length ? runs[runs.length - 1].ts : null,
    lastScanErrors: runs.length ? runs[runs.length - 1].errors : null,
  };

  return { summary, providers: providerList, boards, runs: runs.slice(-20), lastErrorSources: [...lastErrorSources] };
}

// ── CLI ─────────────────────────────────────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reg = buildRegistry();
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(reg));
  } else {
    console.log('Sources summary:', reg.summary);
    console.log('\nProviders (by unique contribution):');
    for (const p of reg.providers) {
      console.log(`  ${p.health.padEnd(9)} ${p.id.padEnd(22)} added=${p.added} unique=${p.unique} dupeRate=${p.dupeRate} last=${p.lastSeen || 'never'}`);
    }
    const noMatch = reg.boards.filter((b) => b.status === 'no-matches');
    if (noMatch.length) console.log(`\nNo matches yet (${noMatch.length}): ${noMatch.map((b) => b.name).join(', ')}`);
  }
}

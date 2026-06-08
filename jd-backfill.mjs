#!/usr/bin/env node
// jd-backfill.mjs — backfill JD snapshots for pipeline rows that predate scan-time
// capture (or whose provider didn't return a description). Walks pipeline.md URLs
// lacking a snapshot and live-fetches each via the SAME tiered reader the dashboard
// uses (jd-fetch resolveJd: ATS API → JSON-LD → browser render), then persists the
// result to the snapshot store so the dashboard shows it instantly thereafter.
//
// Sequential by design — the browser tier launches Chromium and the project rule is
// never to drive Playwright in parallel.
//
// Usage:
//   node jd-backfill.mjs                 # backfill up to --limit (default 25)
//   node jd-backfill.mjs --limit 100
//   node jd-backfill.mjs --all           # no cap
//   node jd-backfill.mjs --dry-run       # report what WOULD be fetched, write nothing

import { readFileSync, existsSync } from 'fs';
import { resolveJd } from './jd-fetch.mjs';
import { writeSnapshot, hasSnapshot } from './jd-store.mjs';

const PIPELINE_PATH = 'data/pipeline.md';
const OK_MIN = 200;

function pipelineUrls() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const text = readFileSync(PIPELINE_PATH, 'utf-8');
  const urls = [];
  const seen = new Set();
  for (const m of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
    const u = m[1].replace(/[)\].,]+$/, ''); // trim trailing markdown punctuation
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  return urls;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const li = args.indexOf('--limit');
  const limit = all ? Infinity : li !== -1 ? Math.max(1, parseInt(args[li + 1], 10) || 25) : 25;

  const urls = pipelineUrls();
  const todo = urls.filter((u) => !hasSnapshot(u));
  console.log(
    `Pipeline URLs: ${urls.length} · already snapshotted: ${urls.length - todo.length} · to backfill: ${todo.length}`,
  );
  if (todo.length === 0) {
    console.log('Nothing to backfill — every pipeline row already has a JD snapshot.');
    return;
  }

  const slice = todo.slice(0, limit);
  if (slice.length < todo.length) console.log(`(capped at ${slice.length}; pass --all or --limit N for more)`);
  if (dryRun) console.log('(dry run — no snapshots will be written)');
  console.log('');

  let ok = 0;
  let miss = 0;
  for (let i = 0; i < slice.length; i++) {
    const url = slice[i];
    process.stdout.write(`[${i + 1}/${slice.length}] ${url.slice(0, 68)}… `);
    let r;
    try {
      r = await resolveJd(url);
    } catch (e) {
      r = { ok: false, error: String(e?.message || e) };
    }
    if (r && r.ok && (r.descriptionHtml || '').length >= OK_MIN) {
      if (!dryRun) {
        writeSnapshot({
          url,
          source: r.source || 'backfill',
          title: r.title || '',
          company: r.company || '',
          location: r.location || '',
          mode: r.mode || '',
          employmentType: r.employmentType || '',
          salary: r.salary || '',
          posted: r.posted || '',
          validThrough: r.validThrough || '',
          descriptionHtml: r.descriptionHtml,
        });
      }
      ok++;
      console.log(`ok (${r.source}, ${(r.descriptionHtml || '').length} chars)`);
    } else {
      miss++;
      console.log(`miss (${r?.reason || r?.error || 'no jd'})`);
    }
  }

  console.log(`\nBackfilled: ${ok} · missed: ${miss}${dryRun ? ' (dry run)' : ''}`);
  if (todo.length > slice.length) console.log(`Remaining: ${todo.length - slice.length} (run again to continue).`);
}

main().catch((e) => {
  console.error('Fatal:', e.message);
  process.exit(1);
});

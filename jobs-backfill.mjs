/**
 * jobs-backfill.mjs — seed data/jobs.jsonl from existing history.
 *
 * Walks scan-history.tsv rows with status "added" (the ones that reached the
 * pipeline), enriches each from its JD snapshot when one exists, and upserts
 * into the canonical job store. Running it again is idempotent: existing
 * URLs resolve to their canonical job and are not re-added.
 *
 *   node jobs-backfill.mjs            # write data/jobs.jsonl
 *   node jobs-backfill.mjs --dry-run  # report only
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createJobIndex, saveJobs, JOBS_PATH } from './jobs-store.mjs';
import { readSnapshot } from './jd-store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HISTORY = path.join(ROOT, 'data', 'scan-history.tsv');
const dryRun = process.argv.includes('--dry-run');

if (!existsSync(HISTORY)) {
  console.log('No scan-history.tsv — nothing to backfill.');
  process.exit(0);
}

const index = createJobIndex();
const before = index.jobs.length;
let rows = 0, merged = 0, created = 0;

for (const line of readFileSync(HISTORY, 'utf-8').split('\n').slice(1)) {
  const [url, firstSeen, portal, title, company, status, location, posted] = line.split('\t');
  if (!url || status !== 'added') continue;
  rows++;
  const snap = readSnapshot(url) || {};
  const offer = {
    url, title, company,
    location: location || snap.location || '',
    posted: posted || snap.posted || '',
    source: portal || snap.source || 'unknown',
    descriptionHtml: snap.descriptionHtml || '',
    applyIsDirect: !!snap.applyIsDirect,
  };
  const { merged: wasMerged, job, reason } = index.upsert(offer, firstSeen || undefined);
  if (wasMerged) {
    merged++;
    console.log(`  merged (${reason}): ${company} — ${title}\n    ${url}\n    → ${job.canonicalUrl}`);
  } else if (job.sources.length === 1 && job.firstSeen === (firstSeen || job.firstSeen)) {
    created++;
  }
}

console.log(`\nrows examined: ${rows}`);
console.log(`canonical jobs: ${before} → ${index.jobs.length} (+${index.jobs.length - before})`);
console.log(`cross-source merges found: ${merged}`);
if (dryRun) {
  console.log('(dry run — nothing written)');
} else {
  saveJobs(index.jobs);
  console.log(`wrote ${JOBS_PATH}`);
}

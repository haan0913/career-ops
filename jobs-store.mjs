/**
 * jobs-store.mjs — canonical job entity store (data/jobs.jsonl).
 *
 * One line per canonical job. A job discovered on several sources is ONE
 * record whose `sources[]` lists every URL/source/date it was seen on, and
 * whose `merges[]` records why each copy was folded in (explainable) without
 * deleting anything (reversible).
 *
 * This is an additive layer: pipeline.md / scan-history.tsv remain the
 * human-readable source of truth; jobs.jsonl is the entity-resolution index.
 *
 * Match rules, most → least authoritative:
 *   1. url        — same canonical URL (tracking params stripped)
 *   2. req-id     — same company + same ATS requisition id
 *   3. desc-hash  — same company + identical JD text (≥200 chars)
 *   4. title-loc  — same company + normalized title + location group
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { offerKeys, canonicalId } from './canonical.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const JOBS_PATH = path.join(ROOT, 'data', 'jobs.jsonl');

export function loadJobs(file = JOBS_PATH) {
  if (!existsSync(file)) return [];
  const jobs = [];
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { jobs.push(JSON.parse(t)); } catch { /* skip corrupt line, keep store usable */ }
  }
  return jobs;
}

export function saveJobs(jobs, file = JOBS_PATH) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, jobs.map(j => JSON.stringify(j)).join('\n') + (jobs.length ? '\n' : ''), 'utf-8');
}

/** In-memory index over the store for one scan run. */
export function createJobIndex(jobs = loadJobs()) {
  const byUrl = new Map();
  const byReq = new Map();      // companyKey::reqId
  // Merge keys carry title + city-level location so boilerplate JDs can't collapse
  // distinct roles (MongoDB: same JD, different titles) or distinct openings
  // (Brex: same JD + title, different cities). desc-hash = strong (JD confirmed),
  // title-loc = weak (same role+place, no JD to corroborate).
  const byDesc = new Map();     // companyKey::titleKey::locKey::descHash
  const byTitleLoc = new Map(); // companyKey::titleKey::locKey

  const indexJob = (job) => {
    for (const s of job.sources) byUrl.set(s.urlKey, job);
    if (job.keys.reqId) byReq.set(`${job.keys.companyKey}::${job.keys.reqId}`, job);
    if (job.keys.descHash) byDesc.set(`${job.keys.companyKey}::${job.keys.titleKey}::${job.keys.locKey}::${job.keys.descHash}`, job);
    byTitleLoc.set(`${job.keys.companyKey}::${job.keys.titleKey}::${job.keys.locKey}`, job);
  };
  for (const job of jobs) indexJob(job);

  return {
    jobs,

    /** Find an existing canonical job this offer is a copy of, with the rule name. */
    findMatch(offer) {
      const k = offerKeys(offer);
      let job = byUrl.get(k.urlKey);
      if (job) return { job, reason: 'url', keys: k };
      if (k.reqId) {
        job = byReq.get(`${k.companyKey}::${k.reqId}`);
        if (job) return { job, reason: 'req-id', keys: k };
      }
      if (k.descHash) {
        job = byDesc.get(`${k.companyKey}::${k.titleKey}::${k.locKey}::${k.descHash}`);
        if (job) return { job, reason: 'desc-hash', keys: k };
      }
      if (k.companyKey && k.titleKey) {
        job = byTitleLoc.get(`${k.companyKey}::${k.titleKey}::${k.locKey}`);
        if (job) return { job, reason: 'title-loc', keys: k };
      }
      return { job: null, reason: null, keys: k };
    },

    /**
     * Record an offer: merge into an existing canonical job (adding the new
     * source + an explainable merge entry) or create a new canonical record.
     * Returns { job, merged, reason }.
     */
    upsert(offer, date = new Date().toISOString().slice(0, 10)) {
      const { job, reason, keys } = this.findMatch(offer);
      const sourceEntry = {
        source: offer.source || 'unknown',
        url: offer.url,
        urlKey: keys.urlKey,
        seen: date,
        posted: offer.posted || '',
      };
      if (job) {
        const alreadyHasUrl = job.sources.some(s => s.urlKey === keys.urlKey);
        if (!alreadyHasUrl) {
          job.sources.push(sourceEntry);
          job.merges.push({ date, reason, url: offer.url, source: sourceEntry.source });
          byUrl.set(keys.urlKey, job);
        }
        // Prefer the most authoritative values without losing the old ones.
        if (!job.posted && offer.posted) job.posted = offer.posted;
        if (offer.applyIsDirect && !job.canonicalIsDirect) {
          job.canonicalUrl = offer.url;
          job.canonicalIsDirect = true;
        }
        return { job, merged: alreadyHasUrl ? false : true, reason };
      }
      const fresh = {
        id: canonicalId(offer),
        company: offer.company,
        title: offer.title,
        location: offer.location || '',
        posted: offer.posted || '',
        firstSeen: date,
        canonicalUrl: offer.url,
        canonicalIsDirect: !!offer.applyIsDirect,
        keys,
        sources: [sourceEntry],
        merges: [],
      };
      jobs.push(fresh);
      indexJob(fresh);
      return { job: fresh, merged: false, reason: null };
    },
  };
}

// ── CLI: node jobs-store.mjs stats ──────────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const jobs = loadJobs();
  const multi = jobs.filter(j => j.sources.length > 1);
  console.log(`canonical jobs: ${jobs.length}`);
  console.log(`multi-source:   ${multi.length}`);
  for (const j of multi.slice(0, 10)) {
    console.log(`  ${j.company} — ${j.title} (${j.sources.length} sources: ${j.sources.map(s => s.source).join(', ')})`);
  }
}

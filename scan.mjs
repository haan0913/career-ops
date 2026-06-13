#!/usr/bin/env node

/**
 * scan.mjs — Zero-token portal scanner with a plugin-based provider layer.
 *
 * Providers live in providers/*.mjs and are loaded at startup. Each provider
 * exports a default object with:
 *   - id: string — matched against `provider:` in portals.yml
 *   - detect(entry): {url}|null — optional auto-detection from careers_url
 *   - fetch(entry, ctx): [{title,url,company,location}] — required
 *
 * Files prefixed with _ are shared helpers (e.g. _http.mjs) and are never
 * loaded as providers. Adding a new source = drop a *.mjs into providers/,
 * no scan.mjs edits.
 *
 * A tracked_companies entry can set `provider:` explicitly to bypass
 * URL-based auto-detection. The `transport:` field is reserved for future
 * transports — Phase A only ships the http transport.
 *
 * Zero Claude API tokens — pure HTTP + JSON.
 *
 * Usage:
 *   node scan.mjs                  # scan all enabled companies
 *   node scan.mjs --dry-run        # preview without writing files
 *   node scan.mjs --company Cohere # scan a single company
 *   node scan.mjs --verify         # Playwright-check each new URL; drop expired postings
 *   node scan.mjs --max-age-days 30 # drop postings older than 30 days (by posted date)
 *   node scan.mjs --no-gate        # skip the Tier-2/3 liveness gate (write all unverified)
 *
 * Source tiers (source-tier doctrine): Tier-1 canonical employer-ATS offers write directly;
 * Tier-2/3 (aggregator/scrape — a provider with `tier: 2`) are liveness-gated (Playwright +
 * JSON-LD) before the pipeline by default. --verify gates ALL offers.
 *
 * Freshness: each provider returns a `posted` date (greenhouse first_published,
 * ashby publishedAt, lever createdAt). New offers are sorted newest-first and the
 * date is persisted to pipeline.md + scan-history.tsv. --max-age-days filters stale
 * postings (offers with no date are kept and sorted last).
 */

import 'dotenv/config'; // loads .env (e.g. JSEARCH_API_KEY) for keyed providers; no-op if absent
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import yaml from 'js-yaml';

import { makeHttpCtx } from './providers/_http.mjs';
import { writeSnapshot } from './jd-store.mjs';
import { locationVerdict } from './location.mjs';
import { createJobIndex, saveJobs } from './jobs-store.mjs';

const parseYaml = yaml.load;

// ── Config ──────────────────────────────────────────────────────────

const PORTALS_PATH = 'portals.yml';
const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const PROVIDERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'providers');

// Ensure required directories exist (fresh setup)
mkdirSync('data', { recursive: true });

const CONCURRENCY = 10;

// ── Provider loading ────────────────────────────────────────────────

async function loadProviders(dir) {
  const providers = new Map();
  if (!existsSync(dir)) return providers;
  // Alphabetical order so detect() priority is deterministic across machines.
  const entries = readdirSync(dir)
    .filter(f => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();
  for (const file of entries) {
    const full = path.join(dir, file);
    let mod;
    try {
      mod = await import(pathToFileURL(full).href);
    } catch (err) {
      console.error(`⚠️  ${file}: failed to load — ${err.message}`);
      continue;
    }
    const p = mod.default;
    if (!p || typeof p.fetch !== 'function' || !p.id) {
      console.error(`⚠️  ${file}: skipping — default export must be { id, fetch }`);
      continue;
    }
    if (providers.has(p.id)) {
      console.error(`⚠️  ${file}: duplicate provider id "${p.id}" — keeping first`);
      continue;
    }
    providers.set(p.id, p);
  }
  return providers;
}

// Resolve which provider handles a tracked_companies entry.
// 1. Explicit `provider:` field wins (skips detect()).
// 2. Otherwise each provider's detect() runs in load order; first hit wins.
function resolveProvider(entry, providers) {
  if (entry.provider) {
    const p = providers.get(entry.provider);
    if (!p) return { error: `unknown provider: ${entry.provider}` };
    return { provider: p };
  }
  for (const p of providers.values()) {
    let hit;
    try {
      hit = p.detect?.(entry);
    } catch (err) {
      console.error(`⚠️  ${p.id}: detect() threw for "${entry.name}" — ${err.message}`);
      continue;
    }
    if (hit) return { provider: p };
  }
  return null;
}

// ── Title filter ────────────────────────────────────────────────────

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map(k => k.toLowerCase());
  // Negatives match as whole words/phrases, not raw substrings. This catches
  // seniority terms at the END of a title ("Program Operations Lead") and stops
  // them from false-matching inside another word — "Lead" no longer needs the old
  // trailing-space hack, "Architect" stops blocking "Business Architecture", and
  // "Intern" stops blocking "Internal". Title and keywords are normalized (every
  // non-alphanumeric run becomes a space) then padded so matches land on token
  // boundaries. Positives stay substring-based to preserve existing breadth.
  const normalize = (s) => ' ' + s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const negative = (titleFilter?.negative || []).map(k => normalize(k.toLowerCase()));

  return (title) => {
    const lower = title.toLowerCase();
    const normTitle = normalize(lower);
    const hasPositive = positive.length === 0 || positive.some(k => lower.includes(k));
    const hasNegative = negative.some(nk => normTitle.includes(nk));
    return hasPositive && !hasNegative;
  };
}

// ── Location filter ─────────────────────────────────────────────────
// Optional. If `location_filter` is absent from portals.yml, all locations pass.
// Semantics:
//   - Empty location string → pass (don't penalize missing data)
//   - `block` matches → reject (takes precedence over allow)
//   - `allow` empty → pass (already cleared block)
//   - `allow` non-empty → must match at least one keyword
// All matches are case-insensitive substring.

function buildLocationFilter(locationFilter) {
  if (!locationFilter) return () => true;
  const allow = (locationFilter.allow || []).map(k => k.toLowerCase());
  const block = (locationFilter.block || []).map(k => k.toLowerCase());
  // Structured pass: `groups` in portals.yml location_filter (default: the
  // founding user's three lanes). The substring allow/block list below stays
  // as the backstop for strings the model can't classify.
  const groups = locationFilter.groups || ['nyc', 'remote-us', 'chicago'];

  return (location) => {
    if (!location) return true;
    const { verdict } = locationVerdict(location, groups);
    if (verdict === 'pass') return true;
    if (verdict === 'reject') return false;
    const lower = location.toLowerCase();
    if (block.length > 0 && block.some(k => lower.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some(k => lower.includes(k));
  };
}

// ── Dedup ───────────────────────────────────────────────────────────

function loadSeenUrls() {
  const seen = new Set();

  // scan-history.tsv
  if (existsSync(SCAN_HISTORY_PATH)) {
    const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
    for (const line of lines.slice(1)) { // skip header
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  }

  // pipeline.md — extract URLs from checkbox lines
  if (existsSync(PIPELINE_PATH)) {
    const text = readFileSync(PIPELINE_PATH, 'utf-8');
    for (const match of text.matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) {
      seen.add(match[1]);
    }
  }

  // applications.md — extract URLs from report links and any inline URLs
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
      seen.add(match[0]);
    }
  }

  return seen;
}

function loadSeenCompanyRoles() {
  const seen = new Set();
  if (existsSync(APPLICATIONS_PATH)) {
    const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
    // Parse markdown table rows: | # | Date | Company | Role | ...
    for (const match of text.matchAll(/\|[^|]+\|[^|]+\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g)) {
      const company = match[1].trim().toLowerCase();
      const role = match[2].trim().toLowerCase();
      if (company && role && company !== 'company') {
        seen.add(`${company}::${role}`);
      }
    }
  }
  return seen;
}

// ── Pipeline writer ─────────────────────────────────────────────────

function appendToPipeline(offers) {
  if (offers.length === 0) return;

  let text = readFileSync(PIPELINE_PATH, 'utf-8');

  // Find "## Pendientes" section and append after it
  const marker = '## Pendientes';
  const idx = text.indexOf(marker);
  if (idx === -1) {
    // No Pendientes section — append at end before Procesadas
    const procIdx = text.indexOf('## Procesadas');
    const insertAt = procIdx === -1 ? text.length : procIdx;
    const block = `\n${marker}\n\n` + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | posted ${o.posted || 'n/a'}`
    ).join('\n') + '\n\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  } else {
    // Find the end of existing Pendientes content (next ## or end)
    const afterMarker = idx + marker.length;
    const nextSection = text.indexOf('\n## ', afterMarker);
    const insertAt = nextSection === -1 ? text.length : nextSection;

    const block = '\n' + offers.map(o =>
      `- [ ] ${o.url} | ${o.company} | ${o.title} | posted ${o.posted || 'n/a'}`
    ).join('\n') + '\n';
    text = text.slice(0, insertAt) + block + text.slice(insertAt);
  }

  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToScanHistory(offers, date, status = 'added') {
  // Ensure file + header exist. Columns are append-only for non-breaking backward
  // compat — older scan-history.tsv files with fewer columns still parse fine since
  // loadSeenUrls only reads column 0. `posted` (8th col) is the posting date from
  // the provider; `location` is the 7th. `status` is parameterized so callers can
  // record verify outcomes (`skipped_expired`, etc.) without the legacy `(expired)`
  // suffix in `source`.
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tposted\n', 'utf-8');
  }

  const lines = offers.map(o =>
    `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\t${status}\t${o.location || ''}\t${o.posted || ''}`
  ).join('\n') + '\n';

  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

// ── Parallel fetch with concurrency limit ───────────────────────────

async function parallelFetch(tasks, limit) {
  const results = [];
  let i = 0;

  async function next() {
    while (i < tasks.length) {
      const task = tasks[i++];
      results.push(await task());
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

// ── Main ────────────────────────────────────────────────────────────

async function verifyOffers(offers) {
  // Dynamic imports keep the default zero-token path free of Playwright startup
  let chromium;
  let checkUrlLiveness;
  try {
    ({ chromium } = await import('playwright'));
    ({ checkUrlLiveness } = await import('./liveness-browser.mjs'));
  } catch (err) {
    throw new Error(
      `--verify requires Playwright with Chromium (run "npx playwright install chromium"): ${err.message}`,
      { cause: err },
    );
  }

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new Error(
      `--verify could not launch Chromium (run "npx playwright install chromium" or re-run without --verify): ${err.message}`,
      { cause: err },
    );
  }

  // Three permanent buckets + one transient passthrough:
  //   verified  → active pages and transient nav errors (retry next scan)
  //   expired   → classifier-confirmed dead postings (HTTP 4xx, redirect markers,
  //               body patterns, listing pages, insufficient content)
  //   dropped   → page loaded but classifier saw no Apply control. --verify is an
  //               opt-in stricter filter; keeping these defeats the purpose.
  //   invalid   → up-front URL guard rejections (malformed / non-http / private)
  const verified = [];
  const expired = [];
  const dropped = [];
  const invalid = [];

  try {
    const page = await browser.newPage();
    // Sequential — project rule: never Playwright in parallel
    for (const offer of offers) {
      const { result, code, reason } = await checkUrlLiveness(page, offer.url);
      if (result === 'expired') {
        expired.push({ ...offer, reason });
        console.log(`  ❌ expired   ${offer.company} | ${offer.title} (${reason})`);
      } else if (result === 'uncertain' && GUARD_CODES.has(code)) {
        // Guard failures are permanent (not transient like a timeout) — record them
        // separately so they don't end up in pipeline.md but DO appear in scan-history
        // with a precise status, dedup-blocking them on subsequent scans.
        invalid.push({ ...offer, code, reason });
        console.log(`  ⛔ invalid   ${offer.company} | ${offer.title} (${reason})`);
      } else if (result === 'uncertain' && code === 'no_apply_control') {
        // Page loaded but classifier could not find an Apply control. Treat like
        // expired for routing — drop from pipeline AND record in scan-history so
        // we don't burn a verify cycle on the same URL next scan.
        dropped.push({ ...offer, reason });
        console.log(`  ⚠️ no-apply  ${offer.company} | ${offer.title} (${reason})`);
      } else {
        // 'active' or 'uncertain' due to navigation_error (transient — retry next scan)
        verified.push(offer);
        const icon = result === 'active' ? '✅' : '⚠️';
        console.log(`  ${icon} ${result.padEnd(9)} ${offer.company} | ${offer.title}`);
      }
    }
  } finally {
    await browser.close();
  }

  return { verified, expired, dropped, invalid };
}

// Stable codes from liveness-browser's up-front URL guard. Routing dispatches
// on these codes (not on regex over reason strings) so wording can change
// without breaking the pipeline.
const GUARD_CODES = new Set(['invalid_url', 'unsupported_protocol', 'blocked_host']);

// guardStatusFor maps a guard code to the canonical scan-history status string.
function guardStatusFor(code) {
  if (code === 'blocked_host') return 'skipped_blocked_host';
  // invalid_url and unsupported_protocol both surface as malformed input
  return 'skipped_invalid_url';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');
  const companyFlag = args.indexOf('--company');
  const filterCompany = companyFlag !== -1 ? args[companyFlag + 1]?.toLowerCase() : null;
  const maxAgeFlag = args.indexOf('--max-age-days');
  let maxAgeDays = null;
  if (maxAgeFlag !== -1) {
    const n = parseInt(args[maxAgeFlag + 1], 10);
    if (Number.isFinite(n) && n > 0) maxAgeDays = n;
    else console.error('⚠️  --max-age-days needs a positive number; ignoring.');
  }

  // 1. Load providers
  const providers = await loadProviders(PROVIDERS_DIR);
  if (providers.size === 0) {
    console.error('Error: no providers loaded from providers/');
    process.exit(1);
  }

  // 2. Read portals.yml
  if (!existsSync(PORTALS_PATH)) {
    console.error('Error: portals.yml not found. Run onboarding first.');
    process.exit(1);
  }

  const config = parseYaml(readFileSync(PORTALS_PATH, 'utf-8'));
  const companies = config.tracked_companies || [];
  const titleFilter = buildTitleFilter(config.title_filter);
  const locationFilter = buildLocationFilter(config.location_filter);

  // 3. Resolve a provider for each enabled company
  const targets = [];
  let skippedCount = 0;
  const resolveErrors = [];
  for (const company of companies) {
    if (company.enabled === false) continue;
    if (typeof company.name !== 'string' || !company.name) {
      console.error(`⚠️  Skipping entry — missing or non-string 'name' field: ${JSON.stringify(company)}`);
      continue;
    }
    if (filterCompany && !company.name.toLowerCase().includes(filterCompany)) continue;
    const resolved = resolveProvider(company, providers);
    if (!resolved) { skippedCount++; continue; }
    if (resolved.error) { resolveErrors.push({ company: company.name, error: resolved.error }); continue; }
    targets.push({ ...company, _provider: resolved.provider });
  }

  console.log(`Scanning ${targets.length} companies via providers (${skippedCount} skipped — no provider matched)`);
  if (dryRun) console.log('(dry run — no files will be written)\n');

  // 4. Load dedup sets
  const seenUrls = loadSeenUrls();
  const seenCompanyRoles = loadSeenCompanyRoles();
  // Canonical entity index (data/jobs.jsonl) — catches cross-source copies the
  // exact-match sets miss (tracking-param URLs, "Inc." company variants,
  // identical JDs reposted on aggregators). Merges are recorded, not dropped.
  const jobIndex = createJobIndex();

  // 5. Fetch from each target
  const date = new Date().toISOString().slice(0, 10);
  let totalFound = 0;
  let totalFilteredTitle = 0;
  let totalFilteredLocation = 0;
  let totalDupes = 0;
  let totalMerged = 0;
  const newOffers = [];
  const errors = [...resolveErrors];

  const tasks = targets.map(company => async () => {
    const provider = company._provider;
    const ctx = makeHttpCtx();
    try {
      const jobs = await provider.fetch(company, ctx);
      if (!Array.isArray(jobs)) {
        throw new Error(`${provider.id}: fetch() did not return an array`);
      }
      totalFound += jobs.length;

      for (const job of jobs) {
        if (!titleFilter(job.title)) {
          totalFilteredTitle++;
          continue;
        }
        if (!locationFilter(job.location)) {
          totalFilteredLocation++;
          continue;
        }
        if (seenUrls.has(job.url)) {
          totalDupes++;
          continue;
        }
        const key = `${job.company.toLowerCase()}::${job.title.toLowerCase()}`;
        if (seenCompanyRoles.has(key)) {
          totalDupes++;
          continue;
        }
        // Cross-source entity resolution: a copy of a job we already track
        // (different URL, same opening) is merged into the canonical record —
        // its source is preserved — instead of becoming a new pipeline row.
        const match = jobIndex.findMatch(job);
        if (match.job) {
          jobIndex.upsert({ ...job, source: `${provider.id}-api` }, date);
          totalMerged++;
          continue;
        }
        // Mark as seen to avoid intra-scan dupes
        seenUrls.add(job.url);
        seenCompanyRoles.add(key);
        // Source label keeps the `${provider.id}-api` suffix so existing
        // scan-history.tsv rows continue to match for dedup.
        newOffers.push({ ...job, source: `${provider.id}-api`, tier: provider.tier || 1 });
      }
    } catch (err) {
      errors.push({ company: company.name, error: err.message });
    }
  });

  await parallelFetch(tasks, CONCURRENCY);

  // 5.4. Freshness — optional age filter (by posting date) + newest-first sort.
  // Offers with no posting date are kept (don't penalize missing data) and sort last.
  let totalFilteredAge = 0;
  if (maxAgeDays !== null) {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString().slice(0, 10);
    for (let i = newOffers.length - 1; i >= 0; i--) {
      const p = newOffers[i].posted;
      if (p && p < cutoff) {
        newOffers.splice(i, 1);
        totalFilteredAge++;
      }
    }
  }
  newOffers.sort((a, b) => (b.posted || '').localeCompare(a.posted || ''));

  // 5.5. Liveness gate (source-tier doctrine). Tier-1 canonical employer-ATS offers are
  // written directly; Tier-2/3 (aggregator/scrape) offers are gated through the liveness +
  // JSON-LD check BEFORE the pipeline. --verify gates ALL offers; --no-gate disables gating.
  const noGate = args.includes('--no-gate');
  let verifiedOffers = newOffers;
  let expiredOffers = [];
  let droppedOffers = [];
  let invalidOffers = [];
  let gatedCount = 0;

  let toGate;
  let passthrough;
  if (noGate) {
    toGate = [];
    passthrough = newOffers;
  } else if (verify) {
    toGate = newOffers;
    passthrough = [];
  } else {
    toGate = newOffers.filter((o) => (o.tier || 1) >= 2);
    passthrough = newOffers.filter((o) => (o.tier || 1) < 2);
  }
  gatedCount = toGate.length;

  if (toGate.length > 0) {
    console.log(`\nVerifying liveness of ${toGate.length} ${verify ? 'new' : 'Tier-2+'} offer(s) with Playwright (sequential)...`);
    try {
      const result = await verifyOffers(toGate);
      verifiedOffers = [...passthrough, ...result.verified];
      expiredOffers = result.expired;
      droppedOffers = result.dropped;
      invalidOffers = result.invalid;
    } catch (err) {
      if (verify) throw err; // explicit --verify: surface the failure
      // Auto-gate degraded (e.g. Playwright not installed). Don't fail the whole scan —
      // write the Tier-2+ offers UNVERIFIED with a loud warning so the user can gate later.
      console.error(`⚠️  liveness gate unavailable (${err.message.split('\n')[0]})`);
      console.error(`   writing ${toGate.length} Tier-2+ offer(s) UNVERIFIED — run "node check-liveness.mjs <url>" before applying, or install Playwright (npx playwright install chromium).`);
      verifiedOffers = newOffers;
      gatedCount = 0;
    }
  } else {
    verifiedOffers = passthrough;
  }

  // 6. Write results
  if (!dryRun && verifiedOffers.length > 0) {
    appendToPipeline(verifiedOffers);
    appendToScanHistory(verifiedOffers, date);
  }
  // 6a. Canonical entity store — every written offer becomes (or merges into)
  // a canonical job record with full source history in data/jobs.jsonl.
  if (!dryRun && (verifiedOffers.length > 0 || totalMerged > 0)) {
    for (const o of verifiedOffers) jobIndex.upsert(o, date);
    saveJobs(jobIndex.jobs);
  }

  // 6b. JD snapshots — persist the full description + apply metadata the provider
  // captured (jsearch job_description, greenhouse content=true) so the dashboard
  // reads it instantly and the JD stays readable even after the employer link rots.
  // Only offers that carry a real description are snapshotted.
  let snappedCount = 0;
  if (!dryRun) {
    for (const o of verifiedOffers) {
      if (o.descriptionHtml && o.descriptionHtml.length >= 80) {
        writeSnapshot({
          url: o.url,
          source: o.source,
          title: o.title,
          company: o.company,
          location: o.location || '',
          employmentType: o.employmentType || '',
          salary: o.salary || '',
          posted: o.posted || '',
          publisher: o.publisher || '',
          logo: o.logo || '',
          applyUrl: o.url,
          googleLink: o.googleLink || '',
          applyIsDirect: !!o.applyIsDirect,
          applyOptions: o.applyOptions || [],
          descriptionHtml: o.descriptionHtml,
        });
        snappedCount++;
      }
    }
  }
  if (!dryRun && expiredOffers.length > 0) {
    appendToScanHistory(expiredOffers, date, 'skipped_expired');
  }
  // Pages that loaded but had no Apply control: record so we don't re-verify
  // them next scan, but never let them reach pipeline.md.
  if (!dryRun && droppedOffers.length > 0) {
    appendToScanHistory(droppedOffers, date, 'skipped_no_apply_control');
  }
  // Guard-rejected URLs (invalid / unsupported protocol / blocked host) are
  // recorded with a precise status so subsequent scans dedup-skip them via
  // loadSeenUrls, but they never reach pipeline.md.
  if (!dryRun && invalidOffers.length > 0) {
    // Group by code so the TSV reflects the actual reason category.
    const byStatus = new Map();
    for (const o of invalidOffers) {
      const status = guardStatusFor(o.code);
      if (!byStatus.has(status)) byStatus.set(status, []);
      byStatus.get(status).push(o);
    }
    for (const [status, group] of byStatus) {
      appendToScanHistory(group, date, status);
    }
  }

  // 7. Print summary
  console.log(`\n${'━'.repeat(45)}`);
  console.log(`Portal Scan — ${date}`);
  console.log(`${'━'.repeat(45)}`);
  console.log(`Companies scanned:     ${targets.length}`);
  console.log(`Total jobs found:      ${totalFound}`);
  console.log(`Filtered by title:     ${totalFilteredTitle} removed`);
  console.log(`Filtered by location:  ${totalFilteredLocation} removed`);
  if (maxAgeDays !== null) console.log(`Filtered by age:       ${totalFilteredAge} removed (>${maxAgeDays}d old)`);
  console.log(`Duplicates:            ${totalDupes} skipped`);
  if (totalMerged > 0) console.log(`Cross-source merges:   ${totalMerged} folded into canonical jobs`);
  if (gatedCount > 0) {
    console.log(`Liveness-gated:        ${gatedCount} ${verify ? '(all)' : '(Tier-2+)'}`);
    console.log(`Expired (dropped):     ${expiredOffers.length}`);
    console.log(`No apply control:      ${droppedOffers.length}`);
    console.log(`Invalid (guarded):     ${invalidOffers.length}`);
  }
  console.log(`New offers added:      ${verifiedOffers.length}`);
  if (snappedCount > 0) console.log(`JD snapshots saved:    ${snappedCount}`);

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ✗ ${e.company}: ${e.error}`);
    }
  }

  if (verifiedOffers.length > 0) {
    console.log('\nNew offers (newest first):');
    for (const o of verifiedOffers) {
      console.log(`  + [${o.posted || ' undated '}] ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
      console.log(`      ${o.url}`);
    }
    if (dryRun) {
      console.log('\n(dry run — run without --dry-run to save results)');
    } else {
      console.log(`\nResults saved to ${PIPELINE_PATH} and ${SCAN_HISTORY_PATH}`);
    }
  }

  console.log(`\n→ Run /career-ops pipeline to evaluate new offers.`);
  console.log('→ Share results and get help: https://discord.gg/8pRpHETxa4');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

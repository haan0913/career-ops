#!/usr/bin/env node

/**
 * test-all.mjs — Comprehensive test suite for career-ops
 *
 * Run before merging any PR or pushing changes.
 * Tests: syntax, scripts, dashboard, data contract, personal data, paths.
 *
 * Usage:
 *   node test-all.mjs           # Run all tests
 *   node test-all.mjs --quick   # Skip dashboard build (faster)
 */

import { execSync, execFileSync } from 'child_process';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const QUICK = process.argv.includes('--quick');

let passed = 0;
let failed = 0;
let warnings = 0;

function pass(msg) { console.log(`  ✅ ${msg}`); passed++; }
function fail(msg) { console.log(`  ❌ ${msg}`); failed++; }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings++; }

function run(cmd, args = [], opts = {}) {
  try {
    if (Array.isArray(args) && args.length > 0) {
      return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
    }
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', timeout: 30000, ...opts }).trim();
  } catch (e) {
    return null;
  }
}

function fileExists(path) { return existsSync(join(ROOT, path)); }
function readFile(path) { return readFileSync(join(ROOT, path), 'utf-8'); }

console.log('\n🧪 career-ops test suite\n');

// ── 1. SYNTAX CHECKS ────────────────────────────────────────────

console.log('1. Syntax checks');

const mjsFiles = readdirSync(ROOT).filter(f => f.endsWith('.mjs'));
for (const f of mjsFiles) {
  const result = run('node', ['--check', f]);
  if (result !== null) {
    pass(`${f} syntax OK`);
  } else {
    fail(`${f} has syntax errors`);
  }
}

// ── 2. SCRIPT EXECUTION ─────────────────────────────────────────

console.log('\n2. Script execution (graceful on empty data)');

const scripts = [
  { name: 'cv-sync-check.mjs', expectExit: 1, allowFail: true }, // fails without cv.md (normal in repo)
  { name: 'verify-pipeline.mjs', expectExit: 0 },
  { name: 'normalize-statuses.mjs --dry-run', expectExit: 0 }, // --dry-run: tests must NOT mutate user data
  { name: 'dedup-tracker.mjs --dry-run', expectExit: 0 },
  { name: 'merge-tracker.mjs --dry-run', expectExit: 0 },
  { name: 'update-system.mjs check', expectExit: 0 },
];

for (const { name, allowFail } of scripts) {
  const result = run('node', name.split(' '), { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result !== null) {
    pass(`${name} runs OK`);
  } else if (allowFail) {
    warn(`${name} exited with error (expected without user data)`);
  } else {
    fail(`${name} crashed`);
  }
}

// ── 3. LIVENESS CLASSIFICATION ──────────────────────────────────

console.log('\n3. Liveness classification');

try {
  const { classifyLiveness } = await import(pathToFileURL(join(ROOT, 'liveness-core.mjs')).href);

  const expiredChromeApply = classifyLiveness({
    finalUrl: 'https://example.com/jobs/closed-role',
    bodyText: 'Company Careers\nApply\nThe job you are looking for is no longer open.',
    applyControls: [],
  });
  if (expiredChromeApply.result === 'expired') {
    pass('Expired pages are not revived by nav/footer "Apply" text');
  } else {
    fail(`Expired page misclassified as ${expiredChromeApply.result}`);
  }

  const activeWorkdayPage = classifyLiveness({
    finalUrl: 'https://example.workday.com/job/123',
    bodyText: [
      '663 JOBS FOUND',
      'Senior AI Engineer',
      'Join our applied AI team to ship production systems, partner with customers, and own delivery across evaluation, deployment, and reliability.',
    ].join('\n'),
    applyControls: ['Apply for this Job'],
  });
  if (activeWorkdayPage.result === 'active') {
    pass('Visible apply controls still keep real job pages active');
  } else {
    fail(`Active job page misclassified as ${activeWorkdayPage.result}`);
  }

  const closedMycareersfuture = classifyLiveness({
    finalUrl: 'https://www.mycareersfuture.gov.sg/job/engineering/senior-staff-embedded-software-engineer',
    bodyText: [
      'Senior Staff Embedded Software Engineer',
      'MaxLinear Asia Singapore Private Limited',
      '9 applications    Posted 27 Oct 2025    Closed on 26 Nov 2025',
      'Applications have closed for this job',
      'Log in to Apply',
      "You'll need to log in with Singpass to verify your identity.",
      'Roles & Responsibilities: design, develop and maintain embedded firmware for broadband communications ICs.',
    ].join('\n'),
    applyControls: ['Log in to Apply'],
  });
  if (closedMycareersfuture.result === 'expired') {
    pass('Closed postings with "Applications have closed" banner are detected');
  } else {
    fail(`Closed mycareersfuture posting misclassified as ${closedMycareersfuture.result}`);
  }
} catch (e) {
  fail(`Liveness classification tests crashed: ${e.message}`);
}

// ── 3b. PROVIDER & UTILITY UNIT TESTS ───────────────────────────

console.log('\n3b. Provider & utility unit tests');

const t = (cond, msg) => (cond ? pass(msg) : fail(msg));
const imp = (f) => import(pathToFileURL(join(ROOT, f)).href);

try {
  const { parseWorkdayPostedOn } = await imp('providers/workday.mjs');
  const now = new Date('2026-06-07T00:00:00Z');
  t(parseWorkdayPostedOn('Posted Today', now) === '2026-06-07', 'workday postedOn: Today');
  t(parseWorkdayPostedOn('Posted Yesterday', now) === '2026-06-06', 'workday postedOn: Yesterday');
  t(parseWorkdayPostedOn('Posted 5 Days Ago', now) === '2026-06-02', 'workday postedOn: N days ago');
  t(parseWorkdayPostedOn('Posted 30+ Days Ago', now) === '2026-05-08', 'workday postedOn: 30+ days');
  t(parseWorkdayPostedOn('nonsense', now) === '', 'workday postedOn: unparseable → empty');
} catch (e) { fail(`workday unit tests crashed: ${e.message}`); }

try {
  const { isJunkUrl, pickApplyUrl } = await imp('providers/jsearch.mjs');
  t(isJunkUrl('https://2.halvolink.liveblog365.com/job/1') === true, 'jsearch: junk domain denylisted');
  t(isJunkUrl('https://www.linkedin.com/jobs/view/x') === false, 'jsearch: real board kept');
  t(pickApplyUrl({ job_apply_link: 'https://x.liveblog365.com/1' }) === null, 'jsearch: drop all-junk job');
  t(pickApplyUrl({ job_apply_link: 'https://www.jobleads.com/x', apply_options: [{ apply_link: 'https://co.wd5.myworkdayjobs.com/x', is_direct: true }] }) === 'https://co.wd5.myworkdayjobs.com/x', 'jsearch: prefer direct employer link');
  t(pickApplyUrl({ job_apply_link: 'https://www.linkedin.com/x', job_apply_is_direct: false }) === 'https://www.linkedin.com/x', 'jsearch: keep aggregator if only option');
} catch (e) { fail(`jsearch unit tests crashed: ${e.message}`); }

try {
  const ms = await imp('match-score.mjs');
  t(ms.cosine([1, 0], [1, 0]) === 1, 'match-score: cosine identical');
  t(ms.cosine([1, 0], [0, 1]) === 0, 'match-score: cosine orthogonal');
  t(Math.abs(ms.meanPool([[1, 0], [0, 1]])[0] - 0.70710678) < 1e-4, 'match-score: meanPool L2-normalize');
  const ko = ms.keywordOverlap('python sql analyst', 'experienced python analyst');
  t(ko.matched.slice().sort().join(',') === 'analyst,python' && ko.missing.join(',') === 'sql', 'match-score: keyword overlap');
  t(ms.chunkWords('a b c d', 2).join('|') === 'a b|c d', 'match-score: chunkWords');
} catch (e) { fail(`match-score unit tests crashed: ${e.message}`); }

try {
  const { extractJobPostingJsonLd } = await imp('liveness-jsonld.mjs');
  const html = '<html><head><script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Project Analyst","datePosted":"2026-06-01","validThrough":"2026-07-01","hiringOrganization":{"name":"Acme"}}</script></head><body>x</body></html>';
  t(JSON.stringify(extractJobPostingJsonLd(html, 'https://acme.com/job/1') || {}).includes('2026-06-01'), 'jsonld: extracts datePosted');
  const arr = '<script type="application/ld+json">[{"@type":"WebSite"},{"@type":"JobPosting","title":"X","datePosted":"2026-05-15","hiringOrganization":{"name":"Beta"}}]</script>';
  t(JSON.stringify(extractJobPostingJsonLd(arr) || {}).includes('2026-05-15'), 'jsonld: handles array-wrapped JobPosting');
} catch (e) { fail(`jsonld unit tests crashed: ${e.message}`); }

try {
  const { normalizeLocation, locationVerdict } = await import(pathToFileURL(join(ROOT, 'location.mjs')).href);
  const t = (cond, msg) => cond ? pass(msg) : fail(msg);
  t(normalizeLocation('New York, NY').group === 'nyc', 'location: NYC classified');
  t(normalizeLocation('Jersey City, NJ (Hybrid)').group === 'nyc', 'location: Jersey City → nyc group, hybrid');
  t(normalizeLocation('Chicago, IL').group === 'chicago', 'location: Chicago classified');
  t(normalizeLocation('Remote (US)').group === 'remote-us', 'location: Remote US classified');
  t(normalizeLocation('Remote - EMEA').group === 'remote-foreign', 'location: Remote EMEA is foreign');
  t(normalizeLocation('Remote - APAC').group === 'remote-foreign', 'location: Remote APAC is foreign');
  t(normalizeLocation('London, United Kingdom').group === 'foreign', 'location: London is foreign');
  t(normalizeLocation('Austin, TX').group === 'us-other', 'location: Austin is us-other');
  t(normalizeLocation('Remote').group === 'unknown', 'location: bare Remote defers to backstop');
  t(normalizeLocation('Bengaluru, India').group === 'foreign', 'location: Bengaluru not passed by "US" substring');
  t(locationVerdict('Remote - LATAM').verdict === 'reject', 'verdict: Remote LATAM rejected');
  t(locationVerdict('New York / London').verdict === 'pass', 'verdict: mixed NY/London passes');
  t(locationVerdict('Remote').verdict === 'defer', 'verdict: ambiguous Remote defers');
} catch (e) { fail(`location unit tests crashed: ${e.message}`); }

try {
  const { normalizeCompany, urlKey, reqIdFromUrl, descHash } = await import(pathToFileURL(join(ROOT, 'canonical.mjs')).href);
  const { createJobIndex } = await import(pathToFileURL(join(ROOT, 'jobs-store.mjs')).href);
  const t = (cond, msg) => cond ? pass(msg) : fail(msg);
  t(normalizeCompany('Compu-Vision Consulting Inc.') === 'compuvision consulting', 'canonical: company suffix stripped');
  t(normalizeCompany('The Goldman Sachs Group, Inc.') === normalizeCompany('Goldman Sachs Group'), 'canonical: company variants equal');
  t(urlKey('https://x.com/jobs/1?utm_source=li&gh_src=abc') === urlKey('https://X.com/jobs/1'), 'canonical: tracking params stripped');
  t(reqIdFromUrl('https://brex.com/careers/8152963002?gh_jid=8152963002') === 'gh:8152963002', 'canonical: greenhouse req id');
  t(descHash('<p>short</p>') === null, 'canonical: short JD has no hash');
  const longJd = '<p>' + 'We are seeking a project analyst to coordinate delivery. '.repeat(10) + '</p>';
  t(descHash(longJd) === descHash(longJd.toUpperCase()), 'canonical: desc hash case-insensitive');

  const idx = createJobIndex([]);
  const a = idx.upsert({ url: 'https://jobs.acme.com/123?gh_jid=123', title: 'Project Analyst', company: 'Acme Inc.', location: 'New York, NY', source: 'greenhouse-api', descriptionHtml: longJd });
  t(!a.merged && idx.jobs.length === 1, 'store: first offer creates canonical job');
  const b = idx.upsert({ url: 'https://www.linkedin.com/jobs/view/999', title: 'Project Analyst', company: 'Acme', location: 'New York City', source: 'jsearch-api', descriptionHtml: longJd });
  t(b.merged && idx.jobs.length === 1, 'store: aggregator copy merges (not a new job)');
  t(b.job.sources.length === 2 && b.job.merges[0].reason === 'desc-hash', 'store: source history + merge reason kept');
  const c = idx.upsert({ url: 'https://jobs.acme.com/777', title: 'Data Engineer', company: 'Acme', location: 'New York, NY', source: 'greenhouse-api' });
  t(!c.merged && idx.jobs.length === 2, 'store: different role stays separate');
  // Boilerplate-JD guards: identical JD must NOT merge distinct roles/cities.
  const idx2 = createJobIndex([]);
  const boiler = '<p>' + 'Acme is a company that does things across many markets worldwide. '.repeat(8) + '</p>';
  idx2.upsert({ url: 'https://jobs.acme.com/a1?gh_jid=1', title: 'Program Manager', company: 'Acme', location: 'New York, NY', source: 'greenhouse-api', descriptionHtml: boiler });
  const diffTitle = idx2.upsert({ url: 'https://jobs.acme.com/a2?gh_jid=2', title: 'Data Analyst', company: 'Acme', location: 'New York, NY', source: 'greenhouse-api', descriptionHtml: boiler });
  t(!diffTitle.merged && idx2.jobs.length === 2, 'store: same boilerplate JD, different title → not merged (MongoDB guard)');
  const diffCity = idx2.upsert({ url: 'https://jobs.acme.com/a3?gh_jid=3', title: 'Program Manager', company: 'Acme', location: 'Seattle, Washington, United States', source: 'greenhouse-api', descriptionHtml: boiler });
  t(!diffCity.merged && idx2.jobs.length === 3, 'store: same JD+title, different city → not merged (Brex guard)');
} catch (e) { fail(`canonical/store unit tests crashed: ${e.message}`); }

// ── 4. DASHBOARD BUILD ──────────────────────────────────────────

if (!QUICK) {
  console.log('\n4. Dashboard build');
  // A broken Go *toolchain* (corrupted GOROOT stdlib) is an environment
  // problem, not a project failure — probe it before blaming the dashboard.
  const goToolchainOk = run('go build std 2>&1') !== null;
  if (!goToolchainOk) {
    warn('Go toolchain unusable (go build std fails) — skipping dashboard build');
  } else {
    const goBuild = run('cd dashboard && go build -o /tmp/career-dashboard-test . 2>&1');
    if (goBuild !== null) {
      pass('Dashboard compiles');
    } else {
      fail('Dashboard build failed');
    }
  }
} else {
  console.log('\n4. Dashboard build (skipped --quick)');
}

// ── 5. DATA CONTRACT ────────────────────────────────────────────

console.log('\n5. Data contract validation');

// Check system files exist
const systemFiles = [
  'CLAUDE.md', 'VERSION', 'DATA_CONTRACT.md',
  'modes/_shared.md', 'modes/_profile.template.md',
  'modes/oferta.md', 'modes/pdf.md', 'modes/scan.md',
  'templates/states.yml', 'templates/cv-template.html',
  '.claude/skills/career-ops/SKILL.md',
];

for (const f of systemFiles) {
  if (fileExists(f)) {
    pass(`System file exists: ${f}`);
  } else {
    fail(`Missing system file: ${f}`);
  }
}

// Check user files are NOT tracked (gitignored)
const userFiles = [
  'config/profile.yml', 'modes/_profile.md', 'portals.yml',
];
for (const f of userFiles) {
  const tracked = run('git', ['ls-files', f]);
  if (tracked === '') {
    pass(`User file gitignored: ${f}`);
  } else if (tracked === null) {
    pass(`User file gitignored: ${f}`);
  } else {
    fail(`User file IS tracked (should be gitignored): ${f}`);
  }
}

// ── 6. PERSONAL DATA LEAK CHECK ─────────────────────────────────

console.log('\n6. Personal data leak check');

const leakPatterns = [
  'Santiago', 'santifer.io', 'Santifer iRepair', 'Zinkee', 'ALMAS',
  'hi@santifer.io', '688921377', '/Users/santifer/',
];

const scanExtensions = ['md', 'yml', 'html', 'mjs', 'sh', 'go', 'json'];
const allowedFiles = [
  // English README + localized translations (all legitimately credit Santiago)
  'README.md', 'README.es.md', 'README.ja.md', 'README.ko-KR.md',
  'README.pt-BR.md', 'README.ru.md',
  // Standard project files
  'LICENSE', 'CITATION.cff', 'CONTRIBUTING.md',
  'package.json', '.github/FUNDING.yml', 'CLAUDE.md', 'AGENTS.md', 'go.mod', 'test-all.mjs',
  // Community / governance files (added in v1.3.0, all legitimately reference the maintainer)
  'CODE_OF_CONDUCT.md', 'GOVERNANCE.md', 'SECURITY.md', 'SUPPORT.md',
  '.github/SECURITY.md',
  // Dashboard credit string
  'dashboard/internal/ui/screens/pipeline.go',
];

// Build pathspec for git grep — only scan tracked files matching these
// extensions. This is what `grep -rn` was trying to do, but git-aware:
// untracked files (debate artifacts, AI tool scratch, local plans/) and
// gitignored files can't trigger false positives because they were never
// going to reach a commit anyway.
const grepPathspec = scanExtensions.map(e => `'*.${e}'`).join(' ');

let leakFound = false;
for (const pattern of leakPatterns) {
  const result = run(
    `git grep -n "${pattern}" -- ${grepPathspec} 2>/dev/null`
  );
  if (result) {
    for (const line of result.split('\n')) {
      const file = line.split(':')[0];
      if (allowedFiles.some(a => file.includes(a))) continue;
      if (file.includes('dashboard/go.mod')) continue;
      warn(`Possible personal data in ${file}: "${pattern}"`);
      leakFound = true;
    }
  }
}
if (!leakFound) {
  pass('No personal data leaks outside allowed files');
}

// ── 7. ABSOLUTE PATH CHECK ──────────────────────────────────────

console.log('\n7. Absolute path check');

// Same git grep approach: only scans tracked files. Untracked AI tool
// outputs, local debate artifacts, etc. can't false-positive here.
const absPathResult = run(
  `git grep -n "/Users/" -- '*.mjs' '*.sh' '*.md' '*.go' '*.yml' 2>/dev/null | grep -v README.md | grep -v LICENSE | grep -v CLAUDE.md | grep -v test-all.mjs`
);
if (!absPathResult) {
  pass('No absolute paths in code files');
} else {
  for (const line of absPathResult.split('\n').filter(Boolean)) {
    fail(`Absolute path: ${line.slice(0, 100)}`);
  }
}

// ── 8. MODE FILE INTEGRITY ──────────────────────────────────────

console.log('\n8. Mode file integrity');

const expectedModes = [
  '_shared.md', '_profile.template.md', 'oferta.md', 'pdf.md', 'scan.md',
  'batch.md', 'apply.md', 'auto-pipeline.md', 'contacto.md', 'deep.md',
  'ofertas.md', 'pipeline.md', 'project.md', 'tracker.md', 'training.md',
];

for (const mode of expectedModes) {
  if (fileExists(`modes/${mode}`)) {
    pass(`Mode exists: ${mode}`);
  } else {
    fail(`Missing mode: ${mode}`);
  }
}

// Check _shared.md references _profile.md
const shared = readFile('modes/_shared.md');
if (shared.includes('_profile.md')) {
  pass('_shared.md references _profile.md');
} else {
  fail('_shared.md does NOT reference _profile.md');
}

// ── 9. AGENTS.md INTEGRITY ──────────────────────────────────────

console.log('\n9. AGENTS.md integrity');

const agents = readFile('AGENTS.md');
const requiredSections = [
  'Data Contract', 'Update Check', 'Ethical Use',
  'Offer Verification', 'Canonical States', 'TSV Format',
  'First Run', 'Onboarding',
];

for (const section of requiredSections) {
  if (agents.includes(section)) {
    pass(`AGENTS.md has section: ${section}`);
  } else {
    fail(`AGENTS.md missing section: ${section}`);
  }
}

// ── 10. VERSION FILE ─────────────────────────────────────────────

console.log('\n10. Version file');

if (fileExists('VERSION')) {
  const version = readFile('VERSION').trim();
  if (/^\d+\.\d+\.\d+$/.test(version)) {
    pass(`VERSION is valid semver: ${version}`);
  } else {
    fail(`VERSION is not valid semver: "${version}"`);
  }
} else {
  fail('VERSION file missing');
}

// ── SUMMARY ─────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${warnings} warnings`);

if (failed > 0) {
  console.log('🔴 TESTS FAILED — do NOT push/merge until fixed\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('🟡 Tests passed with warnings — review before pushing\n');
  process.exit(0);
} else {
  console.log('🟢 All tests passed — safe to push/merge\n');
  process.exit(0);
}

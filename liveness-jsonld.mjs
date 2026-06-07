// liveness-jsonld.mjs — universal schema.org JobPosting JSON-LD extractor.
//
// Pure function (no network / DOM deps) so it is unit-testable. Parses the
// <script type="application/ld+json"> blocks of a career page and returns the first
// JobPosting node, normalized for career-ops: real posting date, expiry, location,
// remote eligibility, salary, and apply URL.
//
// Use it to get a trustworthy posting date/expiry from arbitrary employer/career pages
// that lack a clean ATS API — the Tier-2 freshness backbone for modes/sweep.md and
// check-liveness.mjs (Google Jobs is an indexing layer over this exact markup).
// Refs: reports 005/006; https://developers.google.com/search/docs/appearance/structured-data/job-posting
//
// Handles: many ld+json blocks, top-level arrays, `@graph` arrays, nested JobPosting,
// `@type` as a string OR array, and slightly malformed blocks (each block try/caught).

const LDJSON_RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function typeMatches(type, target) {
  return asArray(type).some(t => typeof t === 'string' && t.toLowerCase() === target.toLowerCase());
}

// Depth-first collect of every JobPosting node inside an object / array / @graph.
function collectJobPostings(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectJobPostings(n, out);
    return;
  }
  if (Array.isArray(node['@graph'])) collectJobPostings(node['@graph'], out);
  if (typeMatches(node['@type'], 'JobPosting')) out.push(node);
}

function isoDate(v) {
  if (typeof v !== 'string' || !v) return '';
  const ts = Date.parse(v);
  return Number.isNaN(ts) ? v.slice(0, 10) : new Date(ts).toISOString().slice(0, 10);
}

function orgName(org) {
  if (!org) return '';
  if (typeof org === 'string') return org;
  return org.name || '';
}

function flattenLocation(loc) {
  for (const l of asArray(loc)) {
    if (!l) continue;
    if (typeof l === 'string') return l;
    const a = l.address || l;
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object') {
      const parts = [a.addressLocality, a.addressRegion, a.addressCountry]
        .map(p => (p && typeof p === 'object' ? p.name : p))
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    if (l.name) return l.name;
  }
  return '';
}

function isRemote(jp) {
  if (asArray(jp.jobLocationType).some(x => typeof x === 'string' && /telecommute/i.test(x))) return true;
  if (jp.applicantLocationRequirements && !jp.jobLocation) return true;
  return false;
}

function salaryText(jp) {
  const bs = jp.baseSalary;
  if (!bs) return '';
  if (typeof bs === 'string' || typeof bs === 'number') return String(bs);
  const v = bs.value && typeof bs.value === 'object' ? bs.value : bs;
  const cur = bs.currency || v.currency || '';
  const unit = (v.unitText || '').toString().toLowerCase();
  const suffix = unit ? `/${unit}` : '';
  if (v.minValue != null || v.maxValue != null) {
    return `${cur} ${v.minValue ?? ''}${v.maxValue != null ? '-' + v.maxValue : ''}${suffix}`.trim();
  }
  if (v.value != null && typeof v.value !== 'object') return `${cur} ${v.value}${suffix}`.trim();
  return '';
}

/**
 * @param {string} html  Raw page HTML.
 * @param {string} [pageUrl]  The page URL (apply-URL fallback).
 * @returns {null | {title,company,posted,validThrough,location,remote,salary,url,directApply,_count}}
 */
export function extractJobPostingJsonLd(html, pageUrl = '') {
  if (!html || typeof html !== 'string') return null;
  const found = [];
  let m;
  LDJSON_RE.lastIndex = 0;
  while ((m = LDJSON_RE.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(raw.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''));
      } catch {
        continue;
      }
    }
    collectJobPostings(parsed, found);
  }
  if (found.length === 0) return null;
  const jp = found[0];
  let url = jp.url || pageUrl || '';
  if (url && typeof url === 'object') url = url.url || pageUrl || '';
  return {
    title: jp.title || '',
    company: orgName(jp.hiringOrganization),
    posted: isoDate(jp.datePosted),
    validThrough: isoDate(jp.validThrough),
    location: flattenLocation(jp.jobLocation),
    remote: isRemote(jp),
    salary: salaryText(jp),
    url: typeof url === 'string' ? url : pageUrl || '',
    directApply: jp.directApply === true || jp.directApply === 'true',
    _count: found.length,
  };
}

export default extractJobPostingJsonLd;

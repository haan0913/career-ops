// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

import { escapeHtml } from './_html.mjs';

// JSearch provider (OpenWeb Ninja / RapidAPI) — aggregated job search over Google for
// Jobs: LinkedIn, Indeed, Glassdoor, ZipRecruiter, and company sites incl. Workday/iCIMS
// that have NO public API. This is the broad-market lane the sweep used to hand-collect.
//
// Query-based, NOT per-company: a tracked_companies entry opts in with
//   provider: jsearch
//   jsearch_query: "(project analyst OR pmo analyst) in New York"
//   jsearch_date_posted: week        # optional: all|today|3days|week|month (freshness)
//   jsearch_num_pages: 1             # optional
//   jsearch_country: us              # optional
// scan.mjs honors the explicit `provider:` field and skips detect().
//
// Requires a free RapidAPI key in the environment: JSEARCH_API_KEY (or RAPIDAPI_KEY).
// scan.mjs loads `.env` via dotenv. Without a key the provider skips quietly (one note).
// Endpoint + field names verified 2026-06-06: jsearch.p.rapidapi.com/search.

const HOST = 'jsearch.p.rapidapi.com';
let warnedNoKey = false;

// Free-tier RapidAPI caps requests-per-second, and scan.mjs fires providers
// concurrently — so JSearch queries must be SERIALIZED (one in flight, spaced ~1.5s)
// and retried on 429. Rate-limit 429s are gateway-rejected and don't count against the
// monthly quota, so retrying is safe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 1500;
let chain = Promise.resolve();
function serialize(task) {
  const run = chain.then(task);
  chain = run.then(() => sleep(MIN_GAP_MS), () => sleep(MIN_GAP_MS));
  return run;
}
async function fetchJsonRetry(ctx, url, opts, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      // Capture the RapidAPI monthly-quota headers when available so the scan summary
      // (and the dashboard) can surface remaining requests. Falls back to plain fetchJson.
      if (typeof ctx.fetchJsonMeta === 'function') {
        const { json, headers } = await ctx.fetchJsonMeta(url, opts);
        const rem = headers?.get?.('x-ratelimit-requests-remaining');
        const lim = headers?.get?.('x-ratelimit-requests-limit');
        if (rem != null) console.log(`JSearch quota: ${rem}/${lim ?? '?'}`);
        return json;
      }
      return await ctx.fetchJson(url, opts);
    } catch (err) {
      if (err && err.status === 429 && i < tries - 1) {
        await sleep(2000 * (i + 1));
        continue;
      }
      throw err;
    }
  }
}

function isoDate(ts, fallbackIso) {
  if (typeof ts === 'number' && ts > 0) return new Date(ts * 1000).toISOString().slice(0, 10);
  if (typeof fallbackIso === 'string' && fallbackIso) return fallbackIso.slice(0, 10);
  return '';
}

// Tier-2 hygiene: drop scraper-spam relisters and prefer a direct/employer apply link.
// JSearch wraps many results in aggregators; only CLEAR spam is denylisted — real boards
// (LinkedIn/Indeed/BeBee/Monster/CareerBuilder/Jobleads) are kept (wrapped, not junk).
// Add domains here as new spam relisters surface.
const JUNK_HOSTS = [
  'liveblog365.com', // "2.halvolink" blog-spam relistings with no real apply path
];
function isJunkUrl(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return JUNK_HOSTS.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return true; // unparseable → treat as junk
  }
}
// A bare careers landing page (no specific requisition) is the "link opens the
// generic careers page" failure — deprioritize it so a deeper, job-specific link
// wins. Matches /careers, /jobs, /search, /openings, /en-us/careers, etc.
const GENERIC_PATH =
  /^\/?(?:careers?|jobs?|join-?us|work-?with-us|opportunities|openings|search|vacancies|positions|en(?:-[a-z]{2})?\/(?:careers?|jobs?))\/?$/i;
function pathSpecificity(url) {
  let p;
  try {
    p = new URL(url);
  } catch {
    return -5;
  }
  const seg = p.pathname.replace(/\/+$/, '');
  if (seg === '' || GENERIC_PATH.test(p.pathname)) return -3; // generic landing page
  if (/\d{4,}/.test(seg) || /\/(?:job|jobs|posting|position)s?[/=][\w-]{5,}/i.test(seg)) return 1; // req-id in path
  if (/[?&](?:jid|gh_jid|jobid|job_id|id|req|requisition)=/i.test(p.search)) return 1; // req-id in query
  return 0;
}

// Rank every apply option (job_apply_link + apply_options[]), highest first.
// Score = direct-employer bonus + path specificity. Carries publisher + isDirect
// so the snapshot/UI can show "via LinkedIn" and offer alternative apply paths.
function rankedOptions(j) {
  const opts = [];
  if (j.job_apply_link)
    opts.push({ url: j.job_apply_link, isDirect: !!j.job_apply_is_direct, publisher: j.job_publisher || '' });
  for (const o of Array.isArray(j.apply_options) ? j.apply_options : []) {
    if (o && o.apply_link) opts.push({ url: o.apply_link, isDirect: !!o.is_direct, publisher: o.publisher || '' });
  }
  const seen = new Set();
  return opts
    .filter((o) => !isJunkUrl(o.url) && !seen.has(o.url) && seen.add(o.url))
    .map((o) => ({ ...o, _score: (o.isDirect ? 2 : 0) + pathSpecificity(o.url) }))
    .sort((a, b) => b._score - a._score);
}

// Best apply URL = highest-scored non-junk option. null when all junk → drop the
// job. (string return kept for provider unit tests; rankedOptions carries the rest.)
function pickApplyUrl(j) {
  const r = rankedOptions(j);
  return r.length ? r[0].url : null;
}

// ── JD snapshot builders ────────────────────────────────────────────
// JSearch returns the full posting in the SAME /search response: job_description
// (plain text), job_highlights {Qualifications,Responsibilities,Benefits}, and
// salary fields. We render them to clean HTML once, at scan time.

const EMPLOYMENT_LABELS = {
  FULLTIME: 'Full-time',
  PARTTIME: 'Part-time',
  CONTRACTOR: 'Contract',
  CONTRACT: 'Contract',
  INTERN: 'Internship',
  TEMPORARY: 'Temporary',
};
function humanEmploymentType(t) {
  if (!t) return '';
  return EMPLOYMENT_LABELS[String(t).toUpperCase()] || String(t);
}

const PERIOD_SUFFIX = { YEAR: '/yr', MONTH: '/mo', WEEK: '/wk', HOUR: '/hr', DAY: '/day' };
function formatSalary(j) {
  const min = Number(j.job_min_salary) || 0;
  const max = Number(j.job_max_salary) || 0;
  if (!min && !max) return '';
  const cur = (j.job_salary_currency || 'USD').toUpperCase();
  const sym = cur === 'USD' ? '$' : `${cur} `;
  const per = PERIOD_SUFFIX[String(j.job_salary_period || '').toUpperCase()] || '';
  const k = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`);
  const lo = min ? `${sym}${k(min)}` : '';
  const hi = max ? `${sym}${k(max)}` : '';
  if (lo && hi && min !== max) return `${lo}–${hi}${per}`;
  return `${lo || hi}${per}`;
}

// Plain-text description → paragraphs + bullet lists. JSearch uses \n\n between
// blocks and • / - / * for bullets.
function descToHtml(text) {
  if (!text) return '';
  return String(text)
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
      const bullety = lines.length > 1 && lines.every((l) => /^[•\-*]/.test(l));
      if (bullety)
        return '<ul>' + lines.map((l) => `<li>${escapeHtml(l.replace(/^[•\-*]\s*/, ''))}</li>`).join('') + '</ul>';
      return `<p>${escapeHtml(b).replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');
}

function highlightsHtml(h) {
  if (!h || typeof h !== 'object') return '';
  let out = '';
  for (const k of ['Responsibilities', 'Qualifications', 'Benefits']) {
    const arr = h[k];
    if (Array.isArray(arr) && arr.length)
      out += `<h3>${escapeHtml(k)}</h3><ul>` + arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('') + '</ul>';
  }
  return out ? `<div class="jd-highlights">${out}</div>` : '';
}

// Highlights (scannable summary, Indeed-style) on top, then the full description.
function buildJdHtml(j) {
  const hi = highlightsHtml(j.job_highlights);
  const desc = descToHtml(j.job_description);
  return [hi, desc].filter(Boolean).join('\n');
}

export { isJunkUrl, pickApplyUrl, rankedOptions, pathSpecificity, formatSalary }; // exported for unit tests

/** @type {Provider} */
export default {
  id: 'jsearch',
  // Tier 2 (aggregator over Google for Jobs). scan.mjs liveness-gates Tier-2+ offers
  // before they reach the pipeline (source-tier doctrine).
  tier: 2,

  // Routed only via an explicit `provider: jsearch`; no URL auto-detection.
  detect() {
    return null;
  },

  async fetch(entry, ctx) {
    const key = process.env.JSEARCH_API_KEY || process.env.RAPIDAPI_KEY;
    if (!key) {
      if (!warnedNoKey) {
        console.error('ℹ️  jsearch: set JSEARCH_API_KEY in .env to enable JSearch queries — skipping.');
        warnedNoKey = true;
      }
      return [];
    }
    const query = entry.jsearch_query || entry.query;
    if (!query) throw new Error(`jsearch: entry "${entry.name}" needs a jsearch_query`);

    const params = new URLSearchParams({
      query,
      page: '1',
      num_pages: String(entry.jsearch_num_pages || 1),
      country: entry.jsearch_country || 'us',
    });
    if (entry.jsearch_date_posted) params.set('date_posted', entry.jsearch_date_posted);

    const json = await serialize(() => fetchJsonRetry(ctx, `https://${HOST}/search?${params.toString()}`, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': HOST },
      // JSearch aggregator latency runs ~8s and can spike past the 10s default → abort.
      timeoutMs: entry.jsearch_timeout_ms || 25000,
    }));
    const data = Array.isArray(json?.data) ? json.data : [];
    return data
      .map((j) => {
        const ranked = rankedOptions(j); // canonicalize + drop junk/spam relisters
        if (ranked.length === 0) return null;
        const chosen = ranked[0];
        return {
          title: j.job_title || '',
          url: chosen.url,
          // Aggregated results carry the real employer per job, not the query label.
          company: j.employer_name || entry.name,
          location: j.job_is_remote
            ? 'Remote'
            : [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '),
          posted: isoDate(j.job_posted_at_timestamp, j.job_posted_at_datetime_utc),
          // Rich snapshot fields — captured here so scan.mjs persists the JD and the
          // dashboard never has to live-fetch a rot-prone employer link (jd-store.mjs).
          employmentType: humanEmploymentType(j.job_employment_type),
          salary: formatSalary(j),
          publisher: chosen.publisher || j.job_publisher || '',
          logo: j.employer_logo || '',
          googleLink: j.job_google_link || '',
          applyIsDirect: chosen.isDirect,
          applyOptions: ranked.slice(0, 4).map((o) => ({ url: o.url, publisher: o.publisher, isDirect: o.isDirect })),
          descriptionHtml: buildJdHtml(j),
        };
      })
      .filter(Boolean);
  },
};

// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

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
// Choose the best apply URL: prefer a direct (employer) option, else the first non-junk
// option. Returns null when every option is junk → the job is dropped.
function pickApplyUrl(j) {
  const opts = [];
  if (j.job_apply_link) opts.push({ url: j.job_apply_link, direct: !!j.job_apply_is_direct });
  for (const o of Array.isArray(j.apply_options) ? j.apply_options : []) {
    if (o && o.apply_link) opts.push({ url: o.apply_link, direct: !!o.is_direct });
  }
  const clean = opts.filter((o) => !isJunkUrl(o.url));
  if (clean.length === 0) return null;
  return (clean.find((o) => o.direct) || clean[0]).url;
}

export { isJunkUrl, pickApplyUrl }; // exported for unit tests

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
        const url = pickApplyUrl(j); // canonicalize + drop junk/spam relisters
        if (!url) return null;
        return {
          title: j.job_title || '',
          url,
          // Aggregated results carry the real employer per job, not the query label.
          company: j.employer_name || entry.name,
          location: j.job_is_remote
            ? 'Remote'
            : [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '),
          posted: isoDate(j.job_posted_at_timestamp, j.job_posted_at_datetime_utc),
        };
      })
      .filter(Boolean);
  },
};

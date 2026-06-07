// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Workday CXS provider — the (undocumented but public, no-auth) Candidate Experience
// Service that every Workday careers site calls. Highest-value enterprise lane
// (banks/insurance/large operating cos). Verified live 2026-06-06 against Morningstar
// (wd5/Americas) and Nasdaq (wd1/Global_External_Site).
//
// Tier 1 canonical source, but reverse-engineered + Akamai-fronted: keep request
// volume modest. Configure a tracked_companies entry by either:
//   careers_url: https://{tenant}.wd{N}.myworkdayjobs.com/{site}        (auto-detected)
//   careers_url: https://{tenant}.wd{N}.myworkdayjobs.com/en-US/{site}  (locale tolerated)
// or explicit fields with `provider: workday`:
//   workday_tenant: morningstar
//   workday_site: Americas
//   workday_shard: wd5            # optional (default wd1) when no host given
//   workday_host: morningstar.wd5.myworkdayjobs.com   # optional explicit host
// Optional: `workday_enrich: true` → fetch the detail endpoint per posting for the
//   EXACT startDate + resolved location (accurate but N+1 requests; default off).
//
// Endpoints:
//   POST https://{host}/wday/cxs/{tenant}/{site}/jobs   body {appliedFacets,limit,offset,searchText}
//   GET  https://{host}/wday/cxs/{tenant}/{site}{externalPath}   (detail; jobPostingInfo)
// Public job URL: https://{host}/{site}{externalPath}

const PAGE_LIMIT = 20;    // Workday CXS caps list pages at 20
const MAX_PAGES = 25;     // safety cap (500 postings) to bound large tenants
const POST_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

function resolveWorkday(entry) {
  if (entry.workday_tenant && entry.workday_site) {
    const shard = entry.workday_shard || 'wd1';
    const host = entry.workday_host || `${entry.workday_tenant}.${shard}.myworkdayjobs.com`;
    return { host, tenant: entry.workday_tenant, site: entry.workday_site };
  }
  const url = entry.careers_url || '';
  // {tenant}.wd{N}.myworkdayjobs.com/[<locale>/]{site}
  const m = url.match(/https?:\/\/(([^/.]+)\.wd\d+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Za-z]{2,4}\/)?([^/?#]+)/i);
  if (m) return { host: m[1], tenant: m[2], site: m[3] };
  return null;
}

// Workday list `postedOn` is human text ("Posted Yesterday", "Posted 30+ Days Ago").
// Parse defensively to an approximate YYYY-MM-DD (good enough for --max-age-days).
// Returns '' when unparseable (kept; sorts last; never dropped by the age filter).
export function parseWorkdayPostedOn(s, now = new Date()) {
  if (!s || typeof s !== 'string') return '';
  const t = s.toLowerCase();
  const iso = (d) => d.toISOString().slice(0, 10);
  const minus = (n, unit) => {
    const d = new Date(now);
    if (unit === 'month') d.setUTCMonth(d.getUTCMonth() - n);
    else d.setUTCDate(d.getUTCDate() - n);
    return iso(d);
  };
  if (/posted\s+today/.test(t)) return iso(now);
  if (/posted\s+yesterday/.test(t)) return minus(1, 'day');
  let m = t.match(/posted\s+(\d+)\+?\s+days?\s+ago/);
  if (m) return minus(parseInt(m[1], 10), 'day');
  m = t.match(/posted\s+(\d+)\+?\s+months?\s+ago/);
  if (m) return minus(parseInt(m[1], 10), 'month');
  const ts = Date.parse(s.replace(/posted\s+on\s+/i, ''));
  if (!Number.isNaN(ts)) return new Date(ts).toISOString().slice(0, 10);
  return '';
}

// Resolve a usable location. Prefer a single named city from `locationsText`; when it's
// a count ("2 Locations" / "3 Standorte") or empty, derive the PRIMARY location from the
// externalPath — Workday always encodes it as `/job/{Location}/{Title}_{ReqId}`. This lets
// the location filter actually work on multi-location roles (e.g. drop a Vilnius-primary
// role, keep a New-York-primary one) instead of blanket-passing every multi-location job.
function jobLocation(p) {
  const lt = p.locationsText;
  if (lt && !(/^\s*\d+\s+\S+/.test(lt) && /location|standort|lieu|ubicaci/i.test(lt))) return lt;
  const m = (p.externalPath || '').match(/^\/job\/([^/]+)\//i);
  if (m) return m[1].replace(/-{2,}/g, ', ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  return '';
}

/** @type {Provider} */
export default {
  id: 'workday',

  detect(entry) {
    const wd = resolveWorkday(entry);
    return wd ? { url: `https://${wd.host}/wday/cxs/${wd.tenant}/${wd.site}/jobs` } : null;
  },

  async fetch(entry, ctx) {
    const wd = resolveWorkday(entry);
    if (!wd) throw new Error(`workday: cannot resolve tenant/site for ${entry.name}`);
    const { host, tenant, site } = wd;
    const base = `https://${host}/wday/cxs/${tenant}/${site}`;
    const enrich = entry.workday_enrich === true;

    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_LIMIT;
      const json = await ctx.fetchJson(`${base}/jobs`, {
        method: 'POST',
        headers: POST_HEADERS,
        body: JSON.stringify({ appliedFacets: {}, limit: PAGE_LIMIT, offset, searchText: entry.workday_search || '' }),
      });
      const postings = Array.isArray(json?.jobPostings) ? json.jobPostings : [];
      for (const p of postings) {
        const path = p.externalPath || '';
        out.push({
          title: p.title || '',
          url: path ? `https://${host}/${site}${path}` : '',
          company: entry.name,
          location: jobLocation(p),
          posted: parseWorkdayPostedOn(p.postedOn),
        });
      }
      const total = Number(json?.total) || 0;
      if (postings.length === 0 || offset + PAGE_LIMIT >= total) break;
    }

    // Opt-in: enrich with the detail endpoint for exact startDate + resolved location.
    if (enrich) {
      for (const job of out) {
        const path = job.url.slice(`https://${host}/${site}`.length);
        try {
          const d = await ctx.fetchJson(`${base}${path}`, { headers: POST_HEADERS });
          const info = d?.jobPostingInfo || {};
          if (info.startDate) job.posted = String(info.startDate).slice(0, 10);
          if (info.location) {
            job.location = [info.location, ...(Array.isArray(info.additionalLocations) ? info.additionalLocations : [])]
              .filter(Boolean).join('; ');
          }
        } catch { /* leave list-derived values on enrichment failure */ }
      }
    }
    return out;
  },
};

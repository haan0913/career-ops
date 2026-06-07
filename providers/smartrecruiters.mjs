// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// SmartRecruiters provider — hits the PUBLIC Posting API (no auth).
// Verified live 2026-06-06 against api.smartrecruiters.com/v1/companies/Visa/postings.
// Auto-detects the company identifier from careers_url:
//   https://jobs.smartrecruiters.com/{companyId}
//   https://careers.smartrecruiters.com/{companyId}
//   https://api.smartrecruiters.com/v1/companies/{companyId}/postings
// or an explicit `smartrecruiters_id:` field on the tracked_companies entry.

const PAGE_LIMIT = 100;   // max postings per request
const MAX_PAGES = 10;     // safety cap (1000 postings) to bound large boards

function resolveCompanyId(entry) {
  if (entry.smartrecruiters_id) return entry.smartrecruiters_id;
  const url = entry.careers_url || entry.api || '';
  let m = url.match(/api\.smartrecruiters\.com\/v1\/companies\/([^/?#]+)/i);
  if (m) return m[1];
  m = url.match(/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)/i);
  if (m) return m[1];
  return null;
}

/** @type {Provider} */
export default {
  id: 'smartrecruiters',

  detect(entry) {
    const id = resolveCompanyId(entry);
    return id ? { url: `https://api.smartrecruiters.com/v1/companies/${id}/postings` } : null;
  },

  async fetch(entry, ctx) {
    const id = resolveCompanyId(entry);
    if (!id) throw new Error(`smartrecruiters: cannot derive company id for ${entry.name}`);
    const out = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_LIMIT;
      const json = await ctx.fetchJson(
        `https://api.smartrecruiters.com/v1/companies/${id}/postings?limit=${PAGE_LIMIT}&offset=${offset}`,
      );
      const content = Array.isArray(json?.content) ? json.content : [];
      for (const p of content) {
        const loc = p.location || {};
        const location = loc.fullLocation
          || [loc.city, loc.region, loc.country].filter(Boolean).join(', ')
          || (loc.remote ? 'Remote' : '');
        out.push({
          title: p.name || '',
          // Public posting URL; releasedDate → YYYY-MM-DD for freshness.
          url: `https://jobs.smartrecruiters.com/${id}/${p.id}`,
          company: entry.name,
          location,
          posted: (p.releasedDate || '').slice(0, 10),
        });
      }
      const total = Number(json?.totalFound) || 0;
      if (content.length === 0 || offset + PAGE_LIMIT >= total) break;
    }
    return out;
  },
};

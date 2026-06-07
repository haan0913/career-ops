// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Recruitee provider — hits the PUBLIC offers API (no auth).
// Verified live 2026-06-06 against channable.recruitee.com/api/offers.
// Auto-detects the company slug from careers_url:
//   https://{slug}.recruitee.com
// or an explicit `recruitee_slug:` field on the tracked_companies entry.

function resolveSlug(entry) {
  if (entry.recruitee_slug) return entry.recruitee_slug;
  const url = entry.careers_url || '';
  const m = url.match(/https?:\/\/([^.]+)\.recruitee\.com/i);
  return m ? m[1] : null;
}

/** @type {Provider} */
export default {
  id: 'recruitee',

  detect(entry) {
    const slug = resolveSlug(entry);
    return slug ? { url: `https://${slug}.recruitee.com/api/offers/` } : null;
  },

  async fetch(entry, ctx) {
    const slug = resolveSlug(entry);
    if (!slug) throw new Error(`recruitee: cannot derive slug for ${entry.name}`);
    const json = await ctx.fetchJson(`https://${slug}.recruitee.com/api/offers/`);
    const offers = Array.isArray(json?.offers) ? json.offers : [];
    return offers.map(o => ({
      title: o.title || '',
      url: o.careers_url || '',
      company: entry.name,
      location: o.location || [o.city, o.country].filter(Boolean).join(', ') || (o.remote ? 'Remote' : ''),
      // published_at is "YYYY-MM-DD HH:MM:SS UTC" → take the date.
      posted: (o.published_at || '').slice(0, 10),
    }));
  },
};

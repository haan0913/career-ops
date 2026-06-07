// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// Workable provider — hits the PUBLIC account widget API (no auth).
// Verified live 2026-06-06 against apply.workable.com/api/v1/widget/accounts/blueground.
// Auto-detects the account slug from careers_url:
//   https://apply.workable.com/{slug}
//   https://{slug}.workable.com
// or an explicit `workable_slug:` field on the tracked_companies entry.

function resolveSlug(entry) {
  if (entry.workable_slug) return entry.workable_slug;
  const url = entry.careers_url || '';
  // apply.workable.com/{slug} or apply.workable.com/widget/accounts/{slug}
  // ('j' is the per-posting path — never an account slug)
  let m = url.match(/apply\.workable\.com\/(?:widget\/accounts\/)?([^/?#]+)/i);
  if (m && m[1] !== 'j') return m[1];
  m = url.match(/https?:\/\/([^.]+)\.workable\.com/i);
  if (m) return m[1];
  return null;
}

/** @type {Provider} */
export default {
  id: 'workable',

  detect(entry) {
    const slug = resolveSlug(entry);
    return slug ? { url: `https://apply.workable.com/api/v1/widget/accounts/${slug}` } : null;
  },

  async fetch(entry, ctx) {
    const slug = resolveSlug(entry);
    if (!slug) throw new Error(`workable: cannot derive slug for ${entry.name}`);
    const json = await ctx.fetchJson(
      `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`,
    );
    const jobs = Array.isArray(json?.jobs) ? json.jobs : [];
    return jobs.map(j => {
      const loc0 = j.locations?.[0] || {};
      return {
        title: j.title || '',
        url: j.url || j.shortlink || '',
        company: entry.name,
        location: [j.city, j.state, j.country].filter(Boolean).join(', ')
          || [loc0.city, loc0.country].filter(Boolean).join(', ')
          || (j.telecommuting ? 'Remote' : ''),
        // published_on is already YYYY-MM-DD; slice defensively.
        posted: (j.published_on || '').slice(0, 10),
      };
    });
  },
};

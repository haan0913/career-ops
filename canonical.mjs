/**
 * canonical.mjs — normalization + match keys for cross-source entity resolution.
 *
 * The same opening shows up on the employer ATS, LinkedIn, Indeed, ZipRecruiter,
 * staffing boards… These helpers reduce an offer to comparable keys so
 * jobs-store.mjs can merge copies into one canonical job instead of letting
 * each source create a new pipeline row.
 *
 * Matching is deliberately conservative and every rule is named, so merges
 * are explainable (the reason is stored) and reversible (nothing is deleted —
 * every source URL is kept on the canonical record).
 */
import { createHash } from 'crypto';
import { normalizeLocation } from './location.mjs';

const COMPANY_SUFFIX_RE = /\b(incorporated|inc|llc|llp|ltd|limited|corp|corporation|company|co|plc|gmbh|group|holdings?)\b\.?/g;

/** "Compu-Vision Consulting Inc." → "compuvision consulting" */
export function normalizeCompany(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(COMPANY_SUFFIX_RE, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Sr. Business Analyst — Credit Risk (NYC)" → "sr business analyst credit risk nyc" */
export function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TRACKING_PARAMS = /^(utm_|gh_src|ref|source|src|gclid|fbclid|trk|refid|mkt_tok)/i;

/** Strip tracking params + fragments, lowercase host — same posting, same key. */
export function urlKey(url) {
  try {
    const u = new URL(String(url));
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = '';
    for (const [k, v] of params) u.searchParams.append(k, v);
    u.hash = '';
    u.host = u.host.toLowerCase();
    return u.href.replace(/\/+$/, '');
  } catch {
    return String(url || '').trim().replace(/\/+$/, '');
  }
}

/** Extract an ATS requisition id when the URL format carries one. */
export function reqIdFromUrl(url) {
  const s = String(url || '');
  let m = s.match(/[?&]gh_jid=(\d+)/);                            // Greenhouse
  if (m) return `gh:${m[1]}`;
  m = s.match(/ashbyhq\.com\/[^/]+\/([0-9a-f-]{36})/i);           // Ashby
  if (m) return `ashby:${m[1].toLowerCase()}`;
  m = s.match(/jobs\.lever\.co\/[^/]+\/([0-9a-f-]{36})/i);        // Lever
  if (m) return `lever:${m[1].toLowerCase()}`;
  m = s.match(/myworkdayjobs\.com\/.*_(R-?\d{4,})/i);             // Workday req
  if (m) return `wd:${m[1].toUpperCase()}`;
  return null;
}

/**
 * Location discriminator for merge keys — finer than the coarse filter `group`.
 * Two copies of ONE posting across sources share a city ("New York, NY" vs
 * "New York, New York, US" → "new york"); two DIFFERENT openings in different
 * cities ("Seattle, WA" vs "Salt Lake City, UT") must not collapse just because
 * their boilerplate JD is identical. Falls back to the coarse group, then 'any'.
 */
export function locMatchKey(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'any';
  const group = normalizeLocation(text).group;
  // Specific groups already collapse phrasing variants correctly
  // ("New York, NY" / "New York City" / "Manhattan" → nyc) — use them as-is.
  if (group === 'nyc' || group === 'chicago' || group === 'remote-us' || group === 'remote-foreign') {
    return group;
  }
  // Coarse buckets (us-other / foreign / unknown) lump many cities together, so
  // fall back to the city token to keep Seattle ≠ Salt Lake City distinct.
  const first = text.toLowerCase().split(',')[0].trim();
  if (first && !/remote|anywhere|hybrid|onsite|on-?site|work from home/.test(first)) {
    return first.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim() || group;
  }
  return group;
}

/** Hash of the JD text (HTML stripped, whitespace collapsed). ≥200 chars only. */
export function descHash(html) {
  const text = String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length < 200) return null;
  return createHash('sha1').update(text).digest('hex').slice(0, 16);
}

/** Stable id for a canonical job record. */
export function canonicalId(offer) {
  const seed = `${normalizeCompany(offer.company)}::${normalizeTitle(offer.title)}::${urlKey(offer.url)}`;
  return 'cj_' + createHash('sha1').update(seed).digest('hex').slice(0, 16);
}

/** All comparable keys for one offer, computed once. */
export function offerKeys(offer) {
  return {
    companyKey: normalizeCompany(offer.company),
    titleKey: normalizeTitle(offer.title),
    locGroup: normalizeLocation(offer.location || '').group,
    locKey: locMatchKey(offer.location || ''),
    urlKey: urlKey(offer.url),
    reqId: reqIdFromUrl(offer.url),
    descHash: descHash(offer.descriptionHtml),
  };
}

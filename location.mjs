/**
 * location.mjs — normalized location model.
 *
 * Turns a raw location string into a structured record so filtering can
 * reason about *what kind* of location a job has instead of substring-matching
 * the raw text. The substring allow/block list in portals.yml remains a
 * backstop for strings this model can't classify (group: 'unknown').
 *
 *   normalizeLocation('Remote - EMEA')      → { remote: true,  geo: 'emea', group: 'remote-foreign', ... }
 *   normalizeLocation('Remote (US)')        → { remote: true,  geo: 'us',   group: 'remote-us', ... }
 *   normalizeLocation('New York, NY')       → { remote: false, geo: 'us',   group: 'nyc', city: 'New York', state: 'NY' }
 *   normalizeLocation('Chicago, IL (Hybrid)') → { group: 'chicago', hybrid: true }
 *
 * Groups are intentionally coarse and user-centric: 'nyc' | 'chicago' |
 * 'remote-us' | 'us-other' | 'foreign' | 'remote-foreign' | 'unknown'.
 */

const FOREIGN_GEO = [
  ['apac', /\bapac\b/], ['emea', /\bemea\b/], ['latam', /\blatam\b/],
  ['europe', /\beurope(an)?\b/], ['uk', /\bunited kingdom\b|\buk\b|\blondon\b/],
  ['canada', /\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b/],
  ['india', /\bindia\b|\bbengaluru\b|\bbangalore\b|\bhyderabad\b|\bmumbai\b|\bpune\b/],
  ['asia', /\basia\b|\bsingapore\b|\bjapan\b|\btokyo\b|\bhong kong\b|\bchina\b|\bkorea\b|\bphilippines\b|\bmanila\b/],
  ['oceania', /\baustralia\b|\bsydney\b|\bnew zealand\b/],
  ['mideast', /\bisrael\b|\btel aviv\b|\bdubai\b|\bunited arab emirates\b|\buae\b/],
  ['lat-am', /\bbrazil\b|\bmexico\b|\bcolombia\b|\bargentina\b|\bchile\b/],
  ['europe-city', /\bberlin\b|\bgermany\b|\bparis\b|\bfrance\b|\bdublin\b|\bireland\b|\bwarsaw\b|\bpoland\b|\bamsterdam\b|\bnetherlands\b|\bspain\b|\bmadrid\b|\bbarcelona\b|\bportugal\b|\blisbon\b|\bzurich\b|\bswitzerland\b/],
];

const NYC_RE = /\bnew york\b|\bnyc\b|\bmanhattan\b|\bbrooklyn\b|\bqueens\b|\bjersey city\b|\bhoboken\b|\bstamford\b|\bwhite plains\b|, ?ny\b/;
const CHICAGO_RE = /\bchicago\b|, ?il\b/;
const REMOTE_RE = /\bremote\b|\banywhere\b|\bwork from home\b|\bwfh\b|\bdistributed\b/;
const HYBRID_RE = /\bhybrid\b/;
const US_RE = /\bunited states\b|\busa\b|\bu\.s\.?a?\.?\b|\bus\b(?![a-z])|\bus-?based\b|\bnationwide\b/;

// US state abbreviations + a few major city names → treat as US even without "US" in the text.
const US_HINT_RE = /, ?(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b|\b(boston|austin|seattle|denver|atlanta|dallas|houston|miami|san francisco|los angeles|washington,? d\.?c\.?|philadelphia|phoenix|charlotte|salt lake)\b/;

export function normalizeLocation(raw) {
  const text = String(raw || '').trim();
  const lower = text.toLowerCase();
  const out = { raw: text, remote: REMOTE_RE.test(lower), hybrid: HYBRID_RE.test(lower), geo: null, city: null, state: null, group: 'unknown' };
  if (!text) return out;

  let foreign = null;
  for (const [name, re] of FOREIGN_GEO) {
    if (re.test(lower)) { foreign = name; break; }
  }
  const isNyc = NYC_RE.test(lower);
  const isChi = CHICAGO_RE.test(lower);
  const isUs = isNyc || isChi || US_RE.test(lower) || US_HINT_RE.test(lower);

  if (foreign && !isUs) {
    out.geo = foreign;
    out.group = out.remote ? 'remote-foreign' : 'foreign';
    return out;
  }
  // Mixed (e.g. "New York / London") counts as US-reachable; keep the US group.
  if (isNyc) { out.geo = 'us'; out.city = 'New York'; out.state = 'NY'; out.group = 'nyc'; return out; }
  if (isChi) { out.geo = 'us'; out.city = 'Chicago'; out.state = 'IL'; out.group = 'chicago'; return out; }
  if (out.remote && isUs) { out.geo = 'us'; out.group = 'remote-us'; return out; }
  if (out.remote && !foreign && !isUs) {
    // Bare "Remote" with no geography: ambiguous — leave for the backstop list.
    out.group = 'unknown';
    return out;
  }
  if (isUs) { out.geo = 'us'; out.group = 'us-other'; return out; }
  return out;
}

/**
 * Build a structured location predicate from a list of wanted groups.
 * Returns null verdicts as 'defer' so the caller can fall back to the
 * substring allow/block backstop for unknowns.
 */
export function locationVerdict(raw, wantedGroups = ['nyc', 'remote-us', 'chicago']) {
  const n = normalizeLocation(raw);
  if (!n.raw) return { verdict: 'defer', norm: n };          // missing data → caller policy
  if (n.group === 'unknown') return { verdict: 'defer', norm: n };
  return { verdict: wantedGroups.includes(n.group) ? 'pass' : 'reject', norm: n };
}

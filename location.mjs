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
  ['europe', /\beurope(an)?\b/],
  ['uk', /\bunited kingdom\b|\buk\b|\bengland\b|\bscotland\b|\bwales\b|\bnorthern ireland\b|\blondon\b|\bmanchester\b|\bbirmingham\b|\bleeds\b|\bglasgow\b|\bedinburgh\b|\bbristol\b|\bcardiff\b|\bbelfast\b/],
  ['canada', /\bcanada\b|\btoronto\b|\bvancouver\b|\bmontreal\b/],
  ['india', /\bindia\b|\bbengaluru\b|\bbangalore\b|\bhyderabad\b|\bmumbai\b|\bpune\b|\bgurgaon\b|\bgurugram\b|\bchennai\b|\bnoida\b|\bdelhi\b/],
  ['asia', /\basia\b|\bsingapore\b|\bjapan\b|\btokyo\b|\bhong kong\b|\bchina\b|\bshanghai\b|\bbeijing\b|\bkorea\b|\bseoul\b|\bphilippines\b|\bmanila\b|\btaiwan\b|\btaipei\b|\bthailand\b|\bbangkok\b|\bvietnam\b|\bhanoi\b|\bho chi minh\b|\bmalaysia\b|\bkuala lumpur\b|\bindonesia\b|\bjakarta\b|\bpakistan\b|\bkarachi\b/],
  ['oceania', /\baustralia\b|\bsydney\b|\bmelbourne\b|\bnew zealand\b|\bauckland\b/],
  ['mideast', /\bisrael\b|\btel aviv\b|\btlv\b|\bdubai\b|\bunited arab emirates\b|\buae\b|\bsaudi\b|\briyadh\b|\bqatar\b|\bdoha\b|\bcairo\b|\begypt\b|\bturkey\b|\bistanbul\b/],
  ['africa', /\bsouth africa\b|\bjohannesburg\b|\bcape town\b|\bnigeria\b|\blagos\b|\bkenya\b|\bnairobi\b|\bmorocco\b|\bghana\b|\baccra\b/],
  ['lat-am', /\bbrazil\b|\bsao paulo\b|\bmexico\b|\bcolombia\b|\bbogot[aá]\b|\bargentina\b|\bbuenos aires\b|\bchile\b|\bsantiago\b|\bperu\b|\blima\b|\bcosta rica\b|\buruguay\b|\becuador\b/],
  ['europe', /\bberlin\b|\bmunich\b|\bgermany\b|\bparis\b|\bfrance\b|\bdublin\b|\bireland\b|\bwarsaw\b|\bpoland\b|\bkrak[oó]w\b|\bamsterdam\b|\bnetherlands\b|\bspain\b|\bmadrid\b|\bbarcelona\b|\bportugal\b|\blisbon\b|\bporto\b|\bzurich\b|\bswitzerland\b|\bsofia\b|\bbulgaria\b|\bbucharest\b|\bromania\b|\bbudapest\b|\bhungary\b|\bprague\b|\bczech\b|\bvienna\b|\baustria\b|\bstockholm\b|\bsweden\b|\bcopenhagen\b|\bdenmark\b|\boslo\b|\bnorway\b|\bhelsinki\b|\bfinland\b|\bathens\b|\bgreece\b|\bmilan\b|\brome\b|\bitaly\b|\bbrussels\b|\bbelgium\b|\bluxembourg\b/],
  // Wider sweep of common non-US job locales (avoids US-state collisions like
  // Georgia). Keeps "City, Country" strings from defaulting to the US backstop.
  ['asia-ext', /\bcambodia\b|\bphnom penh\b|\bbangladesh\b|\bdhaka\b|\bsri lanka\b|\bcolombo\b|\bnepal\b|\bkathmandu\b|\bmyanmar\b|\blaos\b|\bmongolia\b|\bkazakhstan\b|\buzbekistan\b|\btashkent\b/],
  ['mideast-ext', /\barmenia\b|\byerevan\b|\bazerbaijan\b|\bbaku\b|\bkuwait\b|\bbahrain\b|\boman\b|\bjordan\b|\bamman\b|\blebanon\b|\bbeirut\b|\biraq\b/],
  ['europe-ext', /\bukraine\b|\bkyiv\b|\bkiev\b|\bbelarus\b|\bminsk\b|\bserbia\b|\bbelgrade\b|\bcroatia\b|\bzagreb\b|\bslovenia\b|\bslovakia\b|\blithuania\b|\bvilnius\b|\blatvia\b|\briga\b|\bestonia\b|\btallinn\b|\biceland\b|\breykjavik\b|\bcyprus\b|\bmalta\b/],
  ['africa-ext', /\btanzania\b|\buganda\b|\brwanda\b|\bkigali\b|\bsenegal\b|\bdakar\b|\bethiopia\b|\baddis ababa\b|\bmozambique\b|\bzimbabwe\b|\bzambia\b|\btunisia\b|\balgeria\b/],
  ['lat-am-ext', /\bpanama\b|\bguatemala\b|\bhonduras\b|\bnicaragua\b|\bel salvador\b|\bdominican republic\b|\bbolivia\b|\bparaguay\b|\bvenezuela\b|\bcaracas\b/],
];

const NYC_RE = /\bnew york\b|\bnyc\b|\bmanhattan\b|\bbrooklyn\b|\bqueens\b|\bjersey city\b|\bhoboken\b|\bstamford\b|\bwhite plains\b|, ?ny\b/;
const CHICAGO_RE = /\bchicago\b|, ?il\b/;
const REMOTE_RE = /\bremote\b|\banywhere\b|\bwork from home\b|\bwfh\b|\bdistributed\b/;
const HYBRID_RE = /\bhybrid\b/;

// ── US signal detection ───────────────────────────────────────────────────
// The model is ALLOWLIST-FIRST: a location passes only when it carries a
// positive US signal. So this set must be thorough — country/"US", state
// abbreviations, FULL state names, and major metros.
const US_RE = /\bunited states\b|\busa\b|\bu\.s\.?a?\.?\b|\bus\b(?![a-z])|\bus-?based\b|\bnationwide\b/;
const US_STATE_ABBR = /,\s?(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/;
// Full state names — "georgia" deliberately OMITTED (country collision; US
// Georgia is caught by ", GA" / "Atlanta").
const US_STATE_FULL = /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|north carolina|south carolina|north dakota|south dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming|district of columbia)\b/;
const US_CITY = /\b(boston|austin|seattle|denver|atlanta|dallas|houston|miami|san francisco|los angeles|san diego|san jose|philadelphia|phoenix|charlotte|salt lake|nashville|columbus|indianapolis|fort worth|jacksonville|detroit|memphis|baltimore|milwaukee|albuquerque|sacramento|kansas city|raleigh|omaha|minneapolis|tampa|cleveland|pittsburgh|cincinnati|st\.? louis|new orleans)\b/;

function hasUsSignal(lower) {
  return US_RE.test(lower) || US_STATE_ABBR.test(lower) || US_STATE_FULL.test(lower) || US_CITY.test(lower);
}

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
  const us = isNyc || isChi || hasUsSignal(lower);

  // 1. Target lanes (a US signal anywhere in a multi-location string wins).
  if (isNyc) { out.geo = 'us'; out.city = 'New York'; out.state = 'NY'; out.group = 'nyc'; return out; }
  if (isChi) { out.geo = 'us'; out.city = 'Chicago'; out.state = 'IL'; out.group = 'chicago'; return out; }
  // 2. Known foreign (incl. "Remote - EMEA") that carries no US signal → reject.
  if (foreign && !us) { out.geo = foreign; out.group = out.remote ? 'remote-foreign' : 'foreign'; return out; }
  // 3. Remote with a US signal → the prime lane.
  if (out.remote && us) { out.geo = 'us'; out.group = 'remote-us'; return out; }
  // 4. Bare "Remote"/"Anywhere" with no geography → inclusive: our sources are
  //    US-HQ ATS boards, so an unqualified remote role is very likely US-remote.
  if (out.remote && !us) { out.group = 'remote-unknown'; return out; }
  // 5. Onsite US (a state/metro but not a target lane).
  if (us) { out.geo = 'us'; out.group = 'us-other'; return out; }
  // 6. ALLOWLIST FLIP — a comma-bearing "City, Place" with NO US signal is a
  //    named foreign location, even if its country isn't enumerated above.
  //    This is what kills the foreign-leak whack-a-mole.
  if (/,/.test(text)) { out.group = 'foreign'; return out; }
  // 7. Truly ambiguous (e.g. "Hybrid", a single unknown token) → defer.
  return out;
}

const DEFAULT_WANTED = ['nyc', 'remote-us', 'chicago', 'remote-unknown'];

/**
 * Structured location predicate. 'pass' for target lanes (+ inclusive bare
 * remote), 'reject' for classified-but-unwanted (foreign / us-other), 'defer'
 * only for genuinely ambiguous strings so the substring backstop can decide.
 */
export function locationVerdict(raw, wantedGroups = DEFAULT_WANTED) {
  const n = normalizeLocation(raw);
  if (!n.raw) return { verdict: 'defer', norm: n };          // missing data → caller policy
  if (n.group === 'unknown') return { verdict: 'defer', norm: n };
  return { verdict: wantedGroups.includes(n.group) ? 'pass' : 'reject', norm: n };
}

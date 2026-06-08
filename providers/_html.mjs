// Shared HTML helpers for providers that capture a job description at scan time
// (greenhouse content=true, jsearch job_description/highlights). Files prefixed
// with _ are never loaded as providers by scan.mjs.
//
// These mirror the local copies in jd-fetch.mjs so the snapshot a provider writes
// is sanitized to the same doctrine the live JD reader uses.

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

export function escapeHtml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
}

// Strip scripts/styles/embeds, inline event handlers, and javascript: URLs. The
// dashboard renders the result via dangerouslySetInnerHTML, so this is the trust
// boundary for snapshot HTML.
export function sanitizeHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(iframe|object|embed|link|meta|noscript|form|input|button)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"')
    .trim();
}

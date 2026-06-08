#!/usr/bin/env node
// jd-fetch.mjs — fetch ONE job posting's JD + metadata for a URL, for the web
// dashboard's inline JD reader. Tiered, best-effort, never throws to the caller:
//   1. ATS API (greenhouse / lever)  → clean description + location
//   2. page schema.org JobPosting JSON-LD `description`  (reuses liveness-jsonld doctrine)
//   3. readable-text fallback (strip <main>/<article>)
//   4. give up → { ok:false } so the UI offers "open original"
// Output: a single JSON object on stdout.

import { pathToFileURL } from "url";
import { extractJobPostingJsonLd } from "./liveness-jsonld.mjs";
import { readSnapshot } from "./jd-store.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TIMEOUT = 20000;

async function get(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/json", ...headers },
      signal: ctrl.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(t);
  }
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

function sanitizeHtml(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?(iframe|object|embed|link|meta|noscript|form|input|button)\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"')
    .trim();
}

function escapeHtml(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
}

function htmlToText(html) {
  return decodeEntities(
    String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function deriveMode({ location = "", remote = false, employmentType = "", extra = "" }) {
  const hay = `${location} ${employmentType} ${extra}`.toLowerCase();
  if (/\bhybrid\b/.test(hay)) return "Hybrid";
  if (remote || /\bremote\b|telecommute|work from home|\bwfh\b/.test(hay)) return "Remote";
  if (location) return "Onsite";
  return "";
}

// Full JobPosting JSON-LD node (incl. description), same block scan as liveness-jsonld.
function jsonLdNode(html) {
  const RE = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = RE.exec(html)) !== null) {
    let parsed;
    try {
      parsed = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (stack.length) {
      const n = stack.shift();
      if (!n || typeof n !== "object") continue;
      if (Array.isArray(n["@graph"])) stack.push(...n["@graph"]);
      const t = n["@type"];
      const isJob = Array.isArray(t)
        ? t.some((x) => /jobposting/i.test(x))
        : /jobposting/i.test(t || "");
      if (isJob) return n;
    }
  }
  return null;
}

async function greenhouse(url) {
  const m =
    url.match(/(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_app\?for=)?([^/?#]+)(?:\/jobs\/(\d+))?/i) ||
    [];
  let board = m[1];
  let id = m[2] || url.match(/gh_jid=(\d+)/)?.[1];
  // gh_jid on a custom/employer domain (e.g. stripe.com/jobs/search?gh_jid=…) —
  // greenhouse boards are usually the company slug, so guess it from the hostname.
  if (id && !board) {
    try {
      board = new URL(url).hostname.replace(/^(www|jobs|careers|boards|apply)\./i, "").split(".")[0];
    } catch {
      /* ignore */
    }
  }
  if (!board || !id) return null;
  const res = await get(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?content=true`);
  if (!res.ok) return null;
  const d = await res.json();
  const location = d.location?.name || "";
  return {
    source: "greenhouse",
    title: d.title || "",
    company: board,
    location,
    mode: deriveMode({ location, extra: `${d.title} ${location}` }),
    employmentType: "",
    salary: "",
    posted: String(d.first_published || d.updated_at || "").slice(0, 10),
    descriptionHtml: sanitizeHtml(decodeEntities(d.content || "")),
  };
}

async function lever(url) {
  const m = url.match(/lever\.co\/([^/?#]+)\/([0-9a-f-]{36})/i);
  if (!m) return null;
  const res = await get(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}`);
  if (!res.ok) return null;
  const d = await res.json();
  const location = d.categories?.location || "";
  return {
    source: "lever",
    title: d.text || "",
    company: m[1],
    location,
    mode: deriveMode({ location, employmentType: d.workplaceType, extra: d.categories?.commitment }),
    employmentType: d.categories?.commitment || "",
    salary: "",
    posted: d.createdAt ? new Date(d.createdAt).toISOString().slice(0, 10) : "",
    descriptionHtml: sanitizeHtml(d.description || d.descriptionPlain || ""),
  };
}

async function generic(url) {
  const res = await get(url);
  if (!res.ok) return { source: "page", error: `HTTP ${res.status}` };
  const html = await res.text();
  const basics = extractJobPostingJsonLd(html, url) || {};
  const node = jsonLdNode(html);
  let descriptionHtml = node?.description ? sanitizeHtml(decodeEntities(node.description)) : "";
  if (!descriptionHtml) {
    const body = html.match(/<(?:main|article)\b[\s\S]*?<\/(?:main|article)>/i)?.[0] || html;
    const text = htmlToText(body).slice(0, 6000);
    descriptionHtml = text ? `<pre class="jd-plain">${escapeHtml(text)}</pre>` : "";
  }
  const employmentType = Array.isArray(node?.employmentType)
    ? node.employmentType.join(", ")
    : node?.employmentType || "";
  const location = basics.location || "";
  return {
    source: "page",
    title: basics.title || "",
    company: basics.company || "",
    location,
    mode: deriveMode({ location, remote: basics.remote, employmentType }),
    employmentType,
    salary: basics.salary || "",
    posted: basics.posted || "",
    validThrough: basics.validThrough || "",
    descriptionHtml,
  };
}

// SSRF guard — the dashboard fetches arbitrary pipeline URLs server-side.
const PRIVATE_HOST = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^::1$/, /^fc[0-9a-f]{2}:/i, /^fe80:/i,
];
function rejectPrivateOrInvalid(url) {
  let p;
  try {
    p = new URL(url);
  } catch {
    return { reason: "invalid URL" };
  }
  if (p.protocol !== "http:" && p.protocol !== "https:") return { reason: `unsupported protocol ${p.protocol}` };
  if (PRIVATE_HOST.some((re) => re.test(p.hostname))) return { reason: `blocked host ${p.hostname}` };
  return null;
}

// Tier 4: real browser (Playwright) — handles bot-blocked (403) + JS-rendered pages
// (Workday / Ashby / many employer SPAs) where plain fetch returns an empty shell.
async function browserFetch(url) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { source: "browser", error: "playwright unavailable" };
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 1600 } });
    const page = await ctx.newPage();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    const status = resp?.status() ?? 0;
    await page.waitForTimeout(2200);
    const html = await page.content();
    // Target the largest job-description-like container; fall back to body. Avoids
    // grabbing site nav/marketing chrome (e.g. "Chat with sales") on custom career sites.
    const bodyText = await page.evaluate(() => {
      const selectors = [
        '[class*="job-description" i]',
        '[class*="jobDescription" i]',
        '[data-testid*="description" i]',
        '[class*="posting" i]',
        '[class*="description" i]',
        "article",
        "main",
        '[role="main"]',
      ];
      let best = "";
      for (const s of selectors) {
        for (const el of Array.from(document.querySelectorAll(s))) {
          if (el.closest("nav, header, footer")) continue;
          const t = el.innerText || "";
          if (t.length > best.length) best = t;
        }
      }
      const body = document.body?.innerText || "";
      return best.length > 300 ? best : body;
    });
    const node = jsonLdNode(html);
    const basics = extractJobPostingJsonLd(html, url) || {};
    let descriptionHtml = node?.description ? sanitizeHtml(decodeEntities(node.description)) : "";
    if (!descriptionHtml && bodyText && bodyText.length > 200) {
      descriptionHtml = `<pre class="jd-plain">${escapeHtml(bodyText.slice(0, 12000))}</pre>`;
    }
    const location = basics.location || "";
    const employmentType = Array.isArray(node?.employmentType)
      ? node.employmentType.join(", ")
      : node?.employmentType || "";
    return {
      source: "browser",
      status,
      title: basics.title || node?.title || "",
      company: basics.company || "",
      location,
      mode: deriveMode({ location, remote: basics.remote, employmentType, extra: bodyText.slice(0, 400) }),
      employmentType,
      salary: basics.salary || "",
      posted: basics.posted || "",
      validThrough: basics.validThrough || "",
      descriptionHtml,
    };
  } catch (e) {
    return { source: "browser", error: String(e?.message || e).split("\n")[0] };
  } finally {
    if (browser) await browser.close();
  }
}

const OK_MIN = 200;
const isOk = (r) => !!(r && r.descriptionHtml && r.descriptionHtml.length >= OK_MIN);

// Resolve a JD for a URL. Snapshot-first: a scan-time snapshot (jd-store) is
// returned instantly and is dead-link-proof; otherwise fall through the live
// tiers (ATS API → JSON-LD → browser render). Never throws — returns a result obj.
export async function resolveJd(url) {
  if (!url) return { ok: false, error: "no url" };
  const guard = rejectPrivateOrInvalid(url);
  if (guard) return { ok: false, url, error: guard.reason, reason: guard.reason };

  // Snapshot captured at scan time — instant, and readable even if the link rotted.
  const snap = readSnapshot(url);
  if (snap && (snap.descriptionHtml || "").length >= OK_MIN) {
    return { ok: true, url, cached: true, ...snap };
  }

  try {
    // Fast tiers: clean ATS APIs, then a plain fetch + JSON-LD.
    let r = (await greenhouse(url).catch(() => null)) || (await lever(url).catch(() => null));
    if (!isOk(r)) {
      const g = await generic(url).catch((e) => ({ source: "page", error: String(e?.message || e) }));
      if (isOk(g)) r = g;
      else {
        const b = await browserFetch(url); // slow but robust
        r = isOk(b) ? b : r || g || b;
      }
    }
    r = r || { error: "unsupported" };
    const ok = isOk(r);
    if (!ok && !r.reason) {
      r.reason = /404|410/.test(r.error || "") ? "expired" : r.error ? "blocked" : "no_jd";
    }
    return { ok, url, ...r };
  } catch (e) {
    return { ok: false, url, error: String(e?.message || e) };
  }
}

async function main() {
  console.log(JSON.stringify(await resolveJd(process.argv[2])));
}

// Run only when invoked directly (node jd-fetch.mjs <url>); importable otherwise.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

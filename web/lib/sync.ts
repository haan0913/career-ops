import "server-only";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import { DATA, JD_DIR } from "./paths";
import { sqlite, ftsAvailable } from "@/db";
import { classifyLevel } from "./level";
import { computeFit } from "./fit";

type Snapshot = {
  url: string;
  descriptionHtml?: string;
  salary?: string;
  logo?: string;
  publisher?: string;
  location?: string;
  applyUrl?: string;
};

// Load every JD snapshot (written at scan time by jd-store.mjs) keyed by its job
// URL, so the pipeline projection can show the description, salary, logo, and
// publisher WITHOUT any live fetch — the proper-aggregator read path.
function loadSnapshots(): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();
  if (!existsSync(JD_DIR)) return map;
  for (const f of readdirSync(JD_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const snap = JSON.parse(readFileSync(path.join(JD_DIR, f), "utf-8")) as Snapshot;
      if (snap?.url) map.set(snap.url, snap);
    } catch {
      /* skip unreadable snapshot */
    }
  }
  return map;
}

type CanonicalSource = { source: string; url: string; seen: string };
type CanonicalInfo = { sources: CanonicalSource[]; reposted: boolean };

// url -> canonical record info from data/jobs.jsonl (the entity store the engine
// writes at scan time). Every URL a job was seen on maps to the same record, so
// cross-posted copies show their full source history; `reposted` is set when the
// record's sightings span more than 14 days (a re-post after closure/rejection).
function loadCanonicalSources(): Map<string, CanonicalInfo> {
  const map = new Map<string, CanonicalInfo>();
  const f = path.join(DATA, "jobs.jsonl");
  if (!existsSync(f)) return map;
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const job = JSON.parse(line) as { sources?: CanonicalSource[] };
      const sources = (job.sources ?? []).map((s) => ({ source: s.source, url: s.url, seen: s.seen }));
      const seenDates = sources.map((s) => Date.parse(s.seen)).filter((n) => Number.isFinite(n));
      const spanDays = seenDates.length > 1 ? (Math.max(...seenDates) - Math.min(...seenDates)) / 86_400_000 : 0;
      const info: CanonicalInfo = { sources, reposted: spanDays > 14 };
      for (const s of sources) map.set(s.url, info);
    } catch {
      /* skip corrupt line */
    }
  }
  return map;
}

type LivenessRec = { status: string; lastVerified?: string };

// url -> liveness verdict from data/liveness.jsonl (seeded + sweep-updated by
// the engine). Drives the status chip and the auto-hide-dead default view.
function loadLivenessMap(): Map<string, LivenessRec> {
  const map = new Map<string, LivenessRec>();
  const f = path.join(DATA, "liveness.jsonl");
  if (!existsSync(f)) return map;
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as { url?: string; status?: string; lastVerified?: string };
      if (r.url) map.set(r.url, { status: r.status ?? "unknown", lastVerified: r.lastVerified });
    } catch {
      /* skip corrupt line */
    }
  }
  return map;
}

function plainText(html: string | undefined, max = 4000): string {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function htmlToPreview(html: string | undefined, max = 280): string {
  const text = plainText(html, 10_000);
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

// IMPORT: parse the career-ops markdown/TSV files into the SQLite projection.
// (EXPORT — writing edits back via batch/tracker-additions + merge-tracker.mjs —
//  lands in a later step; for now the dashboard is read-mostly.)
export function syncAll() {
  syncApplications();
  syncPipeline();
}

function syncApplications() {
  const f = path.join(DATA, "applications.md");
  if (!existsSync(f)) return;
  sqlite.exec("DELETE FROM applications");
  const ins = sqlite.prepare(
    "INSERT INTO applications (number,date,company,role,score,status,pdf,report,notes) VALUES (?,?,?,?,?,?,?,?,?)",
  );
  for (const line of readFileSync(f, "utf-8").split("\n")) {
    if (!/^\|\s*\d/.test(line)) continue; // data rows: | <num> | date | company | ...
    const c = line.split("|").map((s) => s.trim());
    const num = Number(c[1]);
    if (!num) continue;
    ins.run(num, c[2] ?? "", c[3] ?? "", c[4] ?? "", c[5] ?? "", c[6] ?? "", c[7] ?? "", c[8] ?? "", c[9] ?? "");
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Sources whose posting dates come from an authoritative ATS API (high date
// confidence) vs aggregators/scrapes (medium) — used to label freshness honestly.
const AUTHORITATIVE = /greenhouse|ashby|lever|workday|smartrecruiters|workable|recruitee|oracle/i;
function dateConfidence(source: string, posted: string): "high" | "medium" | "unknown" {
  if (!posted) return "unknown";
  return AUTHORITATIVE.test(source) ? "high" : "medium";
}

// url -> {location, source, discovered} from scan-history.tsv — the richer
// per-URL record (cols: url, first_seen, portal, title, company, status,
// location, posted). `first_seen` is when WE discovered it — distinct from the
// employer's posted date, which is why freshness must not conflate the two.
function scanHistoryMeta(): Map<string, { location: string; source: string; discovered: string }> {
  const f = path.join(DATA, "scan-history.tsv");
  const map = new Map<string, { location: string; source: string; discovered: string }>();
  if (!existsSync(f)) return map;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split("\t");
    if (!c[0]) continue;
    map.set(c[0].trim(), {
      location: (c[6] ?? "").trim(),
      source: (c[2] ?? "").trim().replace(/-api$/, ""),
      discovered: (c[1] ?? "").trim(),
    });
  }
  return map;
}

function syncPipeline() {
  const f = path.join(DATA, "pipeline.md");
  if (!existsSync(f)) return;
  sqlite.exec("DELETE FROM jobs");
  if (ftsAvailable) sqlite.exec("DELETE FROM jobs_fts");
  const meta = scanHistoryMeta();
  const snaps = loadSnapshots();
  const canon = loadCanonicalSources();
  const liveness = loadLivenessMap();
  const ins = sqlite.prepare(
    "INSERT OR IGNORE INTO jobs (url,company,title,posted,state,report_num,score,location,source,description,salary,logo,apply_url,publisher,level,sources_count,sources_json,liveness,last_verified,reposted,discovered,date_confidence,fit_score,fit_label) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  );
  // Precompute the deterministic fit from the FULL JD at sync time so cards can
  // show the label and the pipeline can sort by it (the drawer recomputes live
  // with the lane signal for the detailed panel). No laneSignal here — it's a
  // small dormant nudge and avoids a data.ts↔sync.ts cycle.
  const fitCols = (title: string, url: string, location: string, salary: string, level: string, posted: string): [number, string] => {
    const f = computeFit(
      { title, location, salary, level, posted, liveness: liveness.get(url)?.status ?? null },
      snaps.get(url)?.descriptionHtml ?? "",
    );
    return [f.score, f.overall];
  };
  const insFts = ftsAvailable
    ? sqlite.prepare("INSERT INTO jobs_fts (url,title,company,body) VALUES (?,?,?,?)")
    : null;
  // Index the FULL JD body (not the 280-char preview) so search reaches into
  // responsibilities/qualifications, not just the card summary.
  const indexFts = (url: string, company: string, title: string) => {
    if (!insFts) return;
    insFts.run(url, title, company, plainText(snaps.get(url)?.descriptionHtml, 12_000));
  };
  // sources_count, sources_json, liveness, last_verified, reposted, discovered,
  // date_confidence — keyed by URL.
  const extraCols = (url: string, posted: string): [number, string, string, string | null, number, string, string] => {
    const c = canon.get(url);
    const lv = liveness.get(url);
    const md = meta.get(url);
    return [
      c ? c.sources.length : 1,
      c ? JSON.stringify(c.sources) : "[]",
      lv?.status ?? "unknown",
      lv?.lastVerified ?? null,
      c?.reposted ? 1 : 0,
      md?.discovered ?? "",
      dateConfidence(md?.source ?? "", posted),
    ];
  };
  // Classify experience level from the title + the snapshot's full JD text.
  const levelFor = (title: string, url: string) => classifyLevel(title, plainText(snaps.get(url)?.descriptionHtml));
  // Snapshot fields fall back gracefully: location prefers scan-history then snapshot;
  // apply_url prefers the snapshot's best link then the dedup url.
  const snapCols = (url: string) => {
    const s = snaps.get(url);
    return {
      description: htmlToPreview(s?.descriptionHtml),
      salary: s?.salary ?? "",
      logo: s?.logo ?? "",
      apply_url: s?.applyUrl || url,
      publisher: s?.publisher ?? "",
      location: s?.location ?? "",
    };
  };
  for (const l of readFileSync(f, "utf-8").split("\n")) {
    // Pending:  - [ ] url | company | title | posted YYYY-MM-DD
    let m = l.match(/^- \[ \] (\S+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*(?:\|\s*posted\s*(\S+))?\s*$/);
    if (m) {
      const md = meta.get(m[1]) || { location: "", source: "" };
      const sc = snapCols(m[1]);
      const r = ins.run(
        m[1], m[2], m[3], m[4] ?? "", "pending", null, null,
        md.location || sc.location, md.source || domainOf(m[1]),
        sc.description, sc.salary, sc.logo, sc.apply_url, sc.publisher, levelFor(m[3], m[1]),
        ...extraCols(m[1], m[4] ?? ""),
        ...fitCols(m[3], m[1], md.location || sc.location, sc.salary, levelFor(m[3], m[1]), m[4] ?? ""),
      );
      // Only index FTS when the job row was actually inserted — a duplicate URL
      // is IGNOREd by `jobs` (UNIQUE), so indexing it would double its search hits.
      if (r.changes > 0) indexFts(m[1], m[2], m[3]);
      continue;
    }
    // Processed: - [x] #NNN | url | company | role | score/5 | PDF ...
    m = l.match(/^- \[x\] #(\d+)\s*\|\s*(\S+)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([\d.]+\/5|N\/A)/i);
    if (m) {
      const md = meta.get(m[2]) || { location: "", source: "" };
      const sc = snapCols(m[2]);
      const r = ins.run(
        m[2], m[3], m[4], "", "processed", Number(m[1]), m[5],
        md.location || sc.location, md.source || domainOf(m[2]),
        sc.description, sc.salary, sc.logo, sc.apply_url, sc.publisher, levelFor(m[4], m[2]),
        ...extraCols(m[2], ""),
        ...fitCols(m[4], m[2], md.location || sc.location, sc.salary, levelFor(m[4], m[2]), ""),
      );
      if (r.changes > 0) indexFts(m[2], m[3], m[4]);
      continue;
    }
  }
}

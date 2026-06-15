import "server-only";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sqlite } from "@/db";
import { DATA } from "./paths";
import { syncAll } from "./sync";
import { daysAgo } from "./fresh";
import { parseSalaryAnnualMin } from "./salary";
import { matchesLevel, type Level } from "./level";
import { classifyRole, roleLabel, type RoleFamily } from "./role";

export type App = {
  number: number;
  date: string;
  company: string;
  role: string;
  score: string;
  status: string;
  pdf: string;
  report: string;
  notes: string;
};

export type Job = {
  url: string;
  company: string;
  title: string;
  posted: string;
  state: string;
  report_num: number | null;
  score: string | null;
  location: string | null;
  source: string | null;
  description: string | null;
  salary: string | null;
  logo: string | null;
  apply_url: string | null;
  publisher: string | null;
  level: string | null;
  sources_count: number | null;
  sources_json: string | null;
  liveness: string | null;
  last_verified: string | null;
  reposted: number | null;
  discovered: string | null;
  date_confidence: string | null;
  fit_score: number | null;
  fit_label: string | null;
};

// Re-read the md/TSV source of truth into the SQLite projection. Call ONCE per request.
export function sync() {
  syncAll();
}

export function getApplications(): App[] {
  return sqlite.prepare("SELECT * FROM applications ORDER BY number DESC").all() as App[];
}

// Deterministic "apply first" priority — no API cost. Scores live, in-pipeline
// roles on freshness, pay-in-range, level-fit, and date confidence, and returns
// the reasons so the recommendation is explainable (not one opaque number).
export type RankedJob = { job: Job; score: number; reasons: string[] };

export function getApplyQueue(limit = 8): RankedJob[] {
  const jobs = sqlite
    .prepare("SELECT * FROM jobs WHERE state='pending' AND (liveness IS NULL OR liveness != 'dead')")
    .all() as Job[];

  const ranked = jobs.map((job): RankedJob => {
    let score = 0;
    const reasons: string[] = [];

    const d = daysAgo(job.posted);
    if (d !== null && d <= 3) { score += 3; reasons.push("posted in last 3 days"); }
    else if (d !== null && d <= 7) { score += 2; reasons.push("posted this week"); }
    else if (d !== null && d <= 14) { score += 1; }

    const pay = parseSalaryAnnualMin(job.salary);
    if (pay !== null && pay >= 70_000) { score += 2; reasons.push(`pay from $${Math.round(pay / 1000)}k`); }

    if (matchesLevel((job.level ?? "") as Level, "entry") || matchesLevel((job.level ?? "") as Level, "mid")) {
      score += 1; reasons.push("level fits your lanes");
    }

    if (job.date_confidence === "high") { score += 1; reasons.push("authoritative posting date"); }
    if (job.liveness === "live") { score += 1; reasons.push("verified live"); }

    return { job, score, reasons };
  });

  return ranked
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (b.job.posted || "").localeCompare(a.job.posted || ""))
    .slice(0, limit);
}

// Applications that are out the door but not yet resolved — these need a nudge.
export function getFollowUps(): App[] {
  return (sqlite.prepare("SELECT * FROM applications ORDER BY date DESC").all() as App[]).filter((a) =>
    /applied|aplicad|respond|interview|entrevista|screen/.test((a.status || "").toLowerCase()),
  );
}

// Outcome-learning loop. Aggregates real application outcomes by role-family
// "lane" so ranking can eventually favor what actually converts FOR AMIR. The
// mandate is explicit: never learn blindly from sparse outcomes — every lane
// carries its sample size and an `enough` flag, and the signal stays dormant
// (rate=null) until a lane has MIN_SAMPLE *resolved* applications.
const MIN_SAMPLE = 4; // applications in a lane before its conversion is trusted

export type LaneOutcome = {
  lane: RoleFamily;
  label: string;
  applied: number; // resolved applications in this lane (sent, got an answer or rejection)
  positive: number; // responded / interview / offer
  rate: number | null; // positive/applied, only when `enough`
  enough: boolean;
};

export type Outcomes = {
  lanes: LaneOutcome[];
  totalApplied: number;
  totalPositive: number;
  dataReady: boolean; // any lane has enough to inform ranking
};

const POSITIVE_RE = /respond|interview|entrevista|offer|oferta|screen/;
const RESOLVED_RE = /applied|aplicad|respond|interview|entrevista|offer|oferta|screen|reject|rechaz/;

export function getLaneOutcomes(): Outcomes {
  const apps = sqlite.prepare("SELECT role, status FROM applications").all() as { role: string; status: string }[];
  const byLane = new Map<RoleFamily, { applied: number; positive: number }>();
  for (const a of apps) {
    const status = (a.status || "").toLowerCase();
    if (!RESOLVED_RE.test(status)) continue; // ignore not-yet-sent (evaluated/skip/discarded)
    const lane = classifyRole(a.role || "");
    const cur = byLane.get(lane) || { applied: 0, positive: 0 };
    cur.applied += 1;
    if (POSITIVE_RE.test(status)) cur.positive += 1;
    byLane.set(lane, cur);
  }
  const lanes: LaneOutcome[] = [...byLane.entries()]
    .map(([lane, v]) => ({
      lane,
      label: roleLabel(lane),
      applied: v.applied,
      positive: v.positive,
      enough: v.applied >= MIN_SAMPLE,
      rate: v.applied >= MIN_SAMPLE ? v.positive / v.applied : null,
    }))
    .sort((a, b) => b.applied - a.applied);
  return {
    lanes,
    totalApplied: lanes.reduce((n, l) => n + l.applied, 0),
    totalPositive: lanes.reduce((n, l) => n + l.positive, 0),
    dataReady: lanes.some((l) => l.enough),
  };
}

// Compact lane→rate map for the fit nudge (only lanes with enough data).
export function getLaneSignal(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of getLaneOutcomes().lanes) if (l.enough && l.rate !== null) out[l.lane] = l.rate;
  return out;
}

// Last-visit marker (durable in the meta table) — drives "new since last visit"
// across browsers/devices, unlike the prior localStorage approach.
export function getLastVisit(): number {
  const row = sqlite.prepare("SELECT value FROM meta WHERE key='last_visit'").get() as { value: string } | undefined;
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setLastVisit(ts: number): void {
  sqlite.prepare("INSERT INTO meta (key,value) VALUES ('last_visit',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(ts));
}

// Distribution of the precomputed fit label across the live pipeline.
export function getFitDistribution(): { label: string; count: number }[] {
  const order = ["Apply immediately", "Strong application", "Worth applying", "Stretch but defensible", "Low probability"];
  const rows = sqlite
    .prepare("SELECT fit_label AS label, COUNT(*) AS count FROM jobs WHERE state='pending' AND fit_label IS NOT NULL GROUP BY fit_label")
    .all() as { label: string; count: number }[];
  const map = new Map(rows.map((r) => [r.label, r.count]));
  return order.filter((l) => map.has(l)).map((l) => ({ label: l, count: map.get(l)! }));
}

// Market intelligence — aggregate cross-sectional view of what the market is
// hiring across the corpus, plus a discovery-volume trend from scan runs. The
// honest caveat (like outcome learning): trends need time-series; with only a
// few scans so far, the trend is labeled early.
export type MarketIntel = {
  roleDemand: { label: string; count: number }[];
  compBands: { label: string; count: number }[];
  geoSplit: { label: string; count: number }[];
  discoveryTrend: { date: string; added: number }[];
  withSalary: number;
  total: number;
};

function geoBucket(loc: string): string {
  const l = (loc || "").toLowerCase();
  // Aligned with the engine's NYC detection (location.mjs NYC_RE): city, metro
  // towns, and a NY-state suffix all count as NYC metro.
  if (/new york|nyc|manhattan|brooklyn|queens|jersey city|hoboken|stamford|white plains|, ?ny\b/.test(l)) return "NYC metro";
  if (/chicago|, ?il\b/.test(l)) return "Chicago";
  if (/remote/.test(l) && /\b(us|united states|u\.s|americas)\b/.test(l)) return "Remote-US";
  if (/remote/.test(l)) return "Remote (other)";
  return "Other / onsite";
}

export function getMarketIntel(): MarketIntel {
  const jobs = sqlite.prepare("SELECT title, salary, location FROM jobs WHERE state='pending'").all() as {
    title: string;
    salary: string;
    location: string;
  }[];

  const roleMap = new Map<string, number>();
  const geoMap = new Map<string, number>();
  const bandMap = new Map<string, number>();
  const BANDS: [string, number, number][] = [
    ["< $70k", 0, 70_000],
    ["$70–100k", 70_000, 100_000],
    ["$100–130k", 100_000, 130_000],
    ["$130k+", 130_000, Infinity],
  ];
  let withSalary = 0;
  for (const j of jobs) {
    const r = roleLabel(classifyRole(j.title));
    roleMap.set(r, (roleMap.get(r) || 0) + 1);
    const g = geoBucket(j.location);
    geoMap.set(g, (geoMap.get(g) || 0) + 1);
    const pay = parseSalaryAnnualMin(j.salary);
    if (pay !== null) {
      withSalary++;
      const band = BANDS.find(([, lo, hi]) => pay >= lo && pay < hi);
      if (band) bandMap.set(band[0], (bandMap.get(band[0]) || 0) + 1);
    }
  }

  // Discovery volume per scan run (added column), most recent last.
  const trend: { date: string; added: number }[] = [];
  const f = path.join(DATA, "scan-runs.tsv");
  if (existsSync(f)) {
    for (const line of readFileSync(f, "utf-8").split("\n").slice(1)) {
      const c = line.split("\t");
      if (!c[1]) continue;
      trend.push({ date: c[1], added: Number(c[4]) || 0 });
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return {
    roleDemand: sortDesc(roleMap),
    compBands: BANDS.map(([label]) => ({ label, count: bandMap.get(label) || 0 })),
    geoSplit: sortDesc(geoMap),
    discoveryTrend: trend.slice(-12),
    withSalary,
    total: jobs.length,
  };
}

// In-process source freshness for the command center — reads scan-history.tsv
// directly instead of spawning source-registry.mjs on every home load (the
// full registry still powers /sources). Returns providers not seen in `days`.
export function getStaleSources(days = 21): string[] {
  const f = path.join(DATA, "scan-history.tsv");
  if (!existsSync(f)) return [];
  const lastSeen = new Map<string, string>();
  for (const line of readFileSync(f, "utf-8").split("\n").slice(1)) {
    const c = line.split("\t");
    const provider = (c[2] || "").trim();
    const seen = (c[1] || "").trim();
    if (!provider || !seen) continue;
    if (!lastSeen.has(provider) || seen > lastSeen.get(provider)!) lastSeen.set(provider, seen);
  }
  const stale: string[] = [];
  for (const [provider, seen] of lastSeen) {
    const d = daysAgo(seen);
    if (d !== null && d > days) stale.push(provider.replace(/-api$/, ""));
  }
  return stale;
}

// Company intelligence — aggregate the pipeline + applications by employer.
export type CompanyRow = { company: string; openings: number; fresh: number; applied: number };

export function getCompanies(): CompanyRow[] {
  const rows = sqlite
    .prepare(
      `SELECT j.company AS company,
              COUNT(*) AS openings,
              SUM(CASE WHEN j.liveness='dead' THEN 0 ELSE 1 END) AS live
         FROM jobs j WHERE j.company != '' GROUP BY j.company`,
    )
    .all() as { company: string; openings: number; live: number }[];
  const jobs = sqlite.prepare("SELECT company, posted FROM jobs WHERE company != ''").all() as { company: string; posted: string }[];
  const applied = sqlite.prepare("SELECT company FROM applications").all() as { company: string }[];
  const appliedByCo = new Map<string, number>();
  for (const a of applied) {
    const k = (a.company || "").toLowerCase();
    appliedByCo.set(k, (appliedByCo.get(k) || 0) + 1);
  }
  const freshByCo = new Map<string, number>();
  for (const j of jobs) {
    const d = daysAgo(j.posted);
    if (d !== null && d <= 7) freshByCo.set(j.company, (freshByCo.get(j.company) || 0) + 1);
  }
  return rows
    .map((r) => ({
      company: r.company,
      openings: r.openings,
      fresh: freshByCo.get(r.company) || 0,
      applied: appliedByCo.get(r.company.toLowerCase()) || 0,
    }))
    .sort((a, b) => b.openings - a.openings || a.company.localeCompare(b.company));
}

export type CompanyDetail = {
  company: string;
  openings: Job[];
  roleMix: { role: string; count: number }[];
  sources: string[];
  applications: App[];
};

export function getCompany(name: string): CompanyDetail | null {
  const openings = sqlite
    .prepare("SELECT * FROM jobs WHERE LOWER(company) = LOWER(?) ORDER BY (posted='') ASC, posted DESC")
    .all(name) as Job[];
  const applications = sqlite
    .prepare("SELECT * FROM applications WHERE LOWER(company) = LOWER(?) ORDER BY date DESC")
    .all(name) as App[];
  if (openings.length === 0 && applications.length === 0) return null;
  const company = openings[0]?.company || applications[0]?.company || name;
  const roleCounts = new Map<string, number>();
  for (const j of openings) {
    const r = roleLabel(classifyRole(j.title));
    roleCounts.set(r, (roleCounts.get(r) || 0) + 1);
  }
  const sources = [...new Set(openings.map((j) => j.source).filter(Boolean) as string[])];
  return {
    company,
    openings,
    roleMix: [...roleCounts.entries()].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count),
    sources,
    applications,
  };
}

export function getPipeline(state: "pending" | "processed" | "all" = "pending"): Job[] {
  if (state === "all") {
    return sqlite.prepare("SELECT * FROM jobs ORDER BY (posted='') ASC, posted DESC").all() as Job[];
  }
  return sqlite
    .prepare("SELECT * FROM jobs WHERE state = ? ORDER BY (posted='') ASC, posted DESC")
    .all(state) as Job[];
}

export type Stats = {
  totalApps: number;
  pending: number;
  freshWeek: number;
  interviewing: number;
  offers: number;
  avgScore: number | null;
  responseRate: number | null;
};

const norm = (s: string) => (s || "").toLowerCase();

export function getStats(): Stats {
  const apps = sqlite.prepare("SELECT status, score FROM applications").all() as {
    status: string;
    score: string;
  }[];
  const jobs = sqlite.prepare("SELECT posted FROM jobs WHERE state='pending'").all() as {
    posted: string;
  }[];

  const interviewing = apps.filter((a) => /interview|entrevista/.test(norm(a.status))).length;
  const offers = apps.filter((a) => /offer/.test(norm(a.status))).length;
  const applied = apps.filter((a) =>
    /applied|aplicado|interview|entrevista|offer|reject|descart/.test(norm(a.status)),
  ).length;
  const scores = apps.map((a) => parseFloat(a.score)).filter((n) => !isNaN(n));
  const avgScore = scores.length ? scores.reduce((x, y) => x + y, 0) / scores.length : null;
  const freshWeek = jobs.filter((j) => {
    const d = daysAgo(j.posted);
    return d !== null && d <= 7;
  }).length;

  return {
    totalApps: apps.length,
    pending: jobs.length,
    freshWeek,
    interviewing,
    offers,
    avgScore,
    responseRate: applied ? (interviewing + offers) / applied : null,
  };
}

export function getStatusDistribution(): { status: string; count: number }[] {
  return sqlite
    .prepare("SELECT status, COUNT(*) as count FROM applications GROUP BY status ORDER BY count DESC")
    .all() as { status: string; count: number }[];
}

export function getFreshnessBuckets(): { label: string; count: number }[] {
  const jobs = getPipeline("pending");
  const b = [
    { label: "≤ 7 days", count: 0 },
    { label: "8–30 days", count: 0 },
    { label: "31–90 days", count: 0 },
    { label: "> 90 days", count: 0 },
    { label: "no date", count: 0 },
  ];
  for (const j of jobs) {
    const d = daysAgo(j.posted);
    if (d === null) b[4].count++;
    else if (d <= 7) b[0].count++;
    else if (d <= 30) b[1].count++;
    else if (d <= 90) b[2].count++;
    else b[3].count++;
  }
  return b;
}

export function getTopCompanies(limit = 8): { company: string; count: number }[] {
  return sqlite
    .prepare(
      "SELECT company, COUNT(*) as count FROM jobs WHERE state='pending' AND company != '' GROUP BY company ORDER BY count DESC LIMIT ?",
    )
    .all(limit) as { company: string; count: number }[];
}

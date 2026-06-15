import "server-only";
import { sqlite } from "@/db";
import { syncAll } from "./sync";
import { daysAgo } from "./fresh";

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
};

// Re-read the md/TSV source of truth into the SQLite projection. Call ONCE per request.
export function sync() {
  syncAll();
}

export function getApplications(): App[] {
  return sqlite.prepare("SELECT * FROM applications ORDER BY number DESC").all() as App[];
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

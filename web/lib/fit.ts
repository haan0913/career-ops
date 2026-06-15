// Deterministic, explainable fit/winnability — NO API cost. Breaks a role into
// separate scored components (role, level, location, comp, freshness, liveness,
// evidence) with notes, a calibrated overall label, and concrete concerns,
// grounded in Amir's real target archetypes + proof points from modes/_profile.md.
//
// This is the visible counterpart to getApplyQueue()'s ranking: the queue says
// WHAT to do first; this says WHY, and what to watch out for.

import { classifyRole, type RoleFamily } from "./role";
import { classifyLevel, levelRank, type Level } from "./level";
import { parseSalaryAnnualMin } from "./salary";
import { daysAgo } from "./fresh";

const SALARY_FLOOR = 70_000;

// Amir's target archetypes (modes/_profile.md) → role families our classifier emits.
const TARGET_ROLES: RoleFamily[] = ["project", "operations", "analyst", "product"];

// Proof-point themes from the profile/cv. A JD hitting these is winnable evidence.
const PROOF_THEMES: { theme: string; re: RegExp }[] = [
  { theme: "PMO / portfolio governance", re: /\b(pmo|portfolio|raid|steering|governance|go[-/ ]?no[-/ ]?go|project lifecycle|plc|status report|milestone)\b/i },
  { theme: "implementation / onboarding", re: /\b(implementation|onboard|go[-/ ]?live|rollout|roll-out|deployment|configuration|sop|standard operating)\b/i },
  { theme: "requirements / UAT / controls", re: /\b(requirements?|current state|future state|traceability|uat|user acceptance|reconciliation|controls|test case|process improvement)\b/i },
  { theme: "stakeholder / cross-functional", re: /\b(stakeholder|cross[- ]functional|coordination|dependenc|risk management|intake)\b/i },
  { theme: "AI enablement / automation", re: /\b(ai adoption|ai enablement|automation|change management|llm|workflow automation)\b/i },
  { theme: "reporting / BI tooling", re: /\b(power bi|power pivot|dashboard|tableau|\bsql\b|jira|confluence|agile|scrum|excel)\b/i },
  { theme: "financial-services domain", re: /\b(clearing|settlement|sec rule|10b-10|trade|securities|capital markets|fintech|banking|payments)\b/i },
];

export type FitComponent = { key: string; label: string; tone: "good" | "ok" | "warn"; note: string };

export type FitAnalysis = {
  overall: string; // calibrated label
  tone: "good" | "ok" | "warn";
  score: number; // 0..100 (rough)
  components: FitComponent[];
  evidence: string[]; // matched proof themes
  concerns: string[];
  degree: "flexible" | "strict" | "unstated";
};

function plain(htmlOrText: string): string {
  return String(htmlOrText || "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ");
}

function locationFit(loc: string): FitComponent {
  const l = (loc || "").toLowerCase();
  if (/new york|nyc|manhattan|brooklyn|jersey city/.test(l)) return { key: "location", label: "Location", tone: "good", note: "NYC metro — your primary lane" };
  if (/chicago/.test(l)) return { key: "location", label: "Location", tone: "good", note: "Chicago — a target lane" };
  if (/remote/.test(l) && /\b(us|united states|u\.s)\b/.test(l)) return { key: "location", label: "Location", tone: "good", note: "Remote-US — a target lane" };
  if (/remote/.test(l)) return { key: "location", label: "Location", tone: "ok", note: "Remote — confirm it's US-eligible" };
  if (!l) return { key: "location", label: "Location", tone: "ok", note: "Location not stated" };
  return { key: "location", label: "Location", tone: "warn", note: `${loc} — outside your lanes` };
}

function degreeFlexibility(text: string): FitAnalysis["degree"] {
  const t = text.toLowerCase();
  if (/\bor equivalent\b|equivalent (work )?experience|in lieu of a degree|degree or relevant experience/.test(t)) return "flexible";
  if (/\b(bachelor'?s?|ba\/bs|b\.s\.|b\.a\.|undergraduate degree|4-year degree)\b[^.]{0,40}\b(required|must|minimum)\b/.test(t) ||
      /\b(required|must have)\b[^.]{0,40}\b(bachelor'?s?|degree)\b/.test(t)) return "strict";
  return "unstated";
}

export function computeFit(job: {
  title: string;
  location?: string | null;
  salary?: string | null;
  level?: string | null;
  posted?: string | null;
  liveness?: string | null;
}, jdHtml?: string | null): FitAnalysis {
  const text = plain(jdHtml || "");
  const components: FitComponent[] = [];
  const concerns: string[] = [];
  let score = 0;

  // Role
  const role = classifyRole(job.title);
  if (TARGET_ROLES.includes(role)) { components.push({ key: "role", label: "Role fit", tone: "good", note: `${role} — matches a target archetype` }); score += 25; }
  else { components.push({ key: "role", label: "Role fit", tone: "warn", note: `${role} — outside your five archetypes` }); concerns.push("role is outside your target archetypes"); score += 5; }

  // Level
  const level = (job.level as Level) || classifyLevel(job.title);
  if (levelRank(level) <= levelRank("mid")) { components.push({ key: "level", label: "Level", tone: "good", note: `${level} — best-converting band` }); score += 20; }
  else if (level === "senior") { components.push({ key: "level", label: "Level", tone: "warn", note: "senior — a reach per your profile" }); concerns.push("senior-level: treat as a low-probability reach"); score += 5; }
  else if (levelRank(level) > levelRank("senior")) { components.push({ key: "level", label: "Level", tone: "warn", note: `${level} — above your lanes` }); concerns.push(`${level}-level: above your target band`); }
  else { components.push({ key: "level", label: "Level", tone: "ok", note: `${level}` }); score += 12; }

  // Location
  const locC = locationFit(job.location || "");
  components.push(locC);
  if (locC.tone === "good") score += 15; else if (locC.tone === "ok") score += 8; else concerns.push("location is outside NYC / Remote-US / Chicago");

  // Comp
  const pay = parseSalaryAnnualMin(job.salary);
  if (pay === null) components.push({ key: "comp", label: "Comp", tone: "ok", note: "not stated — verify against your $70k floor" });
  else if (pay >= SALARY_FLOOR) { components.push({ key: "comp", label: "Comp", tone: "good", note: `from $${Math.round(pay / 1000)}k — at/above your floor` }); score += 10; }
  else { components.push({ key: "comp", label: "Comp", tone: "warn", note: `from $${Math.round(pay / 1000)}k — below your $70k floor` }); concerns.push("posted pay is below your $70k floor"); }

  // Freshness
  const d = daysAgo(job.posted || "");
  if (d !== null && d <= 7) { components.push({ key: "fresh", label: "Freshness", tone: "good", note: d <= 1 ? "posted today" : `${d}d old` }); score += 8; }
  else if (d !== null && d <= 30) { components.push({ key: "fresh", label: "Freshness", tone: "ok", note: `${d}d old` }); score += 3; }
  else if (d !== null) { components.push({ key: "fresh", label: "Freshness", tone: "warn", note: `${d}d old — may be stale` }); }

  // Liveness
  if (job.liveness === "dead") { components.push({ key: "live", label: "Liveness", tone: "warn", note: "closed — verify before applying" }); concerns.push("listing appears closed"); }
  else if (job.liveness === "live") { components.push({ key: "live", label: "Liveness", tone: "good", note: "verified live" }); score += 5; }

  // Evidence — matched proof themes
  const evidence = PROOF_THEMES.filter((p) => p.re.test(text)).map((p) => p.theme);
  if (evidence.length >= 3) score += 12;
  else if (evidence.length >= 1) score += 6;

  // Degree flexibility (important: Amir has no bachelor's)
  const degree = degreeFlexibility(text);
  if (degree === "strict") concerns.push("appears to strictly require a bachelor's — you have a Year Up cert + coursework");

  score = Math.max(0, Math.min(100, score));
  let overall: string, tone: FitAnalysis["tone"];
  // Hard blocks knock a role out of the "apply now" tiers entirely.
  const hardBlock = job.liveness === "dead" || concerns.some((c) => c.includes("below your $70k") || c.includes("above your target"));
  // Soft cap: a senior reach (per the profile, "Senior… low-probability reaches")
  // can still be worth a tailored shot, but never reads as "Apply immediately".
  const seniorReach = concerns.some((c) => c.includes("low-probability reach"));
  if (score >= 70 && !hardBlock && !seniorReach) { overall = "Apply immediately"; tone = "good"; }
  else if (score >= 55 && !hardBlock && !seniorReach) { overall = "Strong application"; tone = "good"; }
  else if (score >= 42 || (seniorReach && score >= 55)) { overall = seniorReach ? "Stretch but defensible" : "Worth applying"; tone = "ok"; }
  else if (score >= 28) { overall = "Stretch but defensible"; tone = "ok"; }
  else { overall = "Low probability"; tone = "warn"; }

  return { overall, tone, score, components, evidence, concerns, degree };
}

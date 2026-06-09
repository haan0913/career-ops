// Experience-level (seniority) classifier — pure, deterministic, zero-token.
// Safe in both server and client components. Derives a level from a role's title
// (primary signal) and, as a fallback, the years-of-experience stated in its JD.

export type Level =
  | "intern"
  | "entry"
  | "mid"
  | "senior"
  | "lead"
  | "manager"
  | "director"
  | "exec"
  | "";

// Low → high. Used for ordering, the "Lead+" grouping, and target-level matching.
export const LEVEL_ORDER: Level[] = ["intern", "entry", "mid", "senior", "lead", "manager", "director", "exec"];

export function levelRank(l: Level): number {
  const i = LEVEL_ORDER.indexOf(l);
  return i === -1 ? 2 : i; // unknown ≈ mid
}

const LABELS: Record<Level, string> = {
  intern: "Intern",
  entry: "Entry",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
  manager: "Manager",
  director: "Director",
  exec: "Exec",
  "": "",
};
export function levelLabel(l: Level): string {
  return LABELS[l] || "";
}

export function levelTone(l: Level): string {
  switch (l) {
    case "intern":
    case "entry":
      return "text-sky-300 bg-sky-500/10 ring-sky-500/20";
    case "mid":
      return "text-emerald-300 bg-emerald-500/10 ring-emerald-500/20";
    case "senior":
      return "text-amber-300 bg-amber-500/10 ring-amber-500/20";
    case "lead":
    case "manager":
    case "director":
    case "exec":
      return "text-rose-300 bg-rose-500/10 ring-rose-500/20";
    default:
      return "text-zinc-400 bg-white/[0.04] ring-white/10";
  }
}

// "Project/Product/Program Manager" etc. are role FAMILIES, not managerial
// seniority — the word "manager" here must not push the role to director-track.
const ROLE_FAMILY_MANAGER =
  /\b(project|product|program|account|engagement|case|community|office|social media|marketing|brand|category|product marketing|portfolio|delivery|relationship|partner|vendor|store|general|content|growth|operations|implementation|customer success|hr|talent|people)\s+manager(s)?\b/;

// Pull the minimum stated years-of-experience from JD text → a level band.
function yearsSignal(text?: string): Level | "" {
  if (!text) return "";
  const m = text
    .toLowerCase()
    .match(/(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*\d{0,2}\s*years?(?:\s+of)?\s+(?:experience|exp|relevant|professional|industry)/);
  if (!m) return "";
  const y = parseInt(m[1], 10);
  if (!Number.isFinite(y)) return "";
  if (y <= 1) return "entry";
  if (y <= 4) return "mid";
  if (y <= 7) return "senior";
  return "lead";
}

// Classify a role. `title` is the strong signal; `desc` (plain text) is a fallback.
export function classifyLevel(title: string, desc?: string): Level {
  const t = " " + String(title || "").toLowerCase().replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim() + " ";

  // Executive
  if (/\b(chief|ceo|cfo|cto|coo|cmo|cpo|cio|ciso|cxo|president)\b/.test(t)) return "exec";
  // Director / VP
  if (/\b(svp|evp|vp|vice president|head of|director)\b/.test(t)) return "director";
  // Roman-numeral level markers (Analyst II, Engineer III)
  if (/\b(iv|iii)\b/.test(t)) return "senior";
  // Senior
  if (/\b(senior|sr|snr)\b/.test(t)) return "senior";
  // Lead / Principal / Staff
  if (/\b(principal|staff|lead)\b/.test(t)) return "lead";
  // People-manager — but ONLY when "manager" isn't part of a role-family title
  if (/\bmanager\b/.test(t) && !ROLE_FAMILY_MANAGER.test(t)) return "manager";
  // Intern
  if (/\b(intern|internship|co op|coop|apprentice|trainee|fellow)\b/.test(t)) return "intern";
  // Mid roman-numeral
  if (/\bii\b/.test(t)) return "mid";
  // Entry signals
  if (/\b(entry level|entry|junior|jr|new grad|graduate|associate|assistant|coordinator|i)\b/.test(t)) return "entry";

  // Fall back to the JD's stated years-of-experience, else assume mid.
  return yearsSignal(desc) || "mid";
}

// Filter match. The "lead" filter bucket is inclusive of lead/manager/director/exec
// (everything at or above lead), matching how a job-seeker thinks about "senior+".
export function matchesLevel(level: Level, filter: Level | "all" | "leadplus"): boolean {
  if (filter === "all") return true;
  if (filter === "leadplus") return levelRank(level) >= levelRank("lead");
  return level === filter;
}

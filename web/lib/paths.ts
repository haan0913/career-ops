import path from "path";

// The dashboard lives in <career-ops>/web, so the repo root is one level up.
// Override with CAREER_OPS_ROOT if running the dashboard from elsewhere.
export const ROOT = process.env.CAREER_OPS_ROOT
  ? path.resolve(process.env.CAREER_OPS_ROOT)
  : path.resolve(process.cwd(), "..");

export const DATA = path.join(ROOT, "data");
export const REPORTS = path.join(ROOT, "reports");
export const BATCH_ADDITIONS = path.join(ROOT, "batch", "tracker-additions");

// SQLite is a rebuildable projection over the md/TSV source of truth — local to web/.
export const DB_PATH = path.join(process.cwd(), "career-ops.db");

import "server-only";
import Database from "better-sqlite3";
import { DB_PATH } from "@/lib/paths";

// Local SQLite — a rebuildable PROJECTION over the markdown/TSV source of truth.
// Single-user, local-first: no sync engine needed.
export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number INTEGER, date TEXT, company TEXT, role TEXT,
    score TEXT, status TEXT, pdf TEXT, report TEXT, notes TEXT
  );
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE, company TEXT, title TEXT, posted TEXT,
    state TEXT, report_num INTEGER, score TEXT
  );
`);

// Additive migrations — older projection files predate these columns.
for (const col of [
  "location TEXT",
  "source TEXT",
  "description TEXT", // JD preview text (from the snapshot store)
  "salary TEXT",
  "logo TEXT",
  "apply_url TEXT", // best apply link (may differ from the dedup url)
  "publisher TEXT", // "via LinkedIn" etc.
  "level TEXT", // experience level classified from title + JD (intern…exec)
  "sources_count INTEGER", // canonical entity store: how many sources carry this job
  "sources_json TEXT", // [{source,url,seen}] from data/jobs.jsonl for the drawer
]) {
  try {
    sqlite.exec(`ALTER TABLE jobs ADD COLUMN ${col}`);
  } catch {
    /* column already exists */
  }
}
